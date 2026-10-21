// Catálogo de datasets de análisis: tablas "planas" listas para Power BI, Excel o Python (pandas).
// Cada dataset es una consulta de solo lectura. Nunca incluye claves, secretos ni datos de contacto de clientes
// (cédula, teléfono, correo). Los datos personales de empleados salen anonimizados salvo que el administrador
// del sistema pida la versión completa desde el panel.

export interface DatasetAnalisis {
  id: string;
  titulo: string;
  descripcion: string;
  tema: 'ventas' | 'cartera' | 'inventario' | 'contabilidad' | 'planilla' | 'catalogos';
  // Columna (texto ISO yyyy-mm-dd) por la que se filtra con desde/hasta; null = foto actual sin fecha.
  columnaFecha: string | null;
  // Contiene datos personales de empleados: nunca sale por el enlace de Power BI.
  personal: boolean;
  sql: (anonimizar: boolean) => string;
}

// Una factura cuenta como vigente si no está anulada (manual), su pedido no se anuló y no tiene nota de crédito.
const FACTURA_VIGENTE = `NOT (COALESCE(CASE WHEN f.pedido_id IS NULL THEN f.anulada ELSE pe.estado::text = 'anulado' END, false) OR n.id IS NOT NULL)`;
const FACTURA_TIPO_PAGO = `COALESCE(CASE WHEN f.pedido_id IS NULL THEN f.tipo_pago::text ELSE pe.tipo_pago::text END, 'contado')`;
const FACTURA_DIAS_CREDITO = `COALESCE(CASE WHEN f.pedido_id IS NULL THEN f.dias_credito ELSE pe.dias_credito END, 0)`;
const FACTURA_JOINS = `
  LEFT JOIN pedidos pe ON pe.id = f.pedido_id
  LEFT JOIN notas_credito n ON n.factura_id = f.id
  LEFT JOIN clientes c ON c.id = f.cliente_id`;

const VENTAS = `
  SELECT to_char(f.fecha, 'YYYY-MM-DD') AS fecha, f.consecutivo, f.tipo_comprobante, f.origen,
    ${FACTURA_TIPO_PAGO} AS tipo_pago, f.medio_pago, f.vendedor,
    f.cliente_id, c.nombre AS cliente, c.provincia::text AS provincia,
    f.ubicacion_id, u.nombre AS ubicacion,
    fl.variante_id, p.codigo AS producto_codigo, p.nombre AS producto, v.color, fl.descripcion,
    fl.cantidad::float8 AS cantidad, fl.precio_unitario::float8 AS precio_unitario,
    fl.descuento_porcentaje::float8 AS descuento_porcentaje,
    fl.subtotal::float8 AS venta_neta, fl.impuesto_monto::float8 AS iva,
    (fl.cantidad * COALESCE(fl.costo_unitario, 0))::float8 AS costo,
    (fl.subtotal - fl.cantidad * COALESCE(fl.costo_unitario, 0))::float8 AS margen,
    ${FACTURA_VIGENTE} AS vigente
  FROM factura_lineas fl
  JOIN facturas f ON f.id = fl.factura_id
  ${FACTURA_JOINS}
  LEFT JOIN ubicaciones u ON u.id = f.ubicacion_id
  LEFT JOIN variantes_producto v ON v.id = fl.variante_id
  LEFT JOIN productos p ON p.id = v.producto_id`;

const CARTERA = `
  SELECT f.consecutivo, f.cliente_id, c.nombre AS cliente, to_char(f.fecha, 'YYYY-MM-DD') AS fecha,
    ${FACTURA_DIAS_CREDITO} AS dias_credito,
    to_char(f.fecha + ${FACTURA_DIAS_CREDITO}, 'YYYY-MM-DD') AS fecha_vence,
    f.total::float8 AS total, COALESCE(pg.pagado, 0)::float8 AS pagado,
    (f.total - COALESCE(pg.pagado, 0))::float8 AS saldo,
    GREATEST(0, CURRENT_DATE - (f.fecha + ${FACTURA_DIAS_CREDITO}))::int AS dias_vencida,
    CASE
      WHEN CURRENT_DATE <= f.fecha + ${FACTURA_DIAS_CREDITO} THEN '1 Al día'
      WHEN CURRENT_DATE - (f.fecha + ${FACTURA_DIAS_CREDITO}) <= 30 THEN '2 Vencida 1-30 días'
      WHEN CURRENT_DATE - (f.fecha + ${FACTURA_DIAS_CREDITO}) <= 60 THEN '3 Vencida 31-60 días'
      WHEN CURRENT_DATE - (f.fecha + ${FACTURA_DIAS_CREDITO}) <= 90 THEN '4 Vencida 61-90 días'
      ELSE '5 Vencida más de 90 días'
    END AS tramo
  FROM facturas f
  ${FACTURA_JOINS}
  LEFT JOIN (
    SELECT pa.factura_id, SUM(pa.monto) AS pagado
    FROM pago_aplicaciones pa JOIN pagos_recibidos pr ON pr.id = pa.pago_id
    WHERE pr.estado = 'vigente'
    GROUP BY pa.factura_id
  ) pg ON pg.factura_id = f.id
  WHERE ${FACTURA_TIPO_PAGO} = 'credito' AND ${FACTURA_VIGENTE} AND (f.total - COALESCE(pg.pagado, 0)) > 0.005`;

