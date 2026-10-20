import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { SistemaConfigService } from '../sistema-config.service.js';
import { DATASET_POR_ID, DATASETS, FACTURA_JOINS, FACTURA_VIGENTE, SQL_BASE, type DatasetAnalisis } from './analisis.datasets.js';

export interface FiltroAnalisis {
  desde?: string;
  hasta?: string;
  anonimizar?: boolean;
  limite?: number;
}

export type TemaResumen = 'ventas' | 'cartera' | 'inventario' | 'planilla' | 'contabilidad';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_FILAS = 500_000;
const CLAVE_TOKEN = 'analisis.token_hash';
const CLAVE_TOKEN_CREADO = 'analisis.token_creado';
const CLAVE_TOKEN_USO = 'analisis.token_ultimo_uso';

// Compara lo que dice el libro mayor con el detalle operativo: si no coinciden, hay algo que revisar.
function cuadre(mayor: number, detalle: number, contra: string) {
  const diferencia = redondear(mayor - detalle);
  return { mayor: redondear(mayor), detalle: redondear(detalle), diferencia, cuadra: Math.abs(diferencia) < 0.5, contra };
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const redondear = (v: number): number => Math.round(v * 100) / 100;

@Injectable()
export class AnalisisService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: SistemaConfigService,
  ) {}

  catalogo() {
    return DATASETS.map(({ id, titulo, descripcion, tema, columnaFecha, personal }) => ({ id, titulo, descripcion, tema, conFecha: columnaFecha !== null, personal }));
  }

  dataset(id: string): DatasetAnalisis {
    const d = DATASET_POR_ID.get(id);
    if (!d) throw new NotFoundException('Ese conjunto de datos no existe.');
    return d;
  }

  private fechas(f: FiltroAnalisis): [string | null, string | null] {
    for (const v of [f.desde, f.hasta]) if (v && !FECHA.test(v)) throw new BadRequestException('Las fechas deben ir como AAAA-MM-DD.');
    return [f.desde || null, f.hasta || null];
  }

  // Filas del dataset ya filtradas por fecha. Todo es de solo lectura.
  async filas(id: string, f: FiltroAnalisis = {}): Promise<{ columnas: string[]; filas: Array<Record<string, unknown>> }> {
    const d = this.dataset(id);
    const [desde, hasta] = this.fechas(f);
    const anonimizar = d.personal ? f.anonimizar !== false : true;
    const params: unknown[] = [];
    const donde: string[] = [];
    if (d.columnaFecha) {
      if (desde) {
        params.push(desde);
        donde.push(`t."${d.columnaFecha}" >= $${params.length}::text`);
      }
      if (hasta) {
        params.push(hasta);
        donde.push(`t."${d.columnaFecha}" <= $${params.length}::text`);
      }
    }
    const orden = d.columnaFecha ? `ORDER BY t."${d.columnaFecha}"` : '';
    const limite = Math.min(Math.max(Math.trunc(f.limite ?? LIMITE_FILAS), 1), LIMITE_FILAS);
    const sql = `SELECT * FROM (${d.sql(anonimizar)}) t ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''} ${orden} LIMIT ${limite}`;
    // Se usa el cliente de pg directamente para conocer los nombres de las columnas aunque no haya filas.
    const qr = this.dataSource.createQueryRunner();
    try {
      const cliente = (await qr.connect()) as unknown as { query: (s: string, p: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; fields: Array<{ name: string }> }> };
      const r = await cliente.query(sql, params);
      return { columnas: r.fields.map((c) => c.name), filas: r.rows };
    } finally {
      await qr.release();
    }
  }

  csv(columnas: string[], filas: Array<Record<string, unknown>>): Buffer {
    const celda = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Evita que Excel interprete texto como fórmula (inyección de fórmulas).
      if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [columnas.join(','), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(','))];
    return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
  }

  async xlsx(d: DatasetAnalisis, columnas: string[], filas: Array<Record<string, unknown>>): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet(d.id.slice(0, 31));
    hoja.addRow(columnas).font = { bold: true };
    for (const f of filas) hoja.addRow(columnas.map((c) => (typeof f[c] === 'object' && f[c] !== null ? JSON.stringify(f[c]) : (f[c] ?? ''))));
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(columnas.length, 1) } };
    columnas.forEach((_, i) => (hoja.getColumn(i + 1).width = 16));
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------- Resúmenes para los tableros

  async resumen(tema: TemaResumen, f: FiltroAnalisis) {
    const [desde, hasta] = this.fechas(f);
    switch (tema) {
      case 'ventas':
        return this.resumenVentas(desde, hasta);
      case 'cartera':
        return this.resumenCartera();
      case 'inventario':
        return this.resumenInventario(desde, hasta);
      case 'planilla':
        return this.resumenPlanilla(desde, hasta);
      case 'contabilidad':
        return this.resumenContabilidad(desde, hasta);
      default:
        throw new BadRequestException('Tema no válido.');
    }
  }

  private async q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  // Todas las cifras en pesos salen del libro mayor (SQL_BASE.CONTABILIDAD); el cliente, vendedor, producto o
  // planilla de cada monto se obtiene del documento que originó el asiento. Los datos operativos (facturas,
  // existencias, horas) solo aportan detalle y se comparan contra el mayor en el "cuadre".
  private async resumenVentas(desde: string | null, hasta: string | null) {
    const VENTA = `(CASE WHEN m.cuenta_codigo IN ('4100','4110','4120') THEN m.haber - m.debe ELSE 0 END)`;
    const COSTO = `(CASE WHEN m.cuenta_codigo = '5100' THEN m.debe - m.haber ELSE 0 END)`;
    const base = `FROM (${SQL_BASE.CONTABILIDAD}) m WHERE m.cuenta_codigo IN ('4100','4110','4120','5100') AND COALESCE(m.origen_tipo, '') NOT LIKE 'cierre%' AND ($1::text IS NULL OR m.fecha >= $1::text) AND ($2::text IS NULL OR m.fecha <= $2::text)`;
    const p = [desde, hasta];
    const agrupado = (col: string, limite = 10) =>
      this.q<{ etiqueta: string; venta: number }>(
        `SELECT COALESCE(NULLIF(${col}, ''), 'Sin documento de origen') AS etiqueta, COALESCE(SUM(${VENTA}), 0)::float8 AS venta ${base} GROUP BY 1 HAVING ABS(SUM(${VENTA})) > 0.005 ORDER BY 2 DESC LIMIT ${limite}`,
        p,
      );
    const [[k], [fac], [cli], porMes, topClientes, productos, porVendedor, porProvincia, porUbicacion, porTipoPago, [oper]] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(${VENTA}),0)::float8 AS venta, COALESCE(SUM(${COSTO}),0)::float8 AS costo ${base}`, p),
      this.q(`SELECT COUNT(*)::int AS n FROM (SELECT m.factura_id ${base} AND m.factura_id IS NOT NULL GROUP BY 1 HAVING ABS(SUM(${VENTA})) > 0.005) t`, p),
      this.q(`SELECT COUNT(*)::int AS n FROM (SELECT m.cliente_id ${base} AND m.cliente_id IS NOT NULL GROUP BY 1 HAVING SUM(${VENTA}) > 0.005) t`, p),
      this.q<{ mes: string; venta: number; costo: number }>(`SELECT substr(m.fecha, 1, 7) AS mes, SUM(${VENTA})::float8 AS venta, SUM(${COSTO})::float8 AS costo ${base} GROUP BY 1 ORDER BY 1`, p),
      agrupado('m.cliente'),
      // Venta por producto: el monto del mayor de cada factura se reparte según el peso de sus líneas.
      this.q<{ etiqueta: string; venta: number }>(
        `WITH lv AS (SELECT m.factura_id, SUM(${VENTA}) AS venta ${base} AND m.factura_id IS NOT NULL GROUP BY 1),
          fs AS (SELECT factura_id, SUM(subtotal) AS total FROM factura_lineas GROUP BY 1)
         SELECT p.codigo || ' ' || p.nombre AS etiqueta, SUM(lv.venta * fl.subtotal / NULLIF(fs.total, 0))::float8 AS venta
         FROM lv JOIN factura_lineas fl ON fl.factura_id = lv.factura_id JOIN fs ON fs.factura_id = lv.factura_id
         JOIN variantes_producto v ON v.id = fl.variante_id JOIN productos p ON p.id = v.producto_id
         GROUP BY 1 HAVING ABS(SUM(lv.venta * fl.subtotal / NULLIF(fs.total, 0))) > 0.005 ORDER BY 2 DESC LIMIT 300`,
        p,
      ),
      agrupado('m.vendedor'),
      agrupado('m.provincia'),
      agrupado('m.ubicacion'),
      agrupado('m.tipo_pago'),
      this.q(
        `SELECT COALESCE(SUM(f.subtotal), 0)::float8 AS subtotal FROM facturas f ${FACTURA_JOINS}
         WHERE ${FACTURA_VIGENTE} AND ($1::text IS NULL OR to_char(f.fecha, 'YYYY-MM-DD') >= $1::text) AND ($2::text IS NULL OR to_char(f.fecha, 'YYYY-MM-DD') <= $2::text)`,
        p,
      ),
    ]);
    const venta = num(k.venta);
    const costo = num(k.costo);
    const atribuido = productos.reduce((s, r) => s + num(r.venta), 0);
    // Análisis ABC (Pareto): A = el grupo que junta el 80 % de la venta, B hasta 95 %, C el resto.
    let acum = 0;
    const abc = productos.map((r) => {
      const antes = atribuido > 0 ? (acum / atribuido) * 100 : 0;
      acum += num(r.venta);
      return { etiqueta: r.etiqueta, venta: redondear(num(r.venta)), acumuladoPct: atribuido > 0 ? redondear((acum / atribuido) * 100) : 0, clase: antes < 80 ? 'A' : antes < 95 ? 'B' : 'C' };
    });
    return {
      fuente: 'libro mayor',
      kpis: {
        venta: redondear(venta),
        costo: redondear(costo),
        margen: redondear(venta - costo),
        margenPct: venta > 0 ? redondear(((venta - costo) / venta) * 100) : 0,
        facturas: num(fac.n),
        clientes: num(cli.n),
        ticketPromedio: num(fac.n) > 0 ? redondear(venta / num(fac.n)) : 0,
        sinCostoRegistrado: venta > 0 && costo === 0,
      },
      cuadre: cuadre(venta, num(oper.subtotal), 'las facturas vigentes'),
      porMes: porMes.map((r) => ({ etiqueta: r.mes, venta: redondear(num(r.venta)), margen: redondear(num(r.venta) - num(r.costo)) })),
      topClientes: topClientes.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      abc: { filas: abc.slice(0, 15), productosTotal: abc.length, sinDetalle: redondear(venta - atribuido), clases: { A: abc.filter((r) => r.clase === 'A').length, B: abc.filter((r) => r.clase === 'B').length, C: abc.filter((r) => r.clase === 'C').length } },
      porVendedor: porVendedor.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porProvincia: porProvincia.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porUbicacion: porUbicacion.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porTipoPago: porTipoPago.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
    };
  }

  private async resumenCartera() {
    const mayor = `FROM (${SQL_BASE.CONTABILIDAD}) m WHERE m.cuenta_codigo = '1200'`;
    const abiertas = `FROM (${SQL_BASE.CARTERA}) c`;
    const [[saldo], porCliente, [clientes], [k], tramos, masVencidas] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(m.debe - m.haber), 0)::float8 AS saldo ${mayor}`),
      this.q<{ etiqueta: string; saldo: number }>(`SELECT COALESCE(m.cliente, 'Sin cliente asociado') AS etiqueta, SUM(m.debe - m.haber)::float8 AS saldo ${mayor} GROUP BY 1 HAVING ABS(SUM(m.debe - m.haber)) > 0.005 ORDER BY 2 DESC LIMIT 10`),
      this.q(`SELECT COUNT(*)::int AS n FROM (SELECT m.cliente_id ${mayor} GROUP BY 1 HAVING SUM(m.debe - m.haber) > 0.005) t`),
      this.q(`SELECT COALESCE(SUM(saldo),0)::float8 AS saldo, COALESCE(SUM(saldo) FILTER (WHERE dias_vencida > 0),0)::float8 AS vencido, COUNT(*)::int AS facturas, COALESCE(AVG(dias_vencida) FILTER (WHERE dias_vencida > 0),0)::float8 AS dias_prom_vencida ${abiertas}`),
      this.q<{ etiqueta: string; saldo: number; facturas: number }>(`SELECT tramo AS etiqueta, SUM(saldo)::float8 AS saldo, COUNT(*)::int AS facturas ${abiertas} GROUP BY 1 ORDER BY 1`),
      this.q(`SELECT consecutivo, cliente, fecha_vence, saldo, dias_vencida ${abiertas} WHERE dias_vencida > 0 ORDER BY dias_vencida DESC LIMIT 10`),
    ]);
    const enMayor = num(saldo.saldo);
    return {
      fuente: 'libro mayor',
      kpis: { saldo: redondear(enMayor), vencido: redondear(num(k.vencido)), vencidoPct: enMayor > 0 ? redondear((num(k.vencido) / enMayor) * 100) : 0, facturasAbiertas: num(k.facturas), clientes: num(clientes.n), diasPromVencida: Math.round(num(k.dias_prom_vencida)) },
      cuadre: cuadre(enMayor, num(k.saldo), 'el detalle de facturas abiertas'),
      tramos: tramos.map((r) => ({ etiqueta: r.etiqueta.slice(2), saldo: redondear(num(r.saldo)), facturas: num(r.facturas) })),
      deudores: porCliente.map((r) => ({ etiqueta: r.etiqueta, saldo: redondear(num(r.saldo)) })),
      masVencidas: masVencidas.map((r) => ({ consecutivo: r.consecutivo, cliente: r.cliente, venceEl: r.fecha_vence, saldo: redondear(num(r.saldo)), diasVencida: num(r.dias_vencida) })),
    };
  }

  private async resumenInventario(desde: string | null, hasta: string | null) {
    const stock = `FROM (${SQL_BASE.INVENTARIO_STOCK}) s`;
    const mov = `FROM (${SQL_BASE.INVENTARIO_MOVIMIENTOS}) m WHERE ($1::text IS NULL OR m.fecha >= $1::text) AND ($2::text IS NULL OR m.fecha <= $2::text)`;
    const [[mayor], [k], porUbicacion, topValor, porTipo] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(m.debe - m.haber), 0)::float8 AS valor FROM (${SQL_BASE.CONTABILIDAD}) m WHERE m.cuenta_codigo IN ('1300','1310','1320')`),
      this.q(`SELECT COALESCE(SUM(cantidad),0)::int AS pares, COALESCE(SUM(valor_costo),0)::float8 AS costo, COALESCE(SUM(valor_venta),0)::float8 AS venta, COUNT(DISTINCT variante_id) FILTER (WHERE cantidad > 0)::int AS variantes, COUNT(*) FILTER (WHERE cantidad < 0)::int AS negativos ${stock}`),
      this.q<{ etiqueta: string; pares: number; costo: number }>(`SELECT ubicacion AS etiqueta, SUM(cantidad)::int AS pares, SUM(valor_costo)::float8 AS costo ${stock} GROUP BY 1 ORDER BY 3 DESC`),
      this.q<{ etiqueta: string; pares: number; costo: number }>(`SELECT producto_codigo || ' ' || producto AS etiqueta, SUM(cantidad)::int AS pares, SUM(valor_costo)::float8 AS costo ${stock} GROUP BY 1 ORDER BY 3 DESC LIMIT 10`),
      this.q<{ etiqueta: string; movimientos: number; pares: number }>(`SELECT tipo AS etiqueta, COUNT(*)::int AS movimientos, SUM(cantidad)::int AS pares ${mov} GROUP BY 1 ORDER BY 2 DESC`, [desde, hasta]),
    ]);
    return {
      fuente: 'libro mayor',
      kpis: { valorMayor: redondear(num(mayor.valor)), pares: num(k.pares), valorCosto: redondear(num(k.costo)), valorVenta: redondear(num(k.venta)), variantesConStock: num(k.variantes), stockNegativo: num(k.negativos) },
      cuadre: cuadre(num(mayor.valor), num(k.costo), 'las existencias valoradas a costo'),
      porUbicacion: porUbicacion.map((r) => ({ etiqueta: r.etiqueta, pares: num(r.pares), valor: redondear(num(r.costo)) })),
      topValor: topValor.map((r) => ({ etiqueta: r.etiqueta, pares: num(r.pares), valor: redondear(num(r.costo)) })),
      porTipoMovimiento: porTipo.map((r) => ({ etiqueta: r.etiqueta, movimientos: num(r.movimientos), pares: num(r.pares) })),
    };
  }

  // El costo laboral sale de los asientos de planilla (sueldos, cargas y provisiones); las horas extra y el detalle
  // por puesto salen de las líneas de planilla, siempre anonimizadas, y se comparan contra el mayor.
  private async resumenPlanilla(desde: string | null, hasta: string | null) {
    const par = [desde, hasta];
    const mayor = `FROM (${SQL_BASE.CONTABILIDAD}) m WHERE m.cuenta_codigo IN ('5200','5210','5220') AND COALESCE(m.origen_tipo, '') NOT LIKE 'cierre%' AND ($1::text IS NULL OR m.fecha >= $1::text) AND ($2::text IS NULL OR m.fecha <= $2::text)`;
    const det = `FROM (${SQL_BASE.planilla(true)}) p WHERE p.estado IN ('aprobada','pagada') AND ($1::text IS NULL OR p.fecha_hasta >= $1::text) AND ($2::text IS NULL OR p.fecha_hasta <= $2::text)`;
    const gasto = (codigo: string) => `COALESCE(SUM(CASE WHEN m.cuenta_codigo = '${codigo}' THEN m.debe - m.haber ELSE 0 END), 0)::float8`;
    const [[k], porPlanilla, [d], porPuesto, [pend]] = await Promise.all([
      this.q(`SELECT ${gasto('5200')} AS bruto, ${gasto('5210')} AS cargas, ${gasto('5220')} AS provisiones ${mayor}`, par),
      this.q<{ desde: string | null; hasta: string | null; fecha: string; bruto: number; cargas: number; provisiones: number }>(
        `SELECT m.planilla_desde AS desde, m.planilla_hasta AS hasta, MAX(m.fecha) AS fecha, ${gasto('5200')} AS bruto, ${gasto('5210')} AS cargas, ${gasto('5220')} AS provisiones ${mayor} GROUP BY 1, 2 HAVING ABS(SUM(m.debe - m.haber)) > 0.005 ORDER BY 3`,
        par,
      ),
      this.q(`SELECT COALESCE(SUM(bruto),0)::float8 AS bruto, COALESCE(SUM(neto),0)::float8 AS neto, COALESCE(SUM(monto_extra),0)::float8 AS extras, COALESCE(SUM(horas_extra),0)::float8 AS horas_extra, COALESCE(SUM(renta),0)::float8 AS renta, COUNT(DISTINCT fecha_hasta)::int AS planillas, COUNT(DISTINCT empleado_codigo)::int AS empleados ${det}`, par),
      this.q<{ etiqueta: string; empleados: number; bruto: number; extras: number; horas_extra: number }>(`SELECT COALESCE(NULLIF(puesto, ''), 'Sin puesto') AS etiqueta, COUNT(DISTINCT empleado_codigo)::int AS empleados, SUM(bruto)::float8 AS bruto, SUM(monto_extra)::float8 AS extras, SUM(horas_extra)::float8 AS horas_extra ${det} GROUP BY 1 ORDER BY 3 DESC LIMIT 12`, par),
      this.q(`SELECT (SELECT COUNT(*) FROM planilla_planillas WHERE estado = 'borrador')::int AS borradores, (SELECT COUNT(*) FROM planilla_dias)::int AS dias_importados`),
    ]);
    const costoTotal = num(k.bruto) + num(k.cargas) + num(k.provisiones);
    return {
      fuente: 'libro mayor',
      kpis: {
        costoTotal: redondear(costoTotal),
        bruto: redondear(num(k.bruto)),
        cargas: redondear(num(k.cargas)),
        provisiones: redondear(num(k.provisiones)),
        neto: redondear(num(d.neto)),
        renta: redondear(num(d.renta)),
        extras: redondear(num(d.extras)),
        horasExtra: redondear(num(d.horas_extra)),
        extrasPct: num(d.bruto) > 0 ? redondear((num(d.extras) / num(d.bruto)) * 100) : 0,
        planillas: num(d.planillas),
        empleados: num(d.empleados),
      },
      cuadre: cuadre(num(k.bruto), num(d.bruto), 'las líneas de planilla'),
      pendiente: { borradores: num(pend.borradores), diasImportados: num(pend.dias_importados) },
      porPlanilla: porPlanilla.map((r) => ({ etiqueta: r.desde && r.hasta ? `${r.desde.slice(5)} a ${r.hasta.slice(5)}` : r.fecha, bruto: redondear(num(r.bruto)), cargas: redondear(num(r.cargas)), provisiones: redondear(num(r.provisiones)) })),
      porPuesto: porPuesto.map((r) => ({ etiqueta: r.etiqueta, empleados: num(r.empleados), bruto: redondear(num(r.bruto)), extras: redondear(num(r.extras)), horasExtra: redondear(num(r.horas_extra)) })),
    };
  }

  // Estado de resultados por mes. Se excluyen los asientos de cierre: ponen en cero ingresos y gastos.
  private async resumenContabilidad(desde: string | null, hasta: string | null) {
    const base = `FROM (${SQL_BASE.CONTABILIDAD}) a WHERE a.origen_tipo NOT LIKE 'cierre%' AND ($1::text IS NULL OR a.fecha >= $1::text) AND ($2::text IS NULL OR a.fecha <= $2::text)`;
    const par = [desde, hasta];
    const [porMes, topGastos, ingresos, asientos] = await Promise.all([
      this.q<{ mes: string; ingresos: number; gastos: number }>(
        `SELECT substr(fecha, 1, 7) AS mes, COALESCE(SUM(haber - debe) FILTER (WHERE tipo_cuenta = 'ingreso'), 0)::float8 AS ingresos, COALESCE(SUM(debe - haber) FILTER (WHERE tipo_cuenta = 'gasto'), 0)::float8 AS gastos ${base} GROUP BY 1 ORDER BY 1`,
        par,
      ),
      this.q<{ etiqueta: string; monto: number }>(`SELECT cuenta_codigo || ' ' || cuenta AS etiqueta, SUM(debe - haber)::float8 AS monto ${base} AND a.tipo_cuenta = 'gasto' GROUP BY 1 HAVING SUM(debe - haber) <> 0 ORDER BY 2 DESC LIMIT 10`, par),
      this.q<{ etiqueta: string; monto: number }>(`SELECT cuenta_codigo || ' ' || cuenta AS etiqueta, SUM(haber - debe)::float8 AS monto ${base} AND a.tipo_cuenta = 'ingreso' GROUP BY 1 HAVING SUM(haber - debe) <> 0 ORDER BY 2 DESC LIMIT 10`, par),
      this.q(`SELECT COUNT(DISTINCT asiento)::int AS asientos ${base}`, par),
    ]);
    const meses = porMes.map((r) => ({ etiqueta: r.mes, ingresos: redondear(num(r.ingresos)), gastos: redondear(num(r.gastos)), resultado: redondear(num(r.ingresos) - num(r.gastos)) }));
    const ing = meses.reduce((s, m) => s + m.ingresos, 0);
    const gas = meses.reduce((s, m) => s + m.gastos, 0);
    return {
      kpis: { ingresos: redondear(ing), gastos: redondear(gas), resultado: redondear(ing - gas), margenPct: ing > 0 ? redondear(((ing - gas) / ing) * 100) : 0, asientos: num(asientos[0]?.asientos) },
      porMes: meses,
      topGastos: topGastos.map((r) => ({ etiqueta: r.etiqueta, monto: redondear(num(r.monto)) })),
      topIngresos: ingresos.map((r) => ({ etiqueta: r.etiqueta, monto: redondear(num(r.monto)) })),
    };
  }

  // ---------------------------------------------------------------- Enlace para Power BI

  private hash(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }

  async estadoEnlace() {
    const hash = await this.config.get<string | undefined>(CLAVE_TOKEN);
    return {
      activo: Boolean(hash),
      creado: (await this.config.get<string | undefined>(CLAVE_TOKEN_CREADO)) || null,
      ultimoUso: (await this.config.get<string | undefined>(CLAVE_TOKEN_USO)) || null,
    };
  }

  // La clave se muestra UNA sola vez; en la base solo queda su huella (SHA-256).
  async generarEnlace(): Promise<{ token: string }> {
    const token = `cb_${randomBytes(32).toString('base64url')}`;
    await this.config.guardar(CLAVE_TOKEN, this.hash(token).toString('hex'));
    await this.config.guardar(CLAVE_TOKEN_CREADO, new Date().toISOString());
    await this.config.guardar(CLAVE_TOKEN_USO, '');
    return { token };
  }

  async revocarEnlace(): Promise<void> {
    await this.config.guardar(CLAVE_TOKEN, '');
    await this.config.guardar(CLAVE_TOKEN_USO, '');
  }

  async tokenValido(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const guardado = await this.config.get<string | undefined>(CLAVE_TOKEN);
    if (!guardado) return false;
    const esperado = Buffer.from(guardado, 'hex');
    const recibido = this.hash(token);
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return false;
    await this.config.guardar(CLAVE_TOKEN_USO, new Date().toISOString());
    return true;
  }
}
