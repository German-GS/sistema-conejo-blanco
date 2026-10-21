import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { OrdenTienda } from './orden-tienda.entity.js';

@Entity({ name: 'pos_orden_lineas' })
export class OrdenTiendaLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrdenTienda, (o) => o.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: Relation<OrdenTienda>;

  @Column({ type: 'uuid', name: 'orden_id' })
  ordenId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  @Column({ type: 'varchar', length: 40 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'varchar', length: 60 })
  color: string;

  // Pares que pide la tienda.
  @Column({ type: 'int' })
  cantidad: number;

  // Cómo estaba la tienda al hacer el pedido: existencia, mínimo y lo que el sistema sugirió.
  @Column({ type: 'int', name: 'stock_tienda', default: 0 })
  stockTienda: number;

  @Column({ type: 'int', default: 0 })
  minimo: number;

  @Column({ type: 'int', default: 0 })
  sugerida: number;

  // Pares que la administración decidió enviar (null = todavía sin revisar).
  @Column({ type: 'int', name: 'cantidad_aprobada', nullable: true })
  cantidadAprobada: number | null;

  // Costo especial por par con que se traslada a la tienda (lo define la administración al revisar; la tienda no lo ve).
  @Column({ type: 'decimal', name: 'costo_tienda', precision: 12, scale: 2, nullable: true })
  costoTienda: string | null;

  // Pares que la tienda verificó y aceptó al recibir.
  @Column({ type: 'int', name: 'cantidad_recibida', nullable: true })
  cantidadRecibida: number | null;
}
