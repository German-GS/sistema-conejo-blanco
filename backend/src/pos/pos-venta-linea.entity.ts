import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { PosVenta } from './pos-venta.entity.js';

@Entity({ name: 'pos_venta_lineas' })
export class PosVentaLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PosVenta, (v) => v.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Relation<PosVenta>;

  @Column({ type: 'uuid', name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  // Copia de lo que se vendió: el tiquete no cambia aunque después cambie el producto o su precio.
  @Column({ type: 'varchar', length: 40 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'varchar', length: 60 })
  color: string;

  @Column({ type: 'int' })
  cantidad: number;

  @Column({ type: 'decimal', name: 'precio_unitario', precision: 12, scale: 2 })
  precioUnitario: string;

  // Monto (no porcentaje) que se rebajó de la línea.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuento: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  // Costo por par al momento de la venta (lo pone el servidor, la terminal no lo conoce).
  @Column({ type: 'decimal', name: 'costo_unitario', precision: 12, scale: 2, nullable: true })
  costoUnitario: string | null;
}
