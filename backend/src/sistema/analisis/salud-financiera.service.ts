import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IntegridadService } from '../../contabilidad/integridad.service.js';
import { FACTURA_JOINS, FACTURA_VIGENTE, SQL_BASE } from './analisis.datasets.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const redondear = (v: number): number => Math.round(v * 100) / 100;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const hoyCR = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

type Estado = 'ok' | 'atencion' | 'alerta';
type Severidad = 'error' | 'atencion';

export interface Chequeo {
  codigo: string;
  grupo: string;
  titulo: string;
  estado: 'ok' | 'atencion' | 'error' | 'sin_verificar';
  problemas: number;
  resumen: string;
  donde: string;
  ejemplos: Array<Record<string, unknown>>;
}

interface Cruce {
  codigo: string;
  grupo: string;
  titulo: string;
  severidad: Severidad;
  // Una fila por cada diferencia encontrada; vacío = todo cuadra.
  sql: string;
  params?: unknown[];
  donde: string;
  resumen: (filas: Array<Record<string, unknown>>) => string;
}

// Dónde buscar cuando falla cada una de las reglas de integridad que ya existen (IntegridadService).
const DONDE_INTEGRIDAD: Record<string, string> = {
  'asientos-cuadrados': 'Libro diario: busque el asiento indicado; una de sus líneas tiene un monto mal digitado o falta la contrapartida.',
  'asientos-con-lineas': 'Libro diario: el asiento quedó sin líneas, probablemente por un error al guardarlo. Se corrige reversándolo y registrándolo de nuevo.',
  'lineas-asiento-validas': 'Libro diario: una línea tiene debe y haber a la vez, está en cero o es negativa.',
  'balance-comprobacion': 'Libro diario: el total del debe no es igual al del haber; revise primero la regla "cada asiento tiene debe = haber".',
  'pedido-lineas': 'Pedidos: una línea tiene un monto que no corresponde a pares × precio con descuento. Se corrige editando el pedido.',
  'pedido-totales': 'Pedidos: el subtotal, IVA o total no coincide con la suma de sus líneas.',
  'factura-lineas': 'Facturas: el subtotal de una línea no coincide con cantidad × precio − descuento.',
  'factura-manual-totales': 'Facturas manuales: el total no coincide con la suma de sus líneas.',
  'factura-igual-pedido': 'Facturas: una factura generada desde un pedido tiene montos distintos a los del pedido (el pedido se pudo editar después de facturar).',
  'factura-nota-credito': 'Facturas: tiene nota de crédito pero no quedó marcada como anulada. Revise la factura y su nota.',
  'pago-aplicaciones': 'Pagos recibidos: el total del recibo no coincide con lo aplicado a facturas.',
  sobrepago: 'Pagos recibidos: a una factura se le aplicó más de su total. Revise los recibos aplicados a esa factura.',
  'cxc-libro-vs-facturas': 'Cuentas por cobrar: vea abajo "Cuentas por cobrar por cliente" para saber en qué cliente está la diferencia.',
  'inventario-stock-vs-movimientos': 'Bodega: la existencia de una variante no coincide con la suma de sus movimientos; suele ser un ajuste hecho directamente.',
  'inventario-sin-negativos': 'Bodega: hay existencias en negativo; se vendió o trasladó más de lo registrado como entrada. Revise el kardex de esa variante.',
  'planilla-lineas': 'Planilla: una línea de planilla tiene cálculos que no cuadran entre sí.',
  'planilla-totales': 'Planilla: los totales de una planilla no coinciden con la suma de sus líneas.',
  'asientos-numerados': 'Libro diario: hay asientos sin número o con número repetido.',
  'periodos-cerrados': 'Cierre mensual: hay asientos fechados dentro de un mes ya cerrado. Reabra el período (solo el administrador del sistema) o corrija la fecha.',
  'cierre-fiscal-resultados-en-cero': 'Cierre fiscal: después del cierre del año las cuentas de ingresos y gastos deberían quedar en cero y no lo están.',
  'planilla-asiento-aprobacion': 'Planilla: una planilla aprobada no tiene su asiento, o el asiento no coincide con la planilla. Se corrige anulándola y generándola de nuevo.',
  'planilla-cargas-ins': 'Planilla: las cargas del INS (póliza de riesgos) del asiento no coinciden con las de la planilla.',
  'planilla-asiento-pago': 'Planilla: una planilla pagada no tiene el asiento del pago, o su monto es distinto al neto.',
  'planilla-anulada-reversada': 'Planilla: una planilla anulada sigue con asiento sin reversar.',
  'cxc-empleados': 'Planilla: el saldo de préstamos a empleados (1250) no coincide con las deudas activas de los empleados.',
  'planilla-pasivos-sin-negativos': 'Planilla: una cuenta por pagar de planilla (salarios, cargas, renta, provisiones o INS) quedó con saldo contrario; probablemente se pagó dos veces o se pagó sin aprobar.',
};

