import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { PagoRecibido } from './pago-recibido.entity.js';
import { Factura } from '../facturacion/factura.entity.js';

// Cuánto de un pago se aplicó a cada factura. El saldo de una factura es
// su total menos la suma de estas aplicaciones de pagos vigentes.
@Entity({ name: 'pago_aplicaciones' })
export class PagoAplicacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PagoRecibido, (p) => p.aplicaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pago_id' })
  pago: Relation<PagoRecibido>;

  @Column({ type: 'uuid', name: 'pago_id' })
  pagoId: string;

  @ManyToOne(() => Factura, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'factura_id' })
  factura: Relation<Factura>;

  @Column({ type: 'uuid', name: 'factura_id' })
  facturaId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: string;
}