const PAGOS = `
  SELECT to_char(pr.fecha, 'YYYY-MM-DD') AS fecha, pr.numero, pr.tipo, pr.estado, pr.cliente_id, c.nombre AS cliente,
    cb.nombre AS cuenta, pr.medio_pago, pr.moneda, pr.total::float8 AS total, pr.concepto
  FROM pagos_recibidos pr
  LEFT JOIN clientes c ON c.id = pr.cliente_id
  LEFT JOIN cuentas_bancarias cb ON cb.id = pr.cuenta_bancaria_id`;

const INVENTARIO_STOCK = `
  SELECT s.ubicacion_id, u.nombre AS ubicacion, u.tipo::text AS tipo_ubicacion, s.variante_id,
    p.codigo AS producto_codigo, p.nombre AS producto, v.color, s.cantidad,
    COALESCE(s.costo_promedio, v.costo)::float8 AS costo_unitario, (s.cantidad * COALESCE(s.costo_promedio, v.costo))::float8 AS valor_costo,
    (s.cantidad * v.precio_por_par)::float8 AS valor_venta
  FROM stock_ubicaciones s
  JOIN ubicaciones u ON u.id = s.ubicacion_id
  JOIN variantes_producto v ON v.id = s.variante_id
  JOIN productos p ON p.id = v.producto_id`;

const INVENTARIO_MOVIMIENTOS = `
  SELECT to_char(m.creado_en AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS fecha,
    to_char(m.creado_en AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') AS hora,
    m.tipo::text AS tipo, m.cantidad, m.referencia_tipo, m.ubicacion_id, u.nombre AS ubicacion,
    m.variante_id, p.codigo AS producto_codigo, p.nombre AS producto, v.color
  FROM movimientos_inventario m
  JOIN ubicaciones u ON u.id = m.ubicacion_id
  JOIN variantes_producto v ON v.id = m.variante_id
  JOIN productos p ON p.id = v.producto_id`;

