import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Factura } from './factura.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';

// Línea de una factura hecha a mano (las que salen de un pedido toman sus
// líneas del pedido). Congelada al emitir: descripción, precio y montos
// quedan como salieron aunque el catálogo cambie después.
@Entity({ name: 'factura_lineas' })
export class FacturaLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Factura, (factura) => factura.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'factura_id' })
  factura: Relation<Factura>;

  @Column({ type: 'uuid', name: 'factura_id' })
  facturaId: string;

  // Solo si la línea es un producto del catálogo: de ahí se descuenta
  // stock (en pares) y se reconoce el costo de ventas. Una línea libre
  // (servicio, flete, otro concepto) va sin variante.
  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto> | null;

  @Column({ type: 'uuid', name: 'variante_id', nullable: true })
  varianteId: string | null;

  @Column({ type: 'integer' })
  orden: number;

  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  cantidad: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'precio_unitario' })
  precioUnitario: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'descuento_porcentaje', default: '0.00' })
  descuentoPorcentaje: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'impuesto_porcentaje', default: '0.00' })
  impuestoPorcentaje: string;

  // Costo de la variante al emitir (congelado): con esto la nota de crédito
  // revierte exactamente el costo de ventas que se reconoció.
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'costo_unitario', nullable: true })
  costoUnitario: string | null;

  // cantidad × precio − descuento, sin impuesto.
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'impuesto_monto' })
  impuestoMonto: string;
}
