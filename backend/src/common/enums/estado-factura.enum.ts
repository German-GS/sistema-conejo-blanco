// Estados posibles de una Factura Electrónica ante Hacienda. Con el
// HaciendaClient en modo NoOp (ver facturacion/noop-hacienda.client.ts),
// el único estado alcanzable hoy es PENDIENTE_ENVIO — los demás quedan
// listos para cuando se conecte el envío real.
export enum EstadoFactura {
  PENDIENTE_ENVIO = 'pendiente_envio',
  ENVIADA = 'enviada',
  ACEPTADA = 'aceptada',
  RECHAZADA = 'rechazada',
}
