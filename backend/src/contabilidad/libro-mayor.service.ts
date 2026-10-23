import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { construirCuentaMayor, type CuentaMayor } from './libro-mayor.js';
import { redondear } from '../common/utils/dinero.util.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface LibroMayor {
  desde: string;
  hasta: string;
  cuentas: CuentaMayor[];
  // Totales de todo lo mostrado: en un mayor completo, débitos = créditos.
  totales: { debe: number; haber: number };
  cuadra: boolean;
}

const ETIQUETA_ORIGEN: Record<string, string> = {
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  pago_recibido: 'Recibo de caja',
  planilla: 'Planilla',
  planilla_pago: 'Pago de planilla',
  deuda_empleado: 'Deuda de empleado',
  deuda_empleado_baja: 'Baja de préstamo',
  cierre_mensual: 'Cierre mensual',
  cierre_fiscal: 'Cierre fiscal',
  cierre_fiscal_impuesto: 'Impuesto de renta',
  manual: 'Manual',
  reversa: 'Reversa',
};
export const etiquetaOrigen = (o: string | null) => (o ? (ETIQUETA_ORIGEN[o] ?? o) : '');

@Injectable()
export class LibroMayorService {
  constructor(private readonly dataSource: DataSource) {}

  // Libro mayor de una cuenta o de todas las que tengan saldo o movimientos
  // en el período. Los movimientos van ordenados por fecha y, dentro del mismo
  // día, por número de asiento — el mismo orden del libro diario.
  async generar(desde: string, hasta: string, cuentaId?: string): Promise<LibroMayor> {
    if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new BadRequestException('Indique las fechas desde y hasta (YYYY-MM-DD).');
    if (desde > hasta) throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');

    const cuentas: Array<{ id: string; codigo: string; nombre: string; tipo: string; naturaleza: 'deudora' | 'acreedora' }> =
      await this.dataSource.query(
        `SELECT id, codigo, nombre, tipo, naturaleza FROM cuentas_contables ${cuentaId ? 'WHERE id = $1' : ''} ORDER BY codigo`,
        cuentaId ? [cuentaId] : [],
      );
    if (cuentaId && cuentas.length === 0) throw new NotFoundException('La cuenta no existe.');

    const previos: Array<{ cuenta_id: string; debe: string; haber: string }> = await this.dataSource.query(
      `SELECT l.cuenta_id, SUM(l.debe::numeric) AS debe, SUM(l.haber::numeric) AS haber
       FROM lineas_asiento l JOIN asientos_contables a ON a.id = l.asiento_id
       WHERE a.fecha < $1 ${cuentaId ? 'AND l.cuenta_id = $2' : ''} GROUP BY l.cuenta_id`,
      cuentaId ? [desde, cuentaId] : [desde],
    );
    const movs: Array<{
      cuenta_id: string;
      fecha: string | Date;
      numero: number | null;
      asiento_id: string;
      descripcion: string;
      origen_tipo: string | null;
      debe: string;
      haber: string;
    }> = await this.dataSource.query(
      `SELECT l.cuenta_id, a.fecha, a.numero, a.id AS asiento_id, a.descripcion, a.origen_tipo, l.debe, l.haber
       FROM lineas_asiento l JOIN asientos_contables a ON a.id = l.asiento_id
       WHERE a.fecha BETWEEN $1 AND $2 ${cuentaId ? 'AND l.cuenta_id = $3' : ''}
       ORDER BY a.fecha, a.numero, a.creado_en, l.id`,
      cuentaId ? [desde, hasta, cuentaId] : [desde, hasta],
    );

    const previoPor = new Map(previos.map((p) => [p.cuenta_id, p]));
    const movsPor = new Map<string, typeof movs>();
    for (const m of movs) {
      const lista = movsPor.get(m.cuenta_id);
      if (lista) lista.push(m);
      else movsPor.set(m.cuenta_id, [m]);
    }

    const resultado: CuentaMayor[] = [];
    for (const c of cuentas) {
      const previo = previoPor.get(c.id);
      const lineas = (movsPor.get(c.id) ?? []).map((m) => ({
        fecha: m.fecha instanceof Date ? m.fecha.toISOString().slice(0, 10) : String(m.fecha).slice(0, 10),
        numero: m.numero,
        asientoId: m.asiento_id,
        descripcion: m.descripcion,
        origenTipo: m.origen_tipo,
        debe: Number(m.debe),
        haber: Number(m.haber),
      }));
      const mayor = construirCuentaMayor(c, { debe: Number(previo?.debe ?? 0), haber: Number(previo?.haber ?? 0) }, lineas);
      // En el mayor completo solo van las cuentas con algo que mostrar.
      if (!cuentaId && lineas.length === 0 && mayor.saldoInicial === 0) continue;
      resultado.push(mayor);
    }

    const debe = redondear(resultado.reduce((a, c) => a + c.totalDebe, 0));
    const haber = redondear(resultado.reduce((a, c) => a + c.totalHaber, 0));
    return { desde, hasta, cuentas: resultado, totales: { debe, haber }, cuadra: debe === haber };
  }

