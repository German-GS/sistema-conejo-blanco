import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { CuentaContable } from './cuenta-contable.entity.js';
import { AsientoContable } from './asiento-contable.entity.js';
import { NaturalezaCuenta, TipoCuentaContable } from '../common/enums/tipo-cuenta-contable.enum.js';
import { redondear } from '../common/utils/dinero.util.js';

type TipoColumna = 'texto' | 'moneda';
export interface Reporte {
  titulo: string;
  descripcion: string;
  columnas: Array<{ clave: string; etiqueta: string; tipo: TipoColumna }>;
  // _estilo: 'titulo' (encabezado de sección), 'subtotal' o 'total' para resaltar la fila.
  filas: Array<Record<string, string | number>>;
  totales?: Record<string, number>;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function validarFecha(valor: string | undefined, nombre: string): string {
  if (!valor || !FECHA.test(valor)) throw new BadRequestException(`Indique la fecha ${nombre} (YYYY-MM-DD).`);
  return valor;
}

interface Saldo {
  cuenta: CuentaContable;
  debe: number;
  haber: number;
  // Saldo según la naturaleza de la cuenta (positivo = normal).
  saldo: number;
}

@Injectable()
export class ReportesContablesService {
  constructor(
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    @InjectRepository(AsientoContable)
    private readonly asientoRepo: Repository<AsientoContable>,
    private readonly dataSource: DataSource,
  ) {}

  // Débitos y créditos por cuenta en un rango de fechas.
  // `sinCierreFiscal`: para el estado de resultados, que no debe verse saldado por el asiento de cierre.
  private async saldos(desde: string | null, hasta: string, sinCierreFiscal = false): Promise<Saldo[]> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('l.cuenta_id', 'cuentaId')
      .addSelect('COALESCE(SUM(l.debe), 0)', 'debe')
      .addSelect('COALESCE(SUM(l.haber), 0)', 'haber')
      .from('lineas_asiento', 'l')
      .innerJoin('asientos_contables', 'a', 'a.id = l.asiento_id')
      .where('a.fecha <= :hasta', { hasta })
      .groupBy('l.cuenta_id');
    if (desde) qb.andWhere('a.fecha >= :desde', { desde });
    if (sinCierreFiscal) {
      qb.andWhere(
        "NOT (a.origen_tipo = 'cierre_fiscal' OR (a.origen_tipo = 'reversa' AND a.origen_id IN (SELECT id FROM asientos_contables WHERE origen_tipo = 'cierre_fiscal')))",
      );
    }
    const filas = await qb.getRawMany<{ cuentaId: string; debe: string; haber: string }>();
    const movs = new Map(filas.map((f) => [f.cuentaId, f]));
    const cuentas = await this.cuentaRepo.find({ order: { codigo: 'ASC' } });
    return cuentas.map((cuenta) => {
      const m = movs.get(cuenta.id);
      const debe = Number(m?.debe ?? 0);
      const haber = Number(m?.haber ?? 0);
      return { cuenta, debe, haber, saldo: redondear(cuenta.naturaleza === NaturalezaCuenta.DEUDORA ? debe - haber : haber - debe) };
    });
  }

