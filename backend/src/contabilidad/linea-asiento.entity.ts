import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { AsientoContable } from './asiento-contable.entity.js';
import { CuentaContable } from './cuenta-contable.entity.js';

@Entity({ name: 'lineas_asiento' })
export class LineaAsiento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AsientoContable, (asiento) => asiento.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asiento_id' })
  asiento: Relation<AsientoContable>;

  @Column({ type: 'uuid', name: 'asiento_id' })
  asientoId: string;

  @ManyToOne(() => CuentaContable, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_id' })
  cuenta: Relation<CuentaContable>;

  @Column({ type: 'uuid', name: 'cuenta_id' })
  cuentaId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debe: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  haber: string;
}
