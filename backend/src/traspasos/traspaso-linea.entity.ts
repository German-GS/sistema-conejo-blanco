import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Traspaso } from './traspaso.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';

@Entity({ name: 'traspaso_lineas' })
export class TraspasoLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Traspaso, (traspaso) => traspaso.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'traspaso_id' })
  traspaso: Relation<Traspaso>;

  @Column({ type: 'uuid', name: 'traspaso_id' })
  traspasoId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  @Column({ type: 'integer', name: 'cantidad_enviada' })
  cantidadEnviada: number;

  // Nula hasta que destino confirma recepción.
  @Column({ type: 'integer', name: 'cantidad_recibida', nullable: true })
  cantidadRecibida: number | null;
}