  async balanceComprobacion(hasta: string): Promise<Reporte> {
    validarFecha(hasta, 'hasta');
    const saldos = (await this.saldos(null, hasta)).filter((s) => s.debe !== 0 || s.haber !== 0);
    const filas = saldos.map((s) => {
      const neto = redondear(s.debe - s.haber);
      return {
        codigo: s.cuenta.codigo,
        cuenta: s.cuenta.nombre,
        debe: redondear(s.debe),
        haber: redondear(s.haber),
        saldoDeudor: neto > 0 ? neto : 0,
        saldoAcreedor: neto < 0 ? -neto : 0,
      };
    });
    const suma = (k: string) => redondear(filas.reduce((a, f) => a + Number(f[k as keyof typeof f]), 0));
    return {
      titulo: 'Balance de comprobación',
      descripcion: `Débitos, créditos y saldo de cada cuenta al ${hasta}. Si el sistema está bien, los totales de débitos y créditos son iguales.`,
      columnas: [
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto' },
        { clave: 'cuenta', etiqueta: 'Cuenta', tipo: 'texto' },
        { clave: 'debe', etiqueta: 'Débitos', tipo: 'moneda' },
        { clave: 'haber', etiqueta: 'Créditos', tipo: 'moneda' },
        { clave: 'saldoDeudor', etiqueta: 'Saldo deudor', tipo: 'moneda' },
        { clave: 'saldoAcreedor', etiqueta: 'Saldo acreedor', tipo: 'moneda' },
      ],
      filas,
      totales: { debe: suma('debe'), haber: suma('haber'), saldoDeudor: suma('saldoDeudor'), saldoAcreedor: suma('saldoAcreedor') },
    };
  }

  private seccion(titulo: string, cuentas: Saldo[], signo = 1) {
    const filas: Array<Record<string, string | number>> = [{ concepto: titulo, monto: '', _estilo: 'titulo' }];
    let total = 0;
    for (const s of cuentas) {
      if (s.saldo === 0) continue;
      filas.push({ concepto: `${s.cuenta.codigo}  ${s.cuenta.nombre}`, monto: redondear(s.saldo * signo) });
      total += s.saldo * signo;
    }
    return { filas, total: redondear(total) };
  }

