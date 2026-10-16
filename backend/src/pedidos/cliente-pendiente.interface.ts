// Datos del cliente que el vendedor captura a mano cuando no lo encuentra
// en la base. No crea un Cliente real — queda "flotando" en el pedido
// hasta que administración lo revisa y lo registra de verdad (ver
// PedidosService.registrarCliente).
export interface ClientePendiente {
  nombre: string;
  cedula: string;
  telefono: string;
  direccion?: string;
}
