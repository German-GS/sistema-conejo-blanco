import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { SistemaConfigService } from '../sistema-config.service.js';
import { DATASET_POR_ID, DATASETS, SQL_BASE, type DatasetAnalisis } from './analisis.datasets.js';

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

  private async resumenVentas(desde: string | null, hasta: string | null) {
    const base = `FROM (${SQL_BASE.VENTAS}) v WHERE v.vigente AND ($1::text IS NULL OR v.fecha >= $1::text) AND ($2::text IS NULL OR v.fecha <= $2::text)`;
    const p = [desde, hasta];
    const agrupado = (col: string, limite = 10) =>
      this.q<{ etiqueta: string; venta: number; margen: number }>(
        `SELECT COALESCE(NULLIF(${col}, ''), 'Sin dato') AS etiqueta, COALESCE(SUM(v.venta_neta), 0)::float8 AS venta, COALESCE(SUM(v.margen), 0)::float8 AS margen ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limite}`,
        p,
      );
    const [[k], porMes, topClientes, productos, porVendedor, porProvincia, porUbicacion, porTipoPago] = await Promise.all([
      this.q(
        `SELECT COALESCE(SUM(venta_neta),0)::float8 AS venta, COALESCE(SUM(iva),0)::float8 AS iva, COALESCE(SUM(costo),0)::float8 AS costo, COALESCE(SUM(margen),0)::float8 AS margen,
          COUNT(DISTINCT consecutivo)::int AS facturas, COUNT(DISTINCT cliente_id)::int AS clientes, COALESCE(SUM(cantidad),0)::float8 AS unidades,
          COUNT(*) FILTER (WHERE costo = 0)::int AS lineas_sin_costo, COUNT(*)::int AS lineas ${base}`,
        p,
      ),
      this.q<{ mes: string; venta: number; margen: number }>(`SELECT substr(v.fecha, 1, 7) AS mes, SUM(v.venta_neta)::float8 AS venta, SUM(v.margen)::float8 AS margen ${base} GROUP BY 1 ORDER BY 1`, p),
      agrupado('v.cliente'),
      this.q<{ etiqueta: string; venta: number }>(`SELECT COALESCE(v.producto_codigo || ' ' || v.producto, 'Sin producto') AS etiqueta, SUM(v.venta_neta)::float8 AS venta ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 300`, p),
      agrupado('v.vendedor'),
      agrupado('v.provincia'),
      agrupado('v.ubicacion'),
      agrupado('v.tipo_pago'),
    ]);
    const venta = num(k.venta);
    // Análisis ABC (Pareto): A = el grupo que junta el 80 % de la venta, B hasta 95 %, C el resto.
    let acum = 0;
    const abc = productos.map((r) => {
      acum += num(r.venta);
      const pctAcum = venta > 0 ? (acum / venta) * 100 : 0;
      const antes = venta > 0 ? ((acum - num(r.venta)) / venta) * 100 : 0;
      return { etiqueta: r.etiqueta, venta: redondear(num(r.venta)), acumuladoPct: redondear(pctAcum), clase: antes < 80 ? 'A' : antes < 95 ? 'B' : 'C' };
    });
    return {
      kpis: {
        venta: redondear(venta),
        iva: redondear(num(k.iva)),
        costo: redondear(num(k.costo)),
        margen: redondear(num(k.margen)),
        margenPct: venta > 0 ? redondear((num(k.margen) / venta) * 100) : 0,
        facturas: num(k.facturas),
        clientes: num(k.clientes),
        unidades: num(k.unidades),
        ticketPromedio: num(k.facturas) > 0 ? redondear(venta / num(k.facturas)) : 0,
        lineasSinCosto: num(k.lineas_sin_costo),
        lineas: num(k.lineas),
      },
      porMes: porMes.map((r) => ({ etiqueta: r.mes, venta: redondear(num(r.venta)), margen: redondear(num(r.margen)) })),
      topClientes: topClientes.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      abc: { filas: abc.slice(0, 15), productosTotal: abc.length, clases: { A: abc.filter((r) => r.clase === 'A').length, B: abc.filter((r) => r.clase === 'B').length, C: abc.filter((r) => r.clase === 'C').length } },
      porVendedor: porVendedor.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porProvincia: porProvincia.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porUbicacion: porUbicacion.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
      porTipoPago: porTipoPago.map((r) => ({ etiqueta: r.etiqueta, venta: redondear(num(r.venta)) })),
    };
  }

  private async resumenCartera() {
    const base = `FROM (${SQL_BASE.CARTERA}) c`;
    const [[k], tramos, deudores, masVencidas] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(saldo),0)::float8 AS saldo, COALESCE(SUM(saldo) FILTER (WHERE dias_vencida > 0),0)::float8 AS vencido, COUNT(*)::int AS facturas, COUNT(DISTINCT cliente_id)::int AS clientes, COALESCE(AVG(dias_vencida) FILTER (WHERE dias_vencida > 0),0)::float8 AS dias_prom_vencida ${base}`),
      this.q<{ etiqueta: string; saldo: number; facturas: number }>(`SELECT tramo AS etiqueta, SUM(saldo)::float8 AS saldo, COUNT(*)::int AS facturas ${base} GROUP BY 1 ORDER BY 1`),
      this.q<{ etiqueta: string; saldo: number }>(`SELECT COALESCE(cliente, 'Sin cliente') AS etiqueta, SUM(saldo)::float8 AS saldo ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      this.q(`SELECT consecutivo, cliente, fecha_vence, saldo, dias_vencida ${base} WHERE dias_vencida > 0 ORDER BY dias_vencida DESC LIMIT 10`),
    ]);
    return {
      kpis: { saldo: redondear(num(k.saldo)), vencido: redondear(num(k.vencido)), vencidoPct: num(k.saldo) > 0 ? redondear((num(k.vencido) / num(k.saldo)) * 100) : 0, facturas: num(k.facturas), clientes: num(k.clientes), diasPromVencida: Math.round(num(k.dias_prom_vencida)) },
      tramos: tramos.map((r) => ({ etiqueta: r.etiqueta.slice(2), saldo: redondear(num(r.saldo)), facturas: num(r.facturas) })),
      deudores: deudores.map((r) => ({ etiqueta: r.etiqueta, saldo: redondear(num(r.saldo)) })),
      masVencidas: masVencidas.map((r) => ({ consecutivo: r.consecutivo, cliente: r.cliente, venceEl: r.fecha_vence, saldo: redondear(num(r.saldo)), diasVencida: num(r.dias_vencida) })),
    };
  }

  private async resumenInventario(desde: string | null, hasta: string | null) {
    const stock = `FROM (${SQL_BASE.INVENTARIO_STOCK}) s`;
    const mov = `FROM (${SQL_BASE.INVENTARIO_MOVIMIENTOS}) m WHERE ($1::text IS NULL OR m.fecha >= $1::text) AND ($2::text IS NULL OR m.fecha <= $2::text)`;
    const [[k], porUbicacion, topValor, porTipo] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(cantidad),0)::int AS pares, COALESCE(SUM(valor_costo),0)::float8 AS costo, COALESCE(SUM(valor_venta),0)::float8 AS venta, COUNT(DISTINCT variante_id) FILTER (WHERE cantidad > 0)::int AS variantes, COUNT(*) FILTER (WHERE cantidad < 0)::int AS negativos ${stock}`),
      this.q<{ etiqueta: string; pares: number; costo: number }>(`SELECT ubicacion AS etiqueta, SUM(cantidad)::int AS pares, SUM(valor_costo)::float8 AS costo ${stock} GROUP BY 1 ORDER BY 3 DESC`),
      this.q<{ etiqueta: string; pares: number; costo: number }>(`SELECT producto_codigo || ' ' || producto AS etiqueta, SUM(cantidad)::int AS pares, SUM(valor_costo)::float8 AS costo ${stock} GROUP BY 1 ORDER BY 3 DESC LIMIT 10`),
      this.q<{ etiqueta: string; movimientos: number; pares: number }>(`SELECT tipo AS etiqueta, COUNT(*)::int AS movimientos, SUM(cantidad)::int AS pares ${mov} GROUP BY 1 ORDER BY 2 DESC`, [desde, hasta]),
    ]);
    return {
      kpis: { pares: num(k.pares), valorCosto: redondear(num(k.costo)), valorVenta: redondear(num(k.venta)), variantesConStock: num(k.variantes), stockNegativo: num(k.negativos) },
      porUbicacion: porUbicacion.map((r) => ({ etiqueta: r.etiqueta, pares: num(r.pares), valor: redondear(num(r.costo)) })),
      topValor: topValor.map((r) => ({ etiqueta: r.etiqueta, pares: num(r.pares), valor: redondear(num(r.costo)) })),
      porTipoMovimiento: porTipo.map((r) => ({ etiqueta: r.etiqueta, movimientos: num(r.movimientos), pares: num(r.pares) })),
    };
  }

  // Siempre sobre la versión anonimizada: el tablero muestra totales y promedios, nunca personas.
  private async resumenPlanilla(desde: string | null, hasta: string | null) {
    const base = `FROM (${SQL_BASE.planilla(true)}) p WHERE p.estado IN ('aprobada','pagada') AND ($1::text IS NULL OR p.fecha_hasta >= $1::text) AND ($2::text IS NULL OR p.fecha_hasta <= $2::text)`;
    const par = [desde, hasta];
    const [[k], porPlanilla, porPuesto] = await Promise.all([
      this.q(`SELECT COALESCE(SUM(bruto),0)::float8 AS bruto, COALESCE(SUM(neto),0)::float8 AS neto, COALESCE(SUM(cargas_patronales),0)::float8 AS cargas, COALESCE(SUM(provisiones),0)::float8 AS provisiones, COALESCE(SUM(monto_extra),0)::float8 AS extras, COALESCE(SUM(horas_extra),0)::float8 AS horas_extra, COALESCE(SUM(renta),0)::float8 AS renta, COUNT(DISTINCT fecha_hasta)::int AS planillas, COUNT(DISTINCT empleado_codigo)::int AS empleados ${base}`, par),
      this.q<{ desde: string; hasta: string; bruto: number; neto: number; cargas: number; extras: number; horas_extra: number; empleados: number }>(`SELECT fecha_desde AS desde, fecha_hasta AS hasta, SUM(bruto)::float8 AS bruto, SUM(neto)::float8 AS neto, SUM(cargas_patronales)::float8 AS cargas, SUM(monto_extra)::float8 AS extras, SUM(horas_extra)::float8 AS horas_extra, COUNT(*)::int AS empleados ${base} GROUP BY 1, 2 ORDER BY 2`, par),
      this.q<{ etiqueta: string; empleados: number; bruto: number; extras: number; horas_extra: number }>(`SELECT COALESCE(NULLIF(puesto, ''), 'Sin puesto') AS etiqueta, COUNT(DISTINCT empleado_codigo)::int AS empleados, SUM(bruto)::float8 AS bruto, SUM(monto_extra)::float8 AS extras, SUM(horas_extra)::float8 AS horas_extra ${base} GROUP BY 1 ORDER BY 3 DESC LIMIT 12`, par),
    ]);
    const costoTotal = num(k.bruto) + num(k.cargas) + num(k.provisiones);
    return {
      kpis: { bruto: redondear(num(k.bruto)), neto: redondear(num(k.neto)), cargas: redondear(num(k.cargas)), provisiones: redondear(num(k.provisiones)), costoTotal: redondear(costoTotal), extras: redondear(num(k.extras)), horasExtra: redondear(num(k.horas_extra)), extrasPct: num(k.bruto) > 0 ? redondear((num(k.extras) / num(k.bruto)) * 100) : 0, renta: redondear(num(k.renta)), planillas: num(k.planillas), empleados: num(k.empleados) },
      porPlanilla: porPlanilla.map((r) => ({ etiqueta: `${r.desde.slice(5)} a ${r.hasta.slice(5)}`, hasta: r.hasta, bruto: redondear(num(r.bruto)), neto: redondear(num(r.neto)), cargas: redondear(num(r.cargas)), extras: redondear(num(r.extras)), horasExtra: redondear(num(r.horas_extra)), empleados: num(r.empleados) })),
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
