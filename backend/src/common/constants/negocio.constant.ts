// Parámetros del negocio que hoy son fijos. Si más adelante cambian según
// cliente o producto, se mueven a una tabla configurable (mismo patrón que
// planilla-parametros en el diseño grande de Conejo Blanco) — por ahora,
// para esta primera pieza (pedidos de vendedor), son constantes simples.

// IVA general de Costa Rica.
export const IVA_PORCENTAJE = 13;

// Mínimo de días de crédito que el negocio autoriza a un cliente.
export const DIAS_CREDITO_MINIMO = 30;

// Cuántas unidades trae una docena — para convertir docenas a pares.
export const UNIDADES_POR_DOCENA = 12;

// El pedido descuenta bodega en cuanto se crea (o se edita), para que
// nunca se venda algo que ya no hay — pero por ahora el negocio pide
// poder seguir vendiendo un poco pasado el límite físico, así que se
// permite que el stock de una ubicación quede negativo hasta este tope
// (en pares) antes de bloquear. Ver PedidosService.crear/editarLineas e
// InventarioService.registrarMovimientoEnTransaccion.
export const COLCHON_SOBREVENTA_PARES = 100;