  // Estado de resultados: ingresos − costos − gastos del período.
  async estadoResultados(desde: string, hasta: string): Promise<Reporte> {
    validarFecha(desde, 'desde');
    validarFecha(hasta, 'hasta');
    const saldos = await this.saldos(desde, hasta, true);
    const ingresos = saldos.filter((s) => s.cuenta.tipo === TipoCuentaContable.INGRESO);
    const gastos = saldos.filter((s) => s.cuenta.tipo === TipoCuentaContable.GASTO);
    const costos = gastos.filter((s) => s.cuenta.codigo >= '5100' && s.cuenta.codigo < '5200');
    const operativos = gastos.filter((s) => !(s.cuenta.codigo >= '5100' && s.cuenta.codigo < '5200'));

    const ing = this.seccion('Ingresos', ingresos);
    const cos = this.seccion('Costo de ventas', costos);
    const ope = this.seccion('Gastos de operación', operativos);
    const utilidadBruta = redondear(ing.total - cos.total);
    const utilidadNeta = redondear(utilidadBruta - ope.total);

    return {
      titulo: 'Estado de resultados',
      descripcion: `Ingresos, costos y gastos del ${desde} al ${hasta}.`,
      columnas: [
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'monto', etiqueta: 'Monto', tipo: 'moneda' },
      ],
      filas: [
        ...ing.filas,
        { concepto: 'Total ingresos', monto: ing.total, _estilo: 'subtotal' },
        ...cos.filas,
        { concepto: 'Total costo de ventas', monto: cos.total, _estilo: 'subtotal' },
        { concepto: 'UTILIDAD BRUTA', monto: utilidadBruta, _estilo: 'total' },
        ...ope.filas,
        { concepto: 'Total gastos de operación', monto: ope.total, _estilo: 'subtotal' },
        { concepto: utilidadNeta >= 0 ? 'UTILIDAD NETA DEL PERÍODO' : 'PÉRDIDA NETA DEL PERÍODO', monto: utilidadNeta, _estilo: 'total' },
      ],
    };
  }

  // Balance general: activos = pasivos + patrimonio (la utilidad del
  // período acumulada se suma al patrimonio porque no hay cierre contable).
  async balanceGeneral(hasta: string): Promise<Reporte> {
    validarFecha(hasta, 'hasta');
    const saldos = await this.saldos(null, hasta);
    const de = (t: TipoCuentaContable) => saldos.filter((s) => s.cuenta.tipo === t);
    const act = this.seccion('Activos', de(TipoCuentaContable.ACTIVO));
    const pas = this.seccion('Pasivos', de(TipoCuentaContable.PASIVO));
    const pat = this.seccion('Patrimonio', de(TipoCuentaContable.PATRIMONIO));
    const ingresos = redondear(de(TipoCuentaContable.INGRESO).reduce((a, s) => a + s.saldo, 0));
    const gastos = redondear(de(TipoCuentaContable.GASTO).reduce((a, s) => a + s.saldo, 0));
    const utilidad = redondear(ingresos - gastos);
    const patrimonioTotal = redondear(pat.total + utilidad);
    const pasivoMasPatrimonio = redondear(pas.total + patrimonioTotal);

    return {
      titulo: 'Balance general',
      descripcion: `Situación de la empresa al ${hasta}: lo que tiene (activos), lo que debe (pasivos) y lo que es de los socios (patrimonio).`,
      columnas: [
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'monto', etiqueta: 'Monto', tipo: 'moneda' },
      ],
      filas: [
        ...act.filas,
        { concepto: 'TOTAL ACTIVOS', monto: act.total, _estilo: 'total' },
        ...pas.filas,
        { concepto: 'Total pasivos', monto: pas.total, _estilo: 'subtotal' },
        ...pat.filas,
        { concepto: utilidad >= 0 ? 'Utilidad del período (sin cerrar)' : 'Pérdida del período (sin cerrar)', monto: utilidad },
        { concepto: 'Total patrimonio', monto: patrimonioTotal, _estilo: 'subtotal' },
        { concepto: 'TOTAL PASIVOS + PATRIMONIO', monto: pasivoMasPatrimonio, _estilo: 'total' },
        ...(Math.abs(act.total - pasivoMasPatrimonio) > 0.01
          ? [{ concepto: `⚠ Diferencia entre activos y pasivos + patrimonio: ${redondear(act.total - pasivoMasPatrimonio)} (falta registrar el capital inicial o saldos iniciales)`, monto: '', _estilo: 'titulo' }]
          : []),
      ],
    };
  }

  // Movimientos de una cuenta con saldo corrido.
  async mayor(cuentaId: string, desde: string, hasta: string): Promise<Reporte> {
    validarFecha(desde, 'desde');
    validarFecha(hasta, 'hasta');
    const cuenta = await this.cuentaRepo.findOneBy({ id: cuentaId });
    if (!cuenta) throw new NotFoundException('La cuenta no existe.');
    const deudora = cuenta.naturaleza === NaturalezaCuenta.DEUDORA;

    const previo = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(l.debe), 0)', 'debe')
      .addSelect('COALESCE(SUM(l.haber), 0)', 'haber')
      .from('lineas_asiento', 'l')
      .innerJoin('asientos_contables', 'a', 'a.id = l.asiento_id')
      .where('l.cuenta_id = :cuentaId AND a.fecha < :desde', { cuentaId, desde })
      .getRawOne<{ debe: string; haber: string }>();
    let saldo = redondear(deudora ? Number(previo?.debe) - Number(previo?.haber) : Number(previo?.haber) - Number(previo?.debe));

    const movs = await this.dataSource
      .createQueryBuilder()
      .select(['a.fecha AS fecha', 'a.descripcion AS descripcion', 'l.debe AS debe', 'l.haber AS haber'])
      .from('lineas_asiento', 'l')
      .innerJoin('asientos_contables', 'a', 'a.id = l.asiento_id')
      .where('l.cuenta_id = :cuentaId AND a.fecha BETWEEN :desde AND :hasta', { cuentaId, desde, hasta })
      .orderBy('a.fecha', 'ASC')
      .addOrderBy('a.creado_en', 'ASC')
      .getRawMany<{ fecha: string | Date; descripcion: string; debe: string; haber: string }>();

    const filas: Array<Record<string, string | number>> = [
      { fecha: desde, descripcion: 'Saldo inicial', debe: '', haber: '', saldo, _estilo: 'subtotal' },
    ];
    let totalDebe = 0;
    let totalHaber = 0;
    for (const m of movs) {
      const debe = Number(m.debe);
      const haber = Number(m.haber);
      saldo = redondear(saldo + (deudora ? debe - haber : haber - debe));
      totalDebe += debe;
      totalHaber += haber;
      const fecha = m.fecha instanceof Date ? m.fecha.toISOString().slice(0, 10) : String(m.fecha).slice(0, 10);
      filas.push({ fecha, descripcion: m.descripcion, debe, haber, saldo });
    }
    return {
      titulo: `Libro mayor — ${cuenta.codigo} ${cuenta.nombre}`,
      descripcion: `Movimientos del ${desde} al ${hasta}. Cuenta ${deudora ? 'deudora' : 'acreedora'}: el saldo ${deudora ? 'sube con débitos' : 'sube con créditos'}.`,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
        { clave: 'debe', etiqueta: 'Débito', tipo: 'moneda' },
        { clave: 'haber', etiqueta: 'Crédito', tipo: 'moneda' },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'moneda' },
      ],
      filas,
      totales: { debe: redondear(totalDebe), haber: redondear(totalHaber), saldo },
    };
  }

  // Libro diario: asientos del rango con sus líneas.
  async diario(desde: string, hasta: string) {
    validarFecha(desde, 'desde');
    validarFecha(hasta, 'hasta');
    const asientos = await this.asientoRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.lineas', 'l')
      .leftJoinAndSelect('l.cuenta', 'c')
      .where('a.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('a.fecha', 'DESC')
      .addOrderBy('a.numero', 'DESC')
      .take(1000)
      .getMany();
    const reversados = new Set(
      (await this.asientoRepo.find({ where: { origenTipo: 'reversa' }, select: { origenId: true } })).map((a) => a.origenId),
    );
    return asientos.map((a) => ({
      id: a.id,
      numero: a.numero,
      fecha: a.fecha,
      descripcion: a.descripcion,
      origenTipo: a.origenTipo,
      reversado: reversados.has(a.id),
      lineas: a.lineas.map((l) => ({ codigo: l.cuenta.codigo, cuenta: l.cuenta.nombre, debe: Number(l.debe), haber: Number(l.haber) })),
    }));
  }

  async generar(tipo: string, q: { desde?: string; hasta?: string; cuentaId?: string }): Promise<Reporte> {
    switch (tipo) {
      case 'balance-comprobacion':
        return this.balanceComprobacion(q.hasta ?? '');
      case 'estado-resultados':
        return this.estadoResultados(q.desde ?? '', q.hasta ?? '');
      case 'balance-general':
        return this.balanceGeneral(q.hasta ?? '');
      case 'mayor':
        if (!q.cuentaId) throw new BadRequestException('Elija la cuenta.');
        return this.mayor(q.cuentaId, q.desde ?? '', q.hasta ?? '');
      default:
        throw new NotFoundException('Ese reporte no existe.');
    }
  }

  async exportar(tipo: string, q: { desde?: string; hasta?: string; cuentaId?: string }): Promise<Buffer> {
    const r = await this.generar(tipo, q);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet(r.titulo.slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
    hoja.addRow([r.titulo]).font = { bold: true, size: 13 };
    hoja.addRow([r.descripcion]);
    hoja.addRow([]);
    hoja.addRow(r.columnas.map((c) => c.etiqueta)).font = { bold: true };
    for (const f of r.filas) {
      const fila = hoja.addRow(r.columnas.map((c) => f[c.clave] ?? ''));
      if (f._estilo) fila.font = { bold: true };
    }
    if (r.totales) {
      hoja.addRow(r.columnas.map((c, i) => (i === 0 ? 'TOTAL' : (r.totales![c.clave] ?? '')))).font = { bold: true };
    }
    r.columnas.forEach((c, i) => {
      const col = hoja.getColumn(i + 1);
      col.width = c.tipo === 'texto' ? 46 : 18;
      if (c.tipo === 'moneda') col.numFmt = '#,##0.00';
    });
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
