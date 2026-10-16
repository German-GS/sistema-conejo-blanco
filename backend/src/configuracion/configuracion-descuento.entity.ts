import { Column, Entity, PrimaryColumn } from 'typeorm';

// Una sola fila (id fijo 'general') — mismo patrón que PedidoContador.
// Tope de descuento que un vendedor puede aplicar por su cuenta en
// cualquier línea de pedido, sin que el cliente tenga un descuento
// asignado mayor (ver Cliente.descuentoPorcentaje y PedidosService).
@Entity({ name: 'configuracion_descuentos' })
export class ConfiguracionDescuento {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'descuento_maximo_vendedor_porcentaje' })
  descuentoMaximoVendedorPorcentaje: string;
}