const GRUPO_INTEGRIDAD = (codigo: string): string =>
  codigo.startsWith('asientos') || codigo.startsWith('lineas') || codigo.startsWith('balance') || codigo.startsWith('periodos') || codigo.startsWith('cierre')
    ? 'Libro mayor'
    : codigo.startsWith('planilla') || codigo === 'cxc-empleados'
      ? 'Planilla'
      : codigo.startsWith('inventario')
        ? 'Inventario'
        : codigo.startsWith('cxc') || codigo.startsWith('pago') || codigo === 'sobrepago'
          ? 'Cartera'
          : 'Ventas';

const MAYOR = SQL_BASE.CONTABILIDAD;
const VENTA = `(CASE WHEN m.cuenta_codigo IN ('4100','4110','4120') THEN m.haber - m.debe ELSE 0 END)`;

const CRUCES: Cruce[] = [
  {
    codigo: 'facturas-sin-asiento',
    grupo: 'Ventas',
    titulo: 'Toda factura tiene su asiento de venta',
    severidad: 'error',
    sql: `SELECT f.consecutivo, to_char(f.fecha, 'YYYY-MM-DD') AS fecha, f.total::float8 AS total FROM facturas f
          WHERE NOT EXISTS (SELECT 1 FROM asientos_contables a WHERE a.origen_tipo = 'factura' AND a.origen_id = f.id) ORDER BY f.fecha`,
    donde: 'Facturas: la factura se emitió pero su venta no llegó al libro mayor, así que las ventas contables están por debajo de las reales. Hay que regenerar el asiento.',
    resumen: (f) => `${f.length} factura(s) sin asiento contable.`,
  },
  {
    codigo: 'pagos-sin-asiento',
    grupo: 'Cartera',
    titulo: 'Todo pago recibido tiene su asiento',
    severidad: 'error',
    sql: `SELECT p.numero, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p.total::float8 AS total, p.estado FROM pagos_recibidos p
          WHERE NOT EXISTS (SELECT 1 FROM asientos_contables a WHERE a.origen_tipo = 'pago_recibido' AND a.origen_id = p.id) ORDER BY p.fecha`,
    donde: 'Pagos recibidos: el recibo existe pero el dinero no está en caja o bancos del mayor; por eso la cartera o la caja no cuadran.',
    resumen: (f) => `${f.length} recibo(s) sin asiento contable.`,
  },
  {
    codigo: 'asientos-huerfanos',
    grupo: 'Libro mayor',
    titulo: 'Todo asiento automático apunta a un documento que existe',
    severidad: 'error',
    sql: `SELECT a.numero, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.origen_tipo, a.descripcion FROM asientos_contables a
          WHERE (a.origen_tipo = 'factura' AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.id = a.origen_id))
             OR (a.origen_tipo = 'nota_credito' AND NOT EXISTS (SELECT 1 FROM notas_credito n WHERE n.id = a.origen_id))
             OR (a.origen_tipo IN ('planilla', 'planilla_pago') AND NOT EXISTS (SELECT 1 FROM planilla_planillas p WHERE p.id = a.origen_id))
             OR (a.origen_tipo = 'pago_recibido' AND NOT EXISTS (SELECT 1 FROM pagos_recibidos p WHERE p.id = a.origen_id))
          ORDER BY a.numero`,
    donde: 'Libro diario: el asiento quedó vivo aunque se borró su documento (factura, planilla, recibo). Hay que reversarlo.',
    resumen: (f) => `${f.length} asiento(s) cuyo documento de origen ya no existe.`,
  },
  {
    codigo: 'ventas-mayor-vs-facturas',
    grupo: 'Ventas',
    titulo: 'Ventas del mayor = facturas y tiquetes de tienda vigentes, mes por mes',
    severidad: 'atencion',
    sql: `WITH mayor AS (SELECT substr(m.fecha, 1, 7) AS mes, SUM(${VENTA}) AS v FROM (${MAYOR}) m
                         WHERE m.cuenta_codigo IN ('4100','4110','4120') AND COALESCE(m.origen_tipo, '') NOT LIKE 'cierre%' GROUP BY 1),
               op AS (SELECT mes, SUM(v) AS v FROM (
                        SELECT to_char(f.fecha, 'YYYY-MM') AS mes, f.subtotal AS v FROM facturas f ${FACTURA_JOINS} WHERE ${FACTURA_VIGENTE}
                        UNION ALL
                        SELECT to_char(pv.fecha AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM') AS mes, pv.total AS v FROM pos_ventas pv WHERE pv.estado = 'vigente' AND NOT pv.es_prueba) x GROUP BY 1)
          SELECT COALESCE(mayor.mes, op.mes) AS mes, COALESCE(mayor.v, 0)::float8 AS mayor, COALESCE(op.v, 0)::float8 AS facturas,
                 (COALESCE(mayor.v, 0) - COALESCE(op.v, 0))::float8 AS diferencia
          FROM mayor FULL JOIN op ON op.mes = mayor.mes WHERE ABS(COALESCE(mayor.v, 0) - COALESCE(op.v, 0)) > 0.5 ORDER BY 1`,
    donde: 'Si el mayor tiene MÁS que las facturas: hay un asiento manual a Ventas (4100) o un asiento de una factura que luego se anuló sin reversar. Si tiene MENOS: hay facturas sin asiento (vea esa verificación) o con otra fecha.',
    resumen: (f) => `${f.length} mes(es) donde las ventas del mayor y las facturas no coinciden.`,
  },
  {
    codigo: 'iva-mayor-vs-facturas',
    grupo: 'Ventas',
    titulo: 'IVA por pagar de ventas (2200) = IVA de las facturas vigentes',
    severidad: 'atencion',
    sql: `WITH mayor AS (SELECT COALESCE(SUM(m.haber - m.debe), 0) AS v FROM (${MAYOR}) m WHERE m.cuenta_codigo = '2200' AND m.factura_id IS NOT NULL),
               op AS (SELECT COALESCE(SUM(f.iva_monto), 0) AS v FROM facturas f ${FACTURA_JOINS} WHERE ${FACTURA_VIGENTE})
          SELECT mayor.v::float8 AS mayor, op.v::float8 AS facturas, (mayor.v - op.v)::float8 AS diferencia FROM mayor, op WHERE ABS(mayor.v - op.v) > 0.5`,
    donde: 'Una factura con IVA distinto en el asiento y en la factura, o una factura anulada cuyo IVA no se devolvió en el mayor. Importa porque de aquí sale la declaración del IVA.',
    resumen: (f) => (f[0] ? `El mayor tiene ${f[0].mayor} de IVA y las facturas ${f[0].facturas}.` : ''),
  },
  {
    codigo: 'ventas-sin-costo',
    grupo: 'Ventas',
    titulo: 'Toda venta registró su costo de ventas',
    severidad: 'atencion',
    sql: `SELECT f.consecutivo, to_char(f.fecha, 'YYYY-MM-DD') AS fecha, f.subtotal::float8 AS venta FROM facturas f ${FACTURA_JOINS}
          WHERE ${FACTURA_VIGENTE} AND f.subtotal > 0
            AND NOT EXISTS (SELECT 1 FROM asientos_contables a JOIN lineas_asiento l ON l.asiento_id = a.id JOIN cuentas_contables cu ON cu.id = l.cuenta_id
                            WHERE a.origen_tipo = 'factura' AND a.origen_id = f.id AND cu.codigo = '5100')
          ORDER BY f.fecha DESC`,
    donde: 'Catálogo: los productos vendidos no tenían costo cargado, así que el margen sale inflado. Cargue el costo de cada variante; las ventas ya hechas quedan sin costo y hay que ajustarlas con un asiento manual.',
    resumen: (f) => `${f.length} factura(s) sin costo de ventas: el margen bruto está sobrestimado.`,
  },
  {
    codigo: 'pos-ventas-sin-asiento',
    grupo: 'Ventas',
    titulo: 'Todo tiquete de tienda (POS) tiene su asiento',
    severidad: 'error',
    sql: `SELECT u.codigo || '-' || lpad(v.numero::text, 6, '0') AS tiquete, to_char(v.fecha AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS fecha, v.total::float8 AS total
          FROM pos_ventas v JOIN ubicaciones u ON u.id = v.ubicacion_id
          WHERE v.estado = 'vigente' AND NOT v.es_prueba AND NOT EXISTS (SELECT 1 FROM asientos_contables a WHERE a.origen_tipo = 'pos_venta' AND a.origen_id = v.id) ORDER BY v.fecha`,
    donde: 'POS: la venta se cobró y descontó inventario, pero no llegó al libro mayor; las ventas contables quedan por debajo de las de la tienda.',
    resumen: (f) => `${f.length} tiquete(s) de tienda sin asiento contable.`,
  },
  {
    codigo: 'pos-sin-costo',
    grupo: 'Inventario',
    titulo: 'Los productos vendidos en tienda tienen costo cargado',
    severidad: 'atencion',
    sql: `SELECT l.codigo AS producto_codigo, l.color, SUM(l.cantidad)::int AS pares_vendidos FROM pos_venta_lineas l JOIN pos_ventas v ON v.id = l.venta_id
          WHERE v.estado = 'vigente' AND NOT v.es_prueba AND COALESCE(l.costo_unitario, 0) = 0 GROUP BY 1, 2 ORDER BY 3 DESC`,
    donde: 'Catálogo: cargue el costo de esos productos; sin él, el costo de ventas de la tienda queda en cero y el margen sale inflado.',
    resumen: (f) => `${f.length} producto(s) vendidos en tienda sin costo.`,
  },
  {
    codigo: 'pos-ordenes-sin-asiento',
    grupo: 'Inventario',
    titulo: 'Todo pedido de tienda recibido tiene su asiento de traslado',
    severidad: 'error',
    sql: `SELECT u.codigo || '-R' || lpad(o.numero::text, 4, '0') AS pedido, u.nombre AS tienda, to_char(o.atendida_en AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS recibido
          FROM pos_ordenes o JOIN ubicaciones u ON u.id = o.ubicacion_id
          WHERE o.estado = 'entregada' AND NOT o.es_prueba AND EXISTS (SELECT 1 FROM pos_orden_lineas l WHERE l.orden_id = o.id AND l.costo_tienda IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM asientos_contables a WHERE a.origen_tipo = 'pos_orden' AND a.origen_id = o.id) ORDER BY o.fecha`,
    donde: 'POS → Pedidos de tienda: el pedido figura recibido y el inventario de la tienda subió, pero el traslado no llegó al libro mayor (inventario de tiendas contra inventario de bodega).',
    resumen: (f) => `${f.length} pedido(s) de tienda recibidos sin asiento.`,
  },
  {
    codigo: 'cxc-por-cliente',
    grupo: 'Cartera',
    titulo: 'Cuentas por cobrar por cliente: mayor = facturas abiertas',
    severidad: 'atencion',
    sql: `WITH l AS (SELECT m.cliente_id, SUM(m.debe - m.haber) AS saldo FROM (${MAYOR}) m WHERE m.cuenta_codigo = '1200' GROUP BY 1),
               o AS (SELECT c.cliente_id, SUM(c.saldo) AS saldo FROM (${SQL_BASE.CARTERA}) c GROUP BY 1)
          SELECT COALESCE(cc.nombre, '(sin cliente asociado)') AS cliente, COALESCE(l.saldo, 0)::float8 AS mayor, COALESCE(o.saldo, 0)::float8 AS facturas,
                 (COALESCE(l.saldo, 0) - COALESCE(o.saldo, 0))::float8 AS diferencia
          FROM l FULL JOIN o ON COALESCE(o.cliente_id, '00000000-0000-0000-0000-000000000000') = COALESCE(l.cliente_id, '00000000-0000-0000-0000-000000000000')
          LEFT JOIN clientes cc ON cc.id = COALESCE(l.cliente_id, o.cliente_id)
          WHERE ABS(COALESCE(l.saldo, 0) - COALESCE(o.saldo, 0)) > 0.5 ORDER BY ABS(COALESCE(l.saldo, 0) - COALESCE(o.saldo, 0)) DESC`,
    donde: 'Mire ese cliente: si el mayor tiene MENOS que sus facturas, hay un pago sin aplicar a una factura (o aplicado a otra); si tiene MÁS, hay una factura a crédito sin cobrar que no aparece abierta, o un asiento manual a 1200. "Sin cliente asociado" son asientos manuales.',
    resumen: (f) => `${f.length} cliente(s) donde el mayor y las facturas abiertas difieren.`,
  },
  {
    codigo: 'inventario-mayor-vs-existencias',
    grupo: 'Inventario',
    titulo: 'Inventario del mayor (1300–1320) = existencias a costo',
    severidad: 'atencion',
    sql: `WITH mayor AS (SELECT COALESCE(SUM(m.debe - m.haber), 0) AS v FROM (${MAYOR}) m WHERE m.cuenta_codigo IN ('1300','1305','1310','1320')),
               bodega AS (SELECT COALESCE(SUM(s.valor_costo), 0) AS v FROM (${SQL_BASE.INVENTARIO_STOCK}) s)
          SELECT mayor.v::float8 AS mayor, bodega.v::float8 AS bodega, (mayor.v - bodega.v)::float8 AS diferencia FROM mayor, bodega WHERE ABS(mayor.v - bodega.v) > 0.5`,
    donde: 'Si bodega vale MÁS que el mayor: se cargaron existencias (ingreso inicial) sin asiento contable de inventario, o se actualizó el costo de un producto después. Si vale MENOS: hay ventas con un costo distinto al actual o mermas sin registrar.',
    resumen: (f) => (f[0] ? `El mayor dice ${f[0].mayor} y la bodega ${f[0].bodega} a costo.` : ''),
  },
  {
    codigo: 'inventario-sin-costo',
    grupo: 'Inventario',
    titulo: 'Todo producto con existencias tiene costo cargado',
    severidad: 'atencion',
    sql: `SELECT s.producto_codigo, s.color, s.ubicacion, s.cantidad FROM (${SQL_BASE.INVENTARIO_STOCK}) s
          WHERE s.cantidad > 0 AND COALESCE(s.costo_unitario, 0) = 0 ORDER BY s.cantidad DESC`,
    donde: 'Inventario: abra el producto y cargue el costo de la variante. Sin costo, el inventario vale menos de lo real y el costo de ventas queda en cero.',
    resumen: (f) => `${f.length} variante(s) con existencias pero sin costo.`,
  },
  {
    codigo: 'saldos-contra-naturaleza',
    grupo: 'Libro mayor',
    titulo: 'Ninguna cuenta tiene saldo contrario a su naturaleza',
    severidad: 'atencion',
    sql: `SELECT cu.codigo, cu.nombre, cu.naturaleza::text AS naturaleza, SUM(la.debe - la.haber)::float8 AS saldo_deudor
          FROM lineas_asiento la JOIN cuentas_contables cu ON cu.id = la.cuenta_id
          GROUP BY 1, 2, 3
          HAVING (cu.naturaleza::text = 'deudora' AND SUM(la.debe - la.haber) < -0.5) OR (cu.naturaleza::text = 'acreedora' AND SUM(la.debe - la.haber) > 0.5)
          ORDER BY 1`,
    donde: 'Una cuenta de activo con saldo acreedor (por ejemplo, caja o bancos en negativo) significa que se pagó más de lo que había registrado; una de pasivo con saldo deudor, que se pagó una obligación dos veces. Revise los últimos movimientos de esa cuenta en el libro mayor.',
    resumen: (f) => `${f.length} cuenta(s) con saldo contrario a su naturaleza.`,
  },
  {
    codigo: 'asientos-fecha-futura',
    grupo: 'Libro mayor',
    titulo: 'Ningún asiento tiene fecha futura',
    severidad: 'atencion',
    sql: `SELECT a.numero, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.origen_tipo, a.descripcion FROM asientos_contables a
          WHERE a.fecha > (now() AT TIME ZONE 'America/Costa_Rica')::date ORDER BY a.fecha`,
    donde: 'Libro diario: probablemente un año o día mal digitado en un asiento manual. Adelanta ingresos o gastos a un mes que aún no llega.',
    resumen: (f) => `${f.length} asiento(s) con fecha futura.`,
  },
  {
    codigo: 'meses-sin-cerrar',
    grupo: 'Cierres',
    titulo: 'Los meses anteriores están cerrados',
    severidad: 'atencion',
    sql: `SELECT to_char(a.fecha, 'YYYY-MM') AS mes, COUNT(*)::int AS asientos FROM asientos_contables a
          WHERE COALESCE(a.origen_tipo, '') NOT LIKE 'cierre%'
            AND to_char(a.fecha, 'YYYY-MM') < to_char(now() AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM')
            AND to_char(a.fecha, 'YYYY-MM') NOT IN (SELECT periodo FROM periodos_contables_cerrados)
          GROUP BY 1 ORDER BY 1`,
    donde: 'Cierre mensual: mientras un mes siga abierto, alguien puede registrar asientos en él y cambiar sus cifras. Ciérrelo cuando el contador lo revise.',
    resumen: (f) => `${f.length} mes(es) con movimientos sin cerrar.`,
  },
  {
    codigo: 'planillas-sin-pagar',
    grupo: 'Planilla',
    titulo: 'Las planillas aprobadas ya se pagaron',
    severidad: 'atencion',
    sql: `SELECT to_char(p.fecha_desde, 'YYYY-MM-DD') AS desde, to_char(p.fecha_hasta, 'YYYY-MM-DD') AS hasta, p.total_neto::float8 AS neto,
                 to_char(p.aprobada_en AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS aprobada
          FROM planilla_planillas p
          WHERE p.estado::text = 'aprobada' AND p.aprobada_en < now() - interval '3 days' ORDER BY p.fecha_hasta`,
    donde: 'Planillas: se aprobó (el gasto ya está en el mayor) pero no se marcó como pagada. Salarios por pagar (2100) sigue con saldo; pague la planilla o confirme que el pago se hizo.',
    resumen: (f) => `${f.length} planilla(s) aprobada(s) hace más de 3 días y sin pagar.`,
  },
];

