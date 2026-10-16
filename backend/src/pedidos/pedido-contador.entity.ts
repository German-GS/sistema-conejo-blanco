import { Entity, PrimaryColumn, Column } from 'typeorm';

// Contador atómico del número de orden correlativo de pedidos. Una sola
// fila (id fijo 'pedidos'); se incrementa con UPDATE ... RETURNING para
// que dos vendedores guardando pedidos al mismo tiempo nunca choquen en
// el mismo número (mismo patrón que ConsecutivoContador de facturación
// en Conejo Motors).
@Entity({ name: 'pedido_contadores' })
export class PedidoContador {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'integer', default: 0 })
  ultimo: number;
}
