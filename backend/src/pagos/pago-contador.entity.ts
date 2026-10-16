import { Column, Entity, PrimaryColumn } from 'typeorm';

// Consecutivo del recibo de caja. Una sola fila (id fijo 'recibos'), se
// incrementa con UPDATE ... RETURNING igual que PedidoContador.
@Entity({ name: 'pago_contadores' })
export class PagoContador {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'integer', default: 0 })
  ultimo: number;
}
