import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, type Relation } from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';

// Saldo actual por (ubicación, variante) — en pares. Es una cache
// mantenida de forma atómica junto con cada MovimientoInventario, NO la
// fuente de verdad: si hiciera falta reconstruirla, se recalcula sumando
// el kardex completo de esa ubicación+variante. Se actualiza siempre
// dentro de la misma transacción que inserta el movimiento (ver
// InventarioService.registrarMovimiento).
@Entity({ name: 'stock_ubicaciones' })
@Unique(['ubicacionId', 'varianteId'])
export class StockUbicacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  // Pares — siempre entero, no se manejan medias unidades de producto
  // terminado (a diferencia de las docenas del pedido, que sí admiten .5).
  @Column({ type: 'integer', default: 0 })
  cantidad: number;
}
