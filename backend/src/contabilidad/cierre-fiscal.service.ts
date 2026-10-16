import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContabilidadService, CUENTA } from './contabilidad.service.js';
import { AsientoContable } from './asiento-contable.entity.js';
import { CierreFiscal } from './cierre-fiscal.entity.js';
import { ParametroFiscal } from './parametro-fiscal.entity.js';
import { calcularRentaPJ, type ParametrosRentaPJ, type ResultadoRentaPJ } from './renta-pj.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';

export const ORIGEN_CIERRE_FISCAL = 'cierre_fiscal';
export const ORIGEN_CIERRE_FISCAL_IMPUESTO = 'cierre_fiscal_impuesto';

// Valores del período fiscal 2026 (Decreto Ejecutivo 45333-H). Se actualizan cada año.
const PARAMETROS_POR_DEFECTO: Array<{ clave: string; valor: number; descripcion: string }> = [
  { clave: 'RENTA_PJ_TOPE_INGRESOS', valor: 119_174_000, descripcion: 'Ingresos brutos anuales hasta los que aplica la escala progresiva (₡).' },
  { clave: 'RENTA_PJ_LIMITE_1', valor: 5_621_000, descripcion: 'Renta neta hasta este monto: tarifa 1 (₡).' },
  { clave: 'RENTA_PJ_LIMITE_2', valor: 8_433_000, descripcion: 'Renta neta hasta este monto: tarifa 2 (₡).' },
  { clave: 'RENTA_PJ_LIMITE_3', valor: 11_243_000, descripcion: 'Renta neta hasta este monto: tarifa 3 (₡). Lo que exceda paga tarifa 4.' },
  { clave: 'RENTA_PJ_TARIFA_1', valor: 5, descripcion: 'Tarifa del primer tramo, %.' },
  { clave: 'RENTA_PJ_TARIFA_2', valor: 10, descripcion: 'Tarifa del segundo tramo, %.' },
  { clave: 'RENTA_PJ_TARIFA_3', valor: 15, descripcion: 'Tarifa del tercer tramo, %.' },
  { clave: 'RENTA_PJ_TARIFA_4', valor: 20, descripcion: 'Tarifa del exceso sobre el tercer tramo, %.' },
  { clave: 'RENTA_PJ_TARIFA_GENERAL', valor: 30, descripcion: 'Tarifa general (si los ingresos brutos superan el tope), % sobre toda la renta neta.' },
];

export interface CuentaResultado {
  codigo: string;
  nombre: string;
  tipo: string;
  // Saldo según su naturaleza (ingreso: créditos − débitos; gasto: débitos − créditos).
  saldo: number;
}

export interface VistaCierreFiscal {
  anio: number;
  desde: string;
  hasta: string;
  ingresos: number;
  gastos: number;
  utilidadAntesImpuesto: number;
  ajusteFiscal: number;
  rentaNeta: number;
  renta: ResultadoRentaPJ;
  retencionesAFavor: number;
  retencionesAplicadas: number;
  impuestoPorPagar: number;
  utilidadNeta: number;
  cuentas: CuentaResultado[];
  bloqueos: string[];
  yaCerrado: boolean;
}