  // Excel: hoja "Resumen" (una fila por cuenta) + una hoja por cuenta con todos
  // sus movimientos y saldo corrido.
  async exportar(desde: string, hasta: string, cuentaId?: string): Promise<Buffer> {
    const mayor = await this.generar(desde, hasta, cuentaId);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const NEGRITA = { bold: true };

    const resumen = libro.addWorksheet('Resumen');
    resumen.addRow([`LIBRO MAYOR — del ${desde} al ${hasta}`]).font = { bold: true, size: 13 };
    resumen.addRow([]);
    resumen.addRow(['Código', 'Cuenta', 'Saldo inicial', 'Débitos', 'Créditos', 'Saldo final']).font = NEGRITA;
    for (const c of mayor.cuentas) resumen.addRow([c.codigo, c.nombre, c.saldoInicial, c.totalDebe, c.totalHaber, c.saldoFinal]);
    resumen.addRow(['', 'TOTAL', '', mayor.totales.debe, mayor.totales.haber, '']).font = NEGRITA;
    resumen.addRow([]);
    resumen.addRow([mayor.cuadra ? 'Los débitos y créditos del período cuadran.' : '⚠ Los débitos y créditos del período NO cuadran.']);
    [10, 42, 16, 16, 16, 16].forEach((w, i) => (resumen.getColumn(i + 1).width = w));
    for (const col of [3, 4, 5, 6]) resumen.getColumn(col).numFmt = '#,##0.00';

    const usados = new Set<string>(['Resumen']);
    for (const c of mayor.cuentas) {
      let nombre = `${c.codigo} ${c.nombre}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
      while (usados.has(nombre)) nombre = nombre.slice(0, 28) + '…';
      usados.add(nombre);
      const hoja = libro.addWorksheet(nombre);
      hoja.addRow([`${c.codigo} — ${c.nombre}  (cuenta ${c.naturaleza}) — del ${desde} al ${hasta}`]).font = { bold: true, size: 12 };
      hoja.addRow([]);
      hoja.addRow(['Fecha', 'Asiento', 'Origen', 'Descripción', 'Débito', 'Crédito', 'Saldo']).font = NEGRITA;
      hoja.addRow(['', '', '', 'Saldo inicial', '', '', c.saldoInicial]).font = NEGRITA;
      for (const m of c.movimientos) hoja.addRow([m.fecha, m.numero ?? '', etiquetaOrigen(m.origenTipo), m.descripcion, m.debe || '', m.haber || '', m.saldo]);
      hoja.addRow(['', '', '', 'TOTALES / SALDO FINAL', c.totalDebe, c.totalHaber, c.saldoFinal]).font = NEGRITA;
      [12, 9, 18, 58, 16, 16, 18].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
      for (const col of [5, 6, 7]) hoja.getColumn(col).numFmt = '#,##0.00';
      hoja.views = [{ state: 'frozen', ySplit: 3 }];
    }
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
