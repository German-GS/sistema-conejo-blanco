import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Producto } from './producto.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';

// Bitácora inmutable de altas y cambios en el catálogo/inventario: quién
// creó el producto, quién agregó un color, quién corrigió un precio, y
// cuándo. Mismo espíritu que PedidoEdicion y MovimientoInventario — una
// fila por acción atómica, nunca se edita ni se borra.
@Entity({ name: 'producto_ediciones' })
export class ProductoEdicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Relation<Producto>;

  @Column({ type: 'uuid', name: 'producto_id' })
  productoId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  // Un texto por cambio, ya listo para mostrar (ej. "Producto creado:
  // KW034 — Media deportiva", "Rojo: ₡1500,00 → ₡1600,00").
  @Column({ type: 'jsonb' })
  cambios: string[];

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
