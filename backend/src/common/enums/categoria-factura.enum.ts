// Categoría de cobro de una factura, calculada (no se guarda en la
// tabla) a partir del pedido detrás — ver FacturacionService.listarFacturas.
// "Cancelada" acá es en el sentido costarricense: pagada/saldada, no
// "cancelled" en inglés.
export enum CategoriaFactura {
  CANCELADA = 'cancelada', // pedido a contado, ya cobrada al momento de facturar
  PENDIENTE = 'pendiente', // pedido a crédito, todavía por cobrar
  ANULADA = 'anulada', // el pedido detrás fue anulado
}