// Libro mayor: una fila por línea de asiento, con el documento que la originó ya resuelto (factura, cliente,
// planilla). Las notas de crédito y las reversas apuntan al documento original, así que los totales por
// cliente, vendedor o planilla salen del mayor y cuadran con él. Es la base de todos los tableros.
const CONTABILIDAD = `
  SELECT to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.numero AS asiento, a.descripcion, a.origen_tipo,
    cu.codigo AS cuenta_codigo, cu.nombre AS cuenta, cu.tipo::text AS tipo_cuenta,
    la.debe::float8 AS debe, la.haber::float8 AS haber, (la.debe - la.haber)::float8 AS neto_deudor,
    f.id AS factura_id, f.consecutivo AS factura, pv.id AS pos_venta_id, COALESCE(c.id, cp.id) AS cliente_id,
    COALESCE(c.nombre, cp.nombre, CASE WHEN pv.id IS NOT NULL THEN 'Ventas de tienda (público)' END) AS cliente,
    c.provincia::text AS provincia, COALESCE(f.vendedor, uc.nombre) AS vendedor, COALESCE(f.ubicacion_id, pv.ubicacion_id) AS ubicacion_id, COALESCE(u.nombre, up.nombre) AS ubicacion,
    CASE WHEN f.id IS NOT NULL THEN ${FACTURA_TIPO_PAGO} WHEN pv.id IS NOT NULL THEN 'contado' END AS tipo_pago,
    pl.id AS planilla_id, to_char(pl.fecha_desde, 'YYYY-MM-DD') AS planilla_desde, to_char(pl.fecha_hasta, 'YYYY-MM-DD') AS planilla_hasta
  FROM lineas_asiento la
  JOIN asientos_contables a ON a.id = la.asiento_id
  JOIN cuentas_contables cu ON cu.id = la.cuenta_id
  LEFT JOIN asientos_contables ao ON a.origen_tipo = 'reversa' AND ao.id = a.origen_id
  LEFT JOIN notas_credito nc ON nc.id = CASE WHEN a.origen_tipo = 'nota_credito' THEN a.origen_id WHEN ao.origen_tipo = 'nota_credito' THEN ao.origen_id END
  LEFT JOIN facturas f ON f.id = COALESCE(CASE WHEN a.origen_tipo = 'factura' THEN a.origen_id WHEN ao.origen_tipo = 'factura' THEN ao.origen_id END, nc.factura_id)
  LEFT JOIN pedidos pe ON pe.id = f.pedido_id
  LEFT JOIN pagos_recibidos pr ON pr.id = CASE WHEN a.origen_tipo = 'pago_recibido' THEN a.origen_id WHEN ao.origen_tipo = 'pago_recibido' THEN ao.origen_id END
  LEFT JOIN clientes c ON c.id = f.cliente_id
  LEFT JOIN clientes cp ON cp.id = pr.cliente_id
  LEFT JOIN ubicaciones u ON u.id = f.ubicacion_id
  LEFT JOIN pos_ventas pv ON pv.id = CASE WHEN a.origen_tipo = 'pos_venta' THEN a.origen_id WHEN ao.origen_tipo = 'pos_venta' THEN ao.origen_id END
  LEFT JOIN ubicaciones up ON up.id = pv.ubicacion_id
  LEFT JOIN usuarios uc ON uc.id = pv.cajero_id
  LEFT JOIN planilla_planillas pl ON pl.id = CASE WHEN a.origen_tipo IN ('planilla', 'planilla_pago') THEN a.origen_id WHEN ao.origen_tipo IN ('planilla', 'planilla_pago') THEN ao.origen_id END`;

// Empleados: por defecto un código anónimo estable (E-xxxxxx) en lugar de nombre y cédula.
const planilla = (anonimizar: boolean) => `
  SELECT to_char(pl.fecha_desde, 'YYYY-MM-DD') AS fecha_desde, to_char(pl.fecha_hasta, 'YYYY-MM-DD') AS fecha_hasta,
    pl.estado::text AS estado, 'E-' || substr(md5(l.empleado_id::text), 1, 6) AS empleado_codigo,
    ${anonimizar ? '' : 'l.empleado_nombre AS nombre, l.empleado_cedula AS cedula,'}
    e.puesto, e.sector, l.salario_base::float8 AS salario_base, l.horas_extra::float8 AS horas_extra,
    l.monto_extra::float8 AS monto_extra, l.horas_especiales::float8 AS horas_especiales,
    l.monto_especiales::float8 AS monto_especiales, l.descuento_ausencias::float8 AS descuento_ausencias,
    l.bruto::float8 AS bruto, l.sem::float8 AS sem, l.ivm::float8 AS ivm, l.banco_popular::float8 AS banco_popular,
    l.renta::float8 AS renta, l.deudas_descontadas::float8 AS deudas, l.total_deducciones::float8 AS total_deducciones,
    l.neto::float8 AS neto, l.cargas_patronales::float8 AS cargas_patronales, l.provisiones::float8 AS provisiones
  FROM planilla_lineas l
  JOIN planilla_planillas pl ON pl.id = l.planilla_id
  LEFT JOIN planilla_empleados e ON e.id = l.empleado_id`;

const POS_VENTAS = `
  SELECT to_char(v.fecha AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS fecha, to_char(v.fecha AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') AS hora,
    u.codigo || '-' || lpad(v.numero::text, 6, '0') AS tiquete, v.ubicacion_id, u.nombre AS tienda, us.nombre AS cajero, v.estado,
    l.variante_id, l.codigo AS producto_codigo, l.descripcion AS producto, l.color, l.cantidad,
    l.precio_unitario::float8 AS precio_unitario, l.descuento::float8 AS descuento, l.subtotal::float8 AS venta,
    (l.cantidad * COALESCE(l.costo_unitario, 0))::float8 AS costo,
    (SELECT string_agg(DISTINCT p.medio, ', ' ORDER BY p.medio) FROM pos_pagos p WHERE p.venta_id = v.id) AS medios_pago,
    v.creada_sin_conexion AS sin_conexion
  FROM pos_venta_lineas l JOIN pos_ventas v ON v.id = l.venta_id JOIN ubicaciones u ON u.id = v.ubicacion_id JOIN usuarios us ON us.id = v.cajero_id`;

