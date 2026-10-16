import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Datos capturados a mano por el vendedor cuando el cliente no existe
// todavía en la base — ver nota en CrearPedidoDto.clienteNuevo.
//
// Solo nombre/cédula/teléfono son obligatorios acá: es lo mínimo para
// poder contactar al cliente desde la calle. Los datos completos para
// facturación electrónica (tipo de identificación, correo) los pide
// administración al registrar el cliente de verdad — ver CrearClienteDto.
// Los MaxLength coinciden con Cliente (clientes/cliente.entity.ts): esto
// se guarda tal cual en un jsonb por ahora, pero si administración lo
// registra después como Cliente real, ya viene dentro del límite de esa
// tabla.
export class ClienteNuevoPedidoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre: string;

  @IsString()
  @MinLength(4, { message: 'La cédula debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  cedula: string;

  @IsString()
  @MinLength(4, { message: 'El teléfono debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  telefono: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;
}