interface Saldo {
  codigo: string;
  nombre: string;
  tipo: string;
  saldo: number; // debe − haber
}

const entre = (codigo: string, desde: number, hasta: number): boolean => Number(codigo) >= desde && Number(codigo) <= hasta;

@Injectable()
export class SaludFinancieraService {
  private readonly logger = new Logger(SaludFinancieraService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly integridad: IntegridadService,
  ) {}

  private q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  async reporte(f: { desde?: string; hasta?: string }) {
    for (const v of [f.desde, f.hasta]) if (v && !FECHA.test(v)) throw new BadRequestException('Las fechas deben ir como AAAA-MM-DD.');
    const hasta = f.hasta || hoyCR();
    const [saldos, primera] = await Promise.all([
      this.q<{ codigo: string; nombre: string; tipo: string; saldo: number }>(
        `SELECT cu.codigo, cu.nombre, cu.tipo::text AS tipo, SUM(la.debe - la.haber)::float8 AS saldo
         FROM lineas_asiento la JOIN asientos_contables a ON a.id = la.asiento_id JOIN cuentas_contables cu ON cu.id = la.cuenta_id
         WHERE to_char(a.fecha, 'YYYY-MM-DD') <= $1 GROUP BY 1, 2, 3`,
        [hasta],
      ),
      this.q<{ f: string | null }>(`SELECT to_char(MIN(fecha), 'YYYY-MM-DD') AS f FROM asientos_contables WHERE COALESCE(origen_tipo, '') NOT LIKE 'cierre%'`),
    ]);
    const desde = f.desde || primera[0]?.f || hasta;
    const dias = Math.max(1, Math.round((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000) + 1);

    const [pyg, tendencia, caja, chequeos] = await Promise.all([this.resultados(desde, hasta), this.tendenciaMensual(desde, hasta), this.cajaMensual(hasta), this.chequeos()]);
    const indicadores = this.indicadores(saldos.map((s) => ({ ...s, saldo: num(s.saldo) })), pyg, dias);
    // La caja de un mes sin movimientos es la del último mes que tuvo.
    const cajaOrdenada = [...caja.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const cajaAl = (mes: string): number | null => cajaOrdenada.filter(([m]) => m <= mes).at(-1)?.[1] ?? null;
    const meses = tendencia.map((t) => ({ ...t, caja: cajaAl(t.mes) }));
    const errores = chequeos.filter((c) => c.estado === 'error').length;
    const avisos = chequeos.filter((c) => c.estado === 'atencion').length;
    const alertas = indicadores.grupos.flatMap((g) => g.items).filter((i) => i.estado === 'alerta').length;
    const atenciones = indicadores.grupos.flatMap((g) => g.items).filter((i) => i.estado === 'atencion').length;
    const estado: Estado = errores > 0 || alertas > 0 ? 'alerta' : avisos > 0 || atenciones > 0 ? 'atencion' : 'ok';
    return {
      desde,
      hasta,
      dias,
      general: {
        estado,
        resumen:
          estado === 'ok'
            ? 'Las cifras cuadran y los indicadores están en rangos sanos.'
            : `${errores} verificación(es) con error, ${avisos} con aviso, ${alertas} indicador(es) en alerta y ${atenciones} con atención.`,
      },
      ...indicadores,
      tendencia: meses,
      chequeos,
    };
  }

  // Estado de resultados del período, solo con asientos de operación (los de cierre ponen ingresos y gastos en cero).
  private async resultados(desde: string, hasta: string) {
    const filas = await this.q<{ codigo: string; tipo: string; monto: number }>(
      `SELECT cu.codigo, cu.tipo::text AS tipo, SUM(CASE WHEN cu.tipo::text = 'ingreso' THEN la.haber - la.debe ELSE la.debe - la.haber END)::float8 AS monto
       FROM lineas_asiento la JOIN asientos_contables a ON a.id = la.asiento_id JOIN cuentas_contables cu ON cu.id = la.cuenta_id
       WHERE cu.tipo::text IN ('ingreso', 'gasto') AND COALESCE(a.origen_tipo, '') NOT LIKE 'cierre%'
         AND to_char(a.fecha, 'YYYY-MM-DD') BETWEEN $1 AND $2 GROUP BY 1, 2`,
      [desde, hasta],
    );
    const suma = (f: (c: string, t: string) => boolean) => filas.filter((r) => f(r.codigo, r.tipo)).reduce((s, r) => s + num(r.monto), 0);
    const ventas = suma((c) => ['4100', '4110', '4120'].includes(c));
    const otrosIngresos = suma((c, t) => t === 'ingreso' && !['4100', '4110', '4120'].includes(c));
    const costo = suma((c) => c === '5100');
    const laboral = suma((c) => ['5200', '5210', '5220'].includes(c));
    const renta = suma((c) => c === '5500');
    const gastosTotales = suma((_, t) => t === 'gasto');
    return { ventas, otrosIngresos, costo, laboral, renta, gastosTotales, gastosOperativos: gastosTotales - costo - renta, utilidad: ventas + otrosIngresos - gastosTotales };
  }

  private async tendenciaMensual(desde: string, hasta: string) {
    const filas = await this.q<{ mes: string; ingresos: number; gastos: number }>(
      `SELECT to_char(a.fecha, 'YYYY-MM') AS mes,
              COALESCE(SUM(la.haber - la.debe) FILTER (WHERE cu.tipo::text = 'ingreso'), 0)::float8 AS ingresos,
              COALESCE(SUM(la.debe - la.haber) FILTER (WHERE cu.tipo::text = 'gasto'), 0)::float8 AS gastos
       FROM lineas_asiento la JOIN asientos_contables a ON a.id = la.asiento_id JOIN cuentas_contables cu ON cu.id = la.cuenta_id
       WHERE cu.tipo::text IN ('ingreso', 'gasto') AND COALESCE(a.origen_tipo, '') NOT LIKE 'cierre%' AND to_char(a.fecha, 'YYYY-MM-DD') BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      [desde, hasta],
    );
    return filas.map((r) => ({ mes: r.mes, ingresos: redondear(num(r.ingresos)), gastos: redondear(num(r.gastos)), utilidad: redondear(num(r.ingresos) - num(r.gastos)) }));
  }

  // Saldo de caja y bancos (1100–1199) al cierre de cada mes, acumulado desde el inicio.
  private async cajaMensual(hasta: string): Promise<Map<string, number>> {
    const filas = await this.q<{ mes: string; mov: number }>(
      `SELECT to_char(a.fecha, 'YYYY-MM') AS mes, SUM(la.debe - la.haber)::float8 AS mov
       FROM lineas_asiento la JOIN asientos_contables a ON a.id = la.asiento_id JOIN cuentas_contables cu ON cu.id = la.cuenta_id
       WHERE cu.codigo BETWEEN '1100' AND '1199' AND to_char(a.fecha, 'YYYY-MM-DD') <= $1 GROUP BY 1 ORDER BY 1`,
      [hasta],
    );
    const mapa = new Map<string, number>();
    let acum = 0;
    for (const r of filas) {
      acum += num(r.mov);
      mapa.set(r.mes, redondear(acum));
    }
    return mapa;
  }

  private indicadores(saldos: Saldo[], p: { ventas: number; costo: number; laboral: number; gastosTotales: number; gastosOperativos: number; utilidad: number; renta: number }, dias: number) {
    const sd = (f: (c: string) => boolean) => saldos.filter((s) => f(s.codigo)).reduce((a, s) => a + s.saldo, 0); // debe − haber
    const efectivo = sd((c) => entre(c, 1100, 1199));
    const cxc = sd((c) => c === '1200' || c === '1210');
    const inventario = sd((c) => entre(c, 1300, 1329));
    const activoCorriente = sd((c) => entre(c, 1100, 1499));
    const activoTotal = saldos.filter((s) => s.tipo === 'activo').reduce((a, s) => a + s.saldo, 0);
    const pasivos = saldos.filter((s) => s.tipo === 'pasivo').map((s) => ({ ...s, monto: -s.saldo }));
    const pasivoTotal = pasivos.reduce((a, s) => a + s.monto, 0);
    const pasivoCorriente = pasivos.filter((s) => !(Number(s.codigo) >= 2500 && Number(s.codigo) < 2600)).reduce((a, s) => a + s.monto, 0);
    const patrimonio = activoTotal - pasivoTotal;

    const razon = pasivoCorriente > 0.5 ? activoCorriente / pasivoCorriente : null;
    const acida = pasivoCorriente > 0.5 ? (efectivo + cxc) / pasivoCorriente : null;
    const endeudamiento = activoTotal > 0.5 ? (pasivoTotal / activoTotal) * 100 : null;
    const margenBruto = p.ventas > 0 ? ((p.ventas - p.costo) / p.ventas) * 100 : null;
    const margenNeto = p.ventas > 0 ? (p.utilidad / p.ventas) * 100 : null;
    const diasCobro = p.ventas > 0 ? (cxc / p.ventas) * dias : null;
    const diasInventario = p.costo > 0 ? (inventario / p.costo) * dias : null;
    const cargaLaboral = p.ventas > 0 ? (p.laboral / p.ventas) * 100 : null;
    const gastoMensual = p.gastosTotales > 0 ? p.gastosTotales / (dias / 30.4) : 0;
    const mesesCaja = gastoMensual > 0 ? efectivo / gastoMensual : null;

    const r = (v: number | null, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
    const item = (clave: string, titulo: string, valor: number | null, formato: 'colones' | 'razon' | 'porcentaje' | 'dias' | 'meses', estado: Estado | 'info', nota: string) => ({ clave, titulo, valor, formato, estado, nota });
    const sem = (v: number | null, alerta: (x: number) => boolean, atencion: (x: number) => boolean): Estado | 'info' => (v === null ? 'info' : alerta(v) ? 'alerta' : atencion(v) ? 'atencion' : 'ok');

    return {
      grupos: [
        {
          titulo: 'Liquidez: ¿alcanza para pagar lo que viene?',
          items: [
            item('efectivo', 'Caja y bancos', redondear(efectivo), 'colones', efectivo < -0.5 ? 'alerta' : 'info', efectivo < -0.5 ? 'Saldo negativo: se pagó más de lo registrado en caja o bancos.' : 'Dinero disponible (cuentas 1100–1199).'),
            item('cxc', 'Cuentas por cobrar', redondear(cxc), 'colones', 'info', 'Lo que los clientes deben (1200–1210).'),
            item('inventario', 'Inventario', redondear(inventario), 'colones', 'info', 'Mercadería valorada en el mayor (1300–1329).'),
            item('capital', 'Capital de trabajo', redondear(activoCorriente - pasivoCorriente), 'colones', sem(activoCorriente - pasivoCorriente, (x) => x < 0, () => false), 'Activo corriente menos pasivo corriente. Negativo = las deudas de corto plazo superan lo que se tiene.'),
            item('razon', 'Razón corriente', r(razon, 2), 'razon', sem(razon, (x) => x < 1, (x) => x < 1.5), 'Activo corriente ÷ pasivo corriente. Menos de 1 es riesgoso; arriba de 1,5 es cómodo.'),
            item('acida', 'Prueba ácida', r(acida, 2), 'razon', sem(acida, (x) => x < 0.7, (x) => x < 1), 'Caja + cuentas por cobrar ÷ pasivo corriente: liquidez sin depender de vender el inventario.'),
            item('mesesCaja', 'Meses de caja', r(mesesCaja, 1), 'meses', sem(mesesCaja, (x) => x < 1, (x) => x < 2), 'Cuántos meses de gastos cubre el efectivo disponible al ritmo del período.'),
          ],
        },
        {
          titulo: 'Rentabilidad del período',
          items: [
            item('ventas', 'Ventas netas', redondear(p.ventas), 'colones', 'info', 'Cuentas 4100–4120 del período.'),
            item('margenBruto', 'Margen bruto', r(margenBruto), 'porcentaje', p.costo === 0 && p.ventas > 0 ? 'atencion' : sem(margenBruto, (x) => x < 0, (x) => x < 15), p.costo === 0 && p.ventas > 0 ? 'Sin costo de ventas registrado: este margen está inflado (vea las verificaciones).' : 'Ventas menos costo de ventas, como % de las ventas.'),
            item('gastosOperativos', 'Gastos de operación', redondear(p.gastosOperativos), 'colones', 'info', 'Gastos sin costo de ventas ni impuesto sobre la renta.'),
            item('utilidad', 'Utilidad neta', redondear(p.utilidad), 'colones', p.utilidad < 0 ? 'alerta' : 'info', p.utilidad < 0 ? 'Pérdida en el período: los gastos superan los ingresos.' : 'Ingresos totales menos gastos totales.'),
            item('margenNeto', 'Margen neto', r(margenNeto), 'porcentaje', sem(margenNeto, (x) => x < 0, (x) => x < 5), 'Utilidad neta como % de las ventas.'),
            item('cargaLaboral', 'Costo laboral sobre ventas', r(cargaLaboral), 'porcentaje', sem(cargaLaboral, (x) => x > 50, (x) => x > 30), 'Sueldos, cargas y provisiones (5200–5220) como % de las ventas.'),
          ],
        },
        {
          titulo: 'Eficiencia y deuda',
          items: [
            item('diasCobro', 'Días de cobro', r(diasCobro, 0), 'dias', sem(diasCobro, (x) => x > 90, (x) => x > 45), 'Cuántos días tardan los clientes en pagar en promedio (cuentas por cobrar ÷ ventas × días).'),
            item('diasInventario', 'Días de inventario', r(diasInventario, 0), 'dias', sem(diasInventario, (x) => x > 240, (x) => x > 120), 'Cuántos días de ventas dura el inventario (inventario ÷ costo de ventas × días).'),
            item('endeudamiento', 'Endeudamiento', r(endeudamiento), 'porcentaje', sem(endeudamiento, (x) => x > 80, (x) => x > 60), 'Deudas totales como % de los activos.'),
            item('patrimonio', 'Patrimonio', redondear(patrimonio), 'colones', patrimonio < 0 ? 'alerta' : 'info', patrimonio < 0 ? 'Patrimonio negativo: las deudas superan a los activos.' : 'Activos menos pasivos.'),
          ],
        },
      ],
      obligaciones: pasivos
        .filter((s) => Math.abs(s.monto) > 0.5)
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 12)
        .map((s) => ({ etiqueta: `${s.codigo} ${s.nombre}`, monto: redondear(s.monto) })),
      resumenBalance: { activoTotal: redondear(activoTotal), pasivoTotal: redondear(pasivoTotal), patrimonio: redondear(patrimonio) },
    };
  }

  // Todas las verificaciones: las reglas de integridad ya existentes más los cruces entre el mayor y los documentos.
  private async chequeos(): Promise<Chequeo[]> {
    const salida: Chequeo[] = [];
    try {
      const v = await this.integridad.verificar();
      for (const r of v.resultados) {
        salida.push({
          codigo: r.codigo,
          grupo: GRUPO_INTEGRIDAD(r.codigo),
          titulo: r.titulo,
          estado: r.ok ? 'ok' : 'error',
          problemas: r.cantidadProblemas,
          resumen: r.ok ? '' : `${r.cantidadProblemas} caso(s) no cumplen la regla.`,
          donde: r.ok ? '' : (DONDE_INTEGRIDAD[r.codigo] ?? 'Revise los ejemplos de abajo y el módulo correspondiente.'),
          ejemplos: r.ejemplos.slice(0, 10),
        });
      }
    } catch (err) {
      this.logger.error(`No se pudieron correr las reglas de integridad: ${err instanceof Error ? err.message : err}`);
    }
    const resultados = await Promise.all(
      CRUCES.map(async (c): Promise<Chequeo> => {
        try {
          const filas = await this.q<Record<string, unknown>>(c.sql, c.params ?? []);
          return { codigo: c.codigo, grupo: c.grupo, titulo: c.titulo, estado: filas.length === 0 ? 'ok' : c.severidad, problemas: filas.length, resumen: filas.length ? c.resumen(filas) : '', donde: filas.length ? c.donde : '', ejemplos: filas.slice(0, 10) };
        } catch (err) {
          this.logger.error(`Verificación ${c.codigo}: ${err instanceof Error ? err.message : err}`);
          return { codigo: c.codigo, grupo: c.grupo, titulo: c.titulo, estado: 'sin_verificar', problemas: 0, resumen: 'No se pudo correr esta verificación.', donde: '', ejemplos: [] };
        }
      }),
    );
    return [...salida, ...resultados];
  }
}
