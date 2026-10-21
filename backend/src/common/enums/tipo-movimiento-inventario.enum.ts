// Tipos de movimiento del kardex. Conejo Blanco todavía no fabrica dentro
// del sistema (eso es fase 2, manufactura), así que el stock entra por
// INGRESO_INICIAL (carga manual de lo que ya existe/llega de producción
// externa) y se mueve por traspasos, pedidos o ventas.
export enum TipoMovimientoInventario {
  INGRESO_INICIAL = 'ingreso_inicial',
  TRASPASO_SALIDA = 'traspaso_salida',
  TRASPASO_ENTRADA = 'traspaso_entrada',

  // El stock se descuenta al CREAR (o editar) el pedido, no al facturar —
  // así bodega nunca vende algo que ya no hay (ver PedidosService.crear/
  // editarLineas y el colchón de sobreventa en negocio.constant.ts).
  // "Facturar" ya no mueve inventario, solo reconoce la venta fiscal y
  // contable (ver FacturacionService.facturarPedido).
  RESERVA_PEDIDO = 'reserva_pedido',
  // El pedido se anuló antes de facturarse — libera lo que RESERVA_PEDIDO
  // había descontado (ver PedidosService.anular).
  LIBERACION_RESERVA = 'liberacion_reserva',

  // Factura ya emitida que se anula con Nota de Crédito — ver
  // FacturacionService.anularFactura.
  DEVOLUCION_VENTA = 'devolucion_venta',

  // Venta de una factura hecha a mano (sin pedido) — ver
  // FacturaManualService.
  VENTA_MANUAL = 'venta_manual',

  // Punto de venta de la tienda: la venta y su anulación (devolución al stock).
  VENTA_POS = 'venta_pos',
  DEVOLUCION_POS = 'devolucion_pos',

  AJUSTE_CONTEO = 'ajuste_conteo',
  AJUSTE_MERMA = 'ajuste_merma',

  // Histórico: movimientos ya grabados antes de este cambio de diseño,
  // cuando el descuento todavía pasaba al facturar en vez de al crear el
  // pedido. Ya no se genera — se deja en el enum para no romper filas
  // viejas del kardex, que es inmutable.
  VENTA_FACTURADA = 'venta_facturada',
}
