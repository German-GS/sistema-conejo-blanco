import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Pedido } from './pedido.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';

// Una línea = una variante (código + color) con su cantidad en docenas.
// precioPorPar queda "congelado" al momento del pedido: si mañana cambia
// el precio del catálogo, este pedido ya guardado no debe cambiar de monto.
@Entity({ name: 'pedido_lineas' })
export class PedidoLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pedido, (pedido) => pedido.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Relation<Pedido>;

  @Column({ type: 'uuid', name: 'pedido_id' })
  pedidoId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  // Snapshot del código+color al momento del pedido, para que la hoja
  // impresa/histórica no dependa de que el catálogo no haya cambiado.
  @Column({ type: 'varchar', length: 30, name: 'codigo_producto' })
  codigoProducto: string;

  @Column({ type: 'varchar', length: 160, name: 'nombre_producto' })
  nombreProducto: string;

  @Column({ type: 'varchar', length: 60 })
  color: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  docenas: string;

  @Column({ type: 'integer' })
  pares: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'precio_por_par' })
  precioPorPar: string;

  // Descuento aplicado a esta línea (0-100) — validado contra el tope del
  // cliente/configuración general y contra el costo de producción de la
  // variante al momento de guardar (ver PedidosService). precioPorPar de
  // arriba queda como el precio de lista SIN descuento; montoLinea de
  // abajo ya tiene el descuento aplicado.
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'descuento_porcentaje', default: '0.00' })
  descuentoPorcentaje: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'monto_linea' })
  montoLinea: string;
}
