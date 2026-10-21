import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { OrdenTienda } from './orden-tienda.entity.js';

// Cada paso del seguimiento de un pedido de tienda: quién, cuándo y con qué nota.
@Entity({ name: 'pos_orden_eventos' })
export class OrdenTiendaEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrdenTienda, (o) => o.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: Relation<OrdenTienda>;

  @Column({ type: 'uuid', name: 'orden_id' })
  ordenId: string;

  @Column({ type: 'varchar', length: 15 })
  estado: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  nota: string | null;

  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  // Copia del nombre: el seguimiento no cambia aunque después cambie la cuenta.
  @Column({ type: 'varchar', length: 120, name: 'usuario_nombre', nullable: true })
  usuarioNombre: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha: Date;
}