const DIM_PRODUCTOS = `
  SELECT v.id AS variante_id, p.id AS producto_id, p.codigo, p.nombre, v.color,
    v.precio_por_par::float8 AS precio_por_par, v.costo::float8 AS costo, (v.activo AND p.activo) AS activo
  FROM variantes_producto v JOIN productos p ON p.id = v.producto_id`;

const DIM_CLIENTES = `
  SELECT c.id AS cliente_id, c.nombre, c.tipo_identificacion::text AS tipo_identificacion, c.provincia::text AS provincia,
    c.activo, c.descuento_porcentaje::float8 AS descuento_porcentaje, to_char(c.creado_en AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS creado
  FROM clientes c`;

export const DATASETS: DatasetAnalisis[] = [
  { id: 'ventas', titulo: 'Detalle de facturas (por línea)', descripcion: 'Detalle operativo: una fila por producto facturado, con cliente, color, vendedor, ubicación, venta neta, IVA, costo y margen. Incluye la columna "vigente" (false = factura anulada). Para cifras contables use el libro mayor.', tema: 'ventas', columnaFecha: 'fecha', personal: false, sql: () => VENTAS },
  { id: 'pos_ventas', titulo: 'Ventas de tienda (POS)', descripcion: 'Una fila por producto vendido en caja: tiquete, tienda, cajero, producto, venta, costo, medios de pago y si se cobró sin conexión. Incluye ventas anuladas (columna estado).', tema: 'ventas', columnaFecha: 'fecha', personal: false, sql: () => POS_VENTAS },
  { id: 'cartera', titulo: 'Cartera por cobrar (hoy)', descripcion: 'Facturas a crédito con saldo pendiente, días de vencimiento y tramo de antigüedad. Es una foto del día de la descarga.', tema: 'cartera', columnaFecha: null, personal: false, sql: () => CARTERA },
  { id: 'pagos', titulo: 'Pagos recibidos', descripcion: 'Recibos de cobro: cliente, cuenta, medio de pago, moneda y total.', tema: 'cartera', columnaFecha: 'fecha', personal: false, sql: () => PAGOS },
  { id: 'inventario_stock', titulo: 'Inventario actual', descripcion: 'Existencias por ubicación y variante, con valor a costo y a precio de venta (foto del día).', tema: 'inventario', columnaFecha: null, personal: false, sql: () => INVENTARIO_STOCK },
  { id: 'inventario_movimientos', titulo: 'Movimientos de inventario (kardex)', descripcion: 'Entradas, salidas, reservas, traspasos y ajustes con su fecha y ubicación.', tema: 'inventario', columnaFecha: 'fecha', personal: false, sql: () => INVENTARIO_MOVIMIENTOS },
  { id: 'contabilidad', titulo: 'Libro mayor (líneas de asiento)', descripcion: 'Cada línea de cada asiento con su cuenta, debe y haber, y el cliente, vendedor, factura o planilla que la originó. Es la fuente de los tableros y la base para estados de resultados y balances en Power BI.', tema: 'contabilidad', columnaFecha: 'fecha', personal: false, sql: () => CONTABILIDAD },
  { id: 'planilla', titulo: 'Planilla (por empleado y semana)', descripcion: 'Bruto, deducciones, neto, cargas patronales y provisiones por empleado. Datos personales anonimizados por defecto.', tema: 'planilla', columnaFecha: 'fecha_hasta', personal: true, sql: planilla },
  { id: 'dim_productos', titulo: 'Catálogo de productos', descripcion: 'Tabla de apoyo: una fila por variante (producto y color) con precio y costo.', tema: 'catalogos', columnaFecha: null, personal: false, sql: () => DIM_PRODUCTOS },
  { id: 'dim_clientes', titulo: 'Catálogo de clientes', descripcion: 'Tabla de apoyo: clientes con provincia y descuento. No incluye cédula, teléfono ni correo.', tema: 'catalogos', columnaFecha: null, personal: false, sql: () => DIM_CLIENTES },
];

export const DATASET_POR_ID = new Map(DATASETS.map((d) => [d.id, d]));

export { FACTURA_VIGENTE, FACTURA_JOINS };
export const SQL_BASE = { VENTAS, CARTERA, INVENTARIO_STOCK, INVENTARIO_MOVIMIENTOS, CONTABILIDAD, planilla };
