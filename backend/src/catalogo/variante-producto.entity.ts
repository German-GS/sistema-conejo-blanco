import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Producto } from './producto.entity.js';

// La variante es el SKU real: mismo producto (ej. KW034), distinto color
// (rojo, negro, azul...). Cada una tiene su propio precio por par.
@Entity({ name: 'variantes_producto' })
export class VarianteProducto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Producto, (producto) => producto.variantes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Relation<Producto>;

  @Column({ type: 'uuid', name: 'producto_id' })
  productoId: string;

  @Column({ type: 'varchar', length: 60 })
  color: string;

  @Column({ type: 'decimal', name: 'precio_por_par', precision: 12, scale: 2 })
  precioPorPar: string;

  // Costo de producción/compra por par — el piso que ningún descuento
  // puede cruzar (ver PedidosService: valida esto al armar un pedido con
  // descuento). Nula en variantes viejas de antes de que existiera este
  // campo; sin costo cargado, no hay piso que validar para esa variante.
  @Column({ type: 'decimal', name: 'costo', precision: 12, scale: 2, nullable: true })
  costo: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
