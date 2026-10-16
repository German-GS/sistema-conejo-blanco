import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Factura } from './factura.entity.js';
import { Cliente } from '../clientes/cliente.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { EstadoFactura } from '../common/enums/estado-factura.enum.js';

// Nota de Crédito Electrónica: el comprobante que Hacienda exige para
// anular una Factura Electrónica ya emitida — no se puede "borrar" ni
// editar una factura ya generada, se anula con esto. Mismo mecanismo de
// numeración que Factura (ver NumeracionService), tipo de comprobante
// '03'. Anula la factura COMPLETA (no hay notas de crédito parciales en
// este sistema todavía) — ver FacturacionService.anularFactura, que
// además revierte el inventario descontado y el asiento contable de la
// venta, y deja el pedido como anulado. Es, junto con PedidoEdicion y
// MovimientoInventario, un registro que nunca se edita ni se borra.
@Entity({ name: 'notas_credito' })
export class NotaCredito {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Factura, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'factura_id' })
  factura: Relation<Factura>;

  @Column({ type: 'uuid', name: 'factura_id', unique: true })
  facturaId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Relation<Cliente>;

  @Column({ type: 'uuid', name: 'cliente_id' })
  clienteId: string;

  // Código de Hacienda: '03' Nota de Crédito Electrónica.
  @Column({ type: 'varchar', length: 2, name: 'tipo_comprobante', default: '03' })
  tipoComprobante: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  consecutivo: string;

  @Column({ type: 'varchar', length: 50, name: 'clave_numerica', unique: true })
  claveNumerica: string;

  @Column({ type: 'date' })
  fecha: string;

  // Por qué se anula — obligatorio, queda en el comprobante mismo.
  @Column({ type: 'varchar', length: 255 })
  motivo: string;

  // Siempre iguales a los de la factura que anula: es una anulación
  // completa, no un ajuste parcial.
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'iva_porcentaje' })
  ivaPorcentaje: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'iva_monto' })
  ivaMonto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'enum', enum: EstadoFactura, default: EstadoFactura.PENDIENTE_ENVIO })
  estado: EstadoFactura;

  @Column({ type: 'text', name: 'mensaje_hacienda', nullable: true })
  mensajeHacienda: string | null;

  // Quién anuló — igual que PedidoEdicion.usuarioId, para que la
  // anulación quede trazable a una persona, no solo a un motivo de texto.
  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
