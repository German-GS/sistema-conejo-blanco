import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Producto } from './producto.entity.js';

// Fotos de referencia del PRODUCTO (no por color) — sirven para que el
// vendedor le muestre al cliente cómo se ve el estilo antes de pedirlo.
// Puede haber varias por producto (ver CatalogoController.subirFoto). El
// binario vive en disco (ver uploads/productos en main.ts), acá solo se
// guarda la ruta pública.
@Entity({ name: 'producto_fotos' })
export class ProductoFoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Producto, (producto) => producto.fotos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Relation<Producto>;

  @Column({ type: 'uuid', name: 'producto_id' })
  productoId: string;

  // Ruta servida como archivo estático (ej. "/uploads/productos/<uuid>.jpg").
  @Column({ type: 'varchar', length: 255 })
  url: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