@Injectable()
export class CierreFiscalService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contabilidad: ContabilidadService,
  ) {}

  async onModuleInit() {
    const repo = this.dataSource.getRepository(ParametroFiscal);
    const existentes = new Set((await repo.find({ select: { clave: true } })).map((p) => p.clave));
    const faltantes = PARAMETROS_POR_DEFECTO.filter((p) => !existentes.has(p.clave));
    if (faltantes.length) await repo.save(faltantes.map((p) => repo.create({ clave: p.clave, valor: String(p.valor), descripcion: p.descripcion })));
  }

  listarParametros(): Promise<ParametroFiscal[]> {
    return this.dataSource.getRepository(ParametroFiscal).find({ order: { clave: 'ASC' } });
  }

  async actualizarParametro(clave: string, valor: number): Promise<ParametroFiscal> {
    const repo = this.dataSource.getRepository(ParametroFiscal);
    const p = await repo.findOneBy({ clave });
    if (!p) throw new NotFoundException('Ese parámetro no existe.');
    p.valor = String(valor);
    return repo.save(p);
  }

  private async parametros(): Promise<ParametrosRentaPJ> {
    const mapa = new Map((await this.listarParametros()).map((p) => [p.clave, Number(p.valor)]));
    const v = (k: string) => mapa.get(k) ?? 0;
    return {
      topeIngresos: v('RENTA_PJ_TOPE_INGRESOS'),
      limite1: v('RENTA_PJ_LIMITE_1'),
      limite2: v('RENTA_PJ_LIMITE_2'),
      limite3: v('RENTA_PJ_LIMITE_3'),
      tarifa1: v('RENTA_PJ_TARIFA_1'),
      tarifa2: v('RENTA_PJ_TARIFA_2'),
      tarifa3: v('RENTA_PJ_TARIFA_3'),
      tarifa4: v('RENTA_PJ_TARIFA_4'),
      tarifaGeneral: v('RENTA_PJ_TARIFA_GENERAL'),
    };
  }

  // Saldo del año de cada cuenta de resultados. `conImpuesto` = contar o no el
  // asiento del impuesto de renta; el asiento de cierre de resultados nunca cuenta
  // (ni sus reversas), para que el resultado del año no dependa de si ya se cerró.
  private async resultadosDelAnio(manager: { query: DataSource['query'] }, anio: number, conImpuesto: boolean): Promise<CuentaResultado[]> {
    const excluir = conImpuesto ? [ORIGEN_CIERRE_FISCAL] : [ORIGEN_CIERRE_FISCAL, ORIGEN_CIERRE_FISCAL_IMPUESTO];
    const filas: Array<{ codigo: string; nombre: string; tipo: string; neto: string }> = await manager.query(
      `SELECT c.codigo, c.nombre, c.tipo,
              SUM(CASE WHEN c.tipo = 'ingreso' THEN l.haber::numeric - l.debe::numeric ELSE l.debe::numeric - l.haber::numeric END) AS neto
       FROM lineas_asiento l
       JOIN asientos_contables a ON a.id = l.asiento_id
       JOIN cuentas_contables c ON c.id = l.cuenta_id
       WHERE c.tipo IN ('ingreso', 'gasto') AND a.fecha BETWEEN $1 AND $2
         AND NOT (a.origen_tipo = ANY($3) OR (a.origen_tipo = 'reversa' AND a.origen_id IN (SELECT id FROM asientos_contables WHERE origen_tipo = ANY($3))))
       GROUP BY c.codigo, c.nombre, c.tipo
       HAVING SUM(l.debe::numeric) <> 0 OR SUM(l.haber::numeric) <> 0
       ORDER BY c.codigo`,
      [`${anio}-01-01`, `${anio}-12-31`, excluir],
    );
    return filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, saldo: redondear(Number(f.neto)) })).filter((f) => f.saldo !== 0);
  }

  async vistaPrevia(anio: number, ajusteFiscal = 0): Promise<VistaCierreFiscal> {
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new BadRequestException('El año no es válido.');
    const cuentas = await this.resultadosDelAnio(this.dataSource, anio, false);
    const ingresos = redondear(cuentas.filter((c) => c.tipo === 'ingreso').reduce((a, c) => a + c.saldo, 0));
    const gastos = redondear(cuentas.filter((c) => c.tipo === 'gasto').reduce((a, c) => a + c.saldo, 0));
    const utilidadAntesImpuesto = redondear(ingresos - gastos);
    const rentaNetaBase = redondear(utilidadAntesImpuesto + ajusteFiscal);
    const renta = calcularRentaPJ(rentaNetaBase, ingresos, await this.parametros());

    const [{ saldo }]: Array<{ saldo: string }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(l.debe::numeric - l.haber::numeric), 0) AS saldo
       FROM lineas_asiento l JOIN cuentas_contables c ON c.id = l.cuenta_id WHERE c.codigo = $1`,
      [CUENTA.RETENCIONES_RENTA_A_FAVOR],
    );
    const retencionesAFavor = redondear(Math.max(0, Number(saldo)));
    const retencionesAplicadas = redondear(Math.min(retencionesAFavor, renta.impuesto));

    const bloqueos: string[] = [];
    const hoy = hoyISO();
    if (anio >= Number(hoy.slice(0, 4))) bloqueos.push(`El año fiscal ${anio} todavía no termina (cierra el 31 de diciembre).`);

    const mesesConMovimiento: Array<{ mes: string }> = await this.dataSource.query(
      `SELECT DISTINCT to_char(a.fecha, 'YYYY-MM') AS mes FROM asientos_contables a
       WHERE a.fecha BETWEEN $1 AND $2 AND a.origen_tipo NOT IN ('${ORIGEN_CIERRE_FISCAL}', '${ORIGEN_CIERRE_FISCAL_IMPUESTO}')
         AND NOT (a.origen_tipo = 'reversa' AND a.origen_id IN (SELECT id FROM asientos_contables WHERE origen_tipo IN ('${ORIGEN_CIERRE_FISCAL}', '${ORIGEN_CIERRE_FISCAL_IMPUESTO}')))
         AND NOT EXISTS (SELECT 1 FROM periodos_contables_cerrados p WHERE p.periodo = to_char(a.fecha, 'YYYY-MM'))
       ORDER BY mes`,
      [`${anio}-01-01`, `${anio}-12-31`],
    );
    if (mesesConMovimiento.length) {
      bloqueos.push(`Faltan por cerrar estos meses (Cierre mensual): ${mesesConMovimiento.map((m) => m.mes).join(', ')}.`);
    }
    const anteriores: Array<{ anio: number }> = await this.dataSource.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM a.fecha)::int AS anio FROM asientos_contables a
       WHERE a.fecha < $1 AND NOT EXISTS (SELECT 1 FROM cierres_fiscales c WHERE c.anio = EXTRACT(YEAR FROM a.fecha)::int)
       ORDER BY anio`,
      [`${anio}-01-01`],
    );
    if (anteriores.length) bloqueos.push(`Primero hay que hacer el cierre fiscal de ${anteriores.map((a) => a.anio).join(', ')}.`);

    return {
      anio,
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      ingresos,
      gastos,
      utilidadAntesImpuesto,
      ajusteFiscal,
      rentaNeta: rentaNetaBase,
      renta,
      retencionesAFavor,
      retencionesAplicadas,
      impuestoPorPagar: redondear(renta.impuesto - retencionesAplicadas),
      utilidadNeta: redondear(utilidadAntesImpuesto - renta.impuesto),
      cuentas,
      bloqueos,
      yaCerrado: await this.dataSource.getRepository(CierreFiscal).exists({ where: { anio } }),
    };
  }

  async listarCierres(): Promise<CierreFiscal[]> {
    return this.dataSource.getRepository(CierreFiscal).find({ order: { anio: 'DESC' } });
  }

  // Cierre del año fiscal, a mano: provisiona el impuesto de renta y salda
  // ingresos y gastos contra utilidades acumuladas (3300). Los dos asientos van
  // fechados el 31 de diciembre; el segundo no cuenta en el estado de resultados.
  async cerrar(anio: number, usuarioId: string, opciones: { ajusteFiscal?: number; notas?: string }): Promise<CierreFiscal> {
    const vista = await this.vistaPrevia(anio, opciones.ajusteFiscal ?? 0);
    if (vista.yaCerrado) throw new BadRequestException(`El año fiscal ${anio} ya está cerrado.`);
    if (vista.bloqueos.length) throw new BadRequestException(vista.bloqueos.join(' '));
    const fecha = vista.hasta;

    return this.dataSource.transaction(async (manager) => {
      const ids: string[] = [];
      const registrar = async (origenTipo: string, descripcion: string, lineas: Array<{ codigoCuenta: string; debe?: number; haber?: number }>) => {
        const a = await this.contabilidad.registrarAsientoEnTransaccion(manager, { fecha, descripcion, origenTipo, lineas, ignorarCierre: true });
        await manager.update(AsientoContable, a.id, { creadoPorId: usuarioId });
        ids.push(a.id);
      };

      const impuesto = vista.renta.impuesto;
      if (impuesto > 0) {
        await registrar(ORIGEN_CIERRE_FISCAL_IMPUESTO, `Impuesto sobre la renta del año fiscal ${anio}`, [
          { codigoCuenta: CUENTA.GASTO_RENTA, debe: impuesto },
          { codigoCuenta: CUENTA.RENTA_POR_PAGAR, haber: redondear(impuesto - vista.retencionesAplicadas) },
          ...(vista.retencionesAplicadas > 0 ? [{ codigoCuenta: CUENTA.RETENCIONES_RENTA_A_FAVOR, haber: vista.retencionesAplicadas }] : []),
        ]);
      }

      // Cierre de resultados: cada cuenta de ingreso/gasto queda en cero y la
      // diferencia (utilidad o pérdida del año) pasa a utilidades acumuladas.
      const cuentas = await this.resultadosDelAnio(manager, anio, true);
      const lineas: Array<{ codigoCuenta: string; debe?: number; haber?: number }> = [];
      let debeC = 0;
      let haberC = 0;
      for (const c of cuentas) {
        const cent = Math.round(c.saldo * 100);
        // ingreso con saldo acreedor → se debita para saldarlo; gasto con saldo deudor → se acredita.
        const debita = (c.tipo === 'ingreso') === (cent > 0);
        const monto = Math.abs(cent) / 100;
        lineas.push(debita ? { codigoCuenta: c.codigo, debe: monto } : { codigoCuenta: c.codigo, haber: monto });
        if (debita) debeC += Math.abs(cent);
        else haberC += Math.abs(cent);
      }
      if (lineas.length) {
        const dif = redondear((debeC - haberC) / 100); // débitos > créditos = utilidad
        if (dif > 0) lineas.push({ codigoCuenta: CUENTA.UTILIDADES_ACUMULADAS, haber: dif });
        else if (dif < 0) lineas.push({ codigoCuenta: CUENTA.UTILIDADES_ACUMULADAS, debe: -dif });
        await registrar(ORIGEN_CIERRE_FISCAL, `Cierre fiscal ${anio}: saldo de ingresos y gastos a utilidades acumuladas`, lineas);
      }

      return manager.save(
        CierreFiscal,
        manager.create(CierreFiscal, {
          anio,
          cerradoPorId: usuarioId,
          notas: (opciones.notas ?? '').trim().slice(0, 255),
          asientosCierre: ids,
          resumen: {
            ingresos: vista.ingresos,
            gastos: vista.gastos,
            utilidadAntesImpuesto: vista.utilidadAntesImpuesto,
            ajusteFiscal: vista.ajusteFiscal,
            impuesto,
            retencionesAplicadas: vista.retencionesAplicadas,
            impuestoPorPagar: vista.impuestoPorPagar,
            utilidadNeta: vista.utilidadNeta,
            regimen: vista.renta.regimen,
          },
        }),
      );
    });
  }

  // Deshace el cierre del año (solo el más reciente): reversa sus asientos y reabre.
  async reabrir(anio: number): Promise<void> {
    const repo = this.dataSource.getRepository(CierreFiscal);
    const registro = await repo.findOneBy({ anio });
    if (!registro) throw new NotFoundException('Ese año fiscal no está cerrado.');
    if ((await repo.find()).some((c) => c.anio > anio)) {
      throw new BadRequestException('Primero hay que reabrir el cierre fiscal de los años posteriores.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CierreFiscal, { anio });
      const asientos = registro.asientosCierre.length
        ? await manager.find(AsientoContable, { where: registro.asientosCierre.map((id) => ({ id })), relations: { lineas: { cuenta: true } }, order: { numero: 'ASC' } })
        : [];
      await this.contabilidad.reversarAsientosEnTransaccion(manager, asientos, `reapertura del año fiscal ${anio}`, undefined, true);
    });
  }
}
