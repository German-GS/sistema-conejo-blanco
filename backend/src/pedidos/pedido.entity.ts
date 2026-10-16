import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Cliente } from '../clientes/cliente.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import { EstadoPedido } from '../common/enums/estado-pedido.enum.js';
import { MetodoEntrega } from '../common/enums/metodo-entrega.enum.js';
import { PedidoLinea } from './pedido-linea.entity.js';
import type { ClientePendiente } from './cliente-pendiente.interface.js';
import { Factura } from '../facturacion/factura.entity.js';

// La hoja de pedido digital que llena el vendedor: cliente, condición de
// pago y las líneas de producto. Descuenta bodega apenas se crea (ver
// PedidosService.crear), con un colchón de sobreventa configurable —
// facturar es un flujo aparte que ya no mueve inventario, solo reconoce
// la venta fiscal y contable (ver FacturacionService.facturarPedido).
@Entity({ name: 'pedidos' })
export class Pedido {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Correlativo legible para el papel/impresión (ej. "1024"), distinto del
  // uuid interno. Lo asigna PedidosService con el contador atómico.
  @Column({ type: 'integer', name: 'numero_orden', unique: true })
  numeroOrden: number;

  // Nulo mientras el pedido tiene un cliente pendiente de registrar (ver
  // clientePendiente más abajo) — es lo que distingue "cliente real
  // vinculado" de "todavía no existe en la base".
  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Relation<Cliente> | null;

  @Column({ type: 'uuid', name: 'cliente_id', nullable: true })
  clienteId: string | null;

  // Datos que el vendedor tecleó a mano cuando el cliente no estaba en la
  // base (nombre/cédula/teléfono/dirección). Se conserva aunque
  // administración ya haya vinculado un Cliente real, como registro de lo
  // que el vendedor capturó originalmente en la calle.
  @Column({ type: 'jsonb', name: 'cliente_pendiente', nullable: true })
  clientePendiente: ClientePendiente | null;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendedor_id' })
  vendedor: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'vendedor_id' })
  vendedorId: string;

  // De dónde sale el producto cuando se factura (ver FacturacionService).
  // Nula solo en pedidos viejos de antes de que existiera inventario
  // multi-bodega; obligatoria para pedidos nuevos (ver CrearPedidoDto).
  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion> | null;

  @Column({ type: 'uuid', name: 'ubicacion_id', nullable: true })
  ubicacionId: string | null;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'enum', enum: TipoPago, name: 'tipo_pago' })
  tipoPago: TipoPago;

  // Solo aplica cuando tipoPago = Credito; validado en el DTO (mínimo 30).
  @Column({ type: 'integer', name: 'dias_credito', nullable: true })
  diasCredito: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'iva_porcentaje' })
  ivaPorcentaje: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'iva_monto' })
  ivaMonto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'enum', enum: EstadoPedido, default: EstadoPedido.ACTIVO })
  estado: EstadoPedido;

  // Vía de distribución — a veces se manda por una empresa de encomienda,
  // otras veces la entrega la hace la empresa misma. Nula solo en pedidos
  // de antes de que existiera este campo; obligatoria para pedidos nuevos
  // (ver CrearPedidoDto).
  @Column({ type: 'enum', enum: MetodoEntrega, name: 'metodo_entrega', nullable: true })
  metodoEntrega: MetodoEntrega | null;

  // Solo aplica cuando metodoEntrega = Encomienda (ej. "Correos de Costa
  // Rica", "Mensajería Rápida S.A.").
  @Column({ type: 'varchar', length: 120, name: 'empresa_encomienda', nullable: true })
  empresaEncomienda: string | null;

  @OneToMany(() => PedidoLinea, (linea) => linea.pedido, { cascade: true })
  lineas: Relation<PedidoLinea>[];

  // Nula hasta que administración factura el pedido (ver FacturacionService).
  @OneToOne(() => Factura, (factura) => factura.pedido)
  factura: Relation<Factura> | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
