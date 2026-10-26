import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { VarianteProducto } from './variante-producto.entity.js';
import { ProductoFoto } from './producto-foto.entity.js';

// Un producto base del catálogo (ej. "Media deportiva KW034"). No tiene
// precio ni stock propios — eso vive en cada VarianteProducto (color).
@Entity({ name: 'productos' })
export class Producto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Código corto que usa el vendedor para buscar en el pedido (ej. "KW034").
  @Column({ type: 'varchar', unique: true, length: 30 })
  codigo: string;

  @Column({ type: 'varchar', length: 160 })
  nombre: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion: string | null;

  // Código CABYS (13 dígitos) que Hacienda exige en cada línea de la factura electrónica.
  @Column({ type: 'varchar', length: 13, nullable: true })
  cabys: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  // Producto de demostración (lo crea solo el administrador del sistema): se usa en el POS y en los pedidos de tienda para
  // mostrar todo el proceso, NO genera asientos contables y se puede eliminar junto con todo lo que se hizo con él.
  @Column({ type: 'boolean', name: 'es_prueba', default: false })
  esPrueba: boolean;

  @OneToMany(() => VarianteProducto, (variante) => variante.producto)
  variantes: Relation<VarianteProducto>[];

  @OneToMany(() => ProductoFoto, (foto) => foto.producto)
  fotos: Relation<ProductoFoto>[];

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
