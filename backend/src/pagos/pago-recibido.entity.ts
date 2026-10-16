import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Cliente } from '../clientes/cliente.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { CuentaBancaria } from './cuenta-bancaria.entity.js';
import { PagoAplicacion } from './pago-aplicacion.entity.js';

// Recibo de caja: dinero que entró a la empresa. Puede ser el pago de una
// o varias facturas a crédito de un cliente (baja la cuenta por cobrar)
// u "otros ingresos". Nunca se borra: si hubo un error se anula, y la
// anulación genera el asiento inverso.
@Entity({ name: 'pagos_recibidos' })
export class PagoRecibido {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Número del recibo de caja (consecutivo propio).
  @Column({ type: 'integer', unique: true })
  numero: number;

  // 'factura' = pago a facturas de un cliente; 'otros' = otros ingresos.
  @Column({ type: 'varchar', length: 10 })
  tipo: 'factura' | 'otros';

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Relation<Cliente> | null;

  @Column({ type: 'uuid', name: 'cliente_id', nullable: true })
  clienteId: string | null;

  @ManyToOne(() => CuentaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria: Relation<CuentaBancaria>;

  @Column({ type: 'uuid', name: 'cuenta_bancaria_id' })
  cuentaBancariaId: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 30, name: 'medio_pago' })
  medioPago: string;

  @Column({ type: 'varchar', length: 3, default: 'CRC' })
  moneda: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  // Solo "otros ingresos": de qué es el ingreso.
  @Column({ type: 'varchar', length: 200, nullable: true })
  concepto: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'varchar', length: 10, default: 'vigente' })
  estado: 'vigente' | 'anulado';

  @Column({ type: 'varchar', length: 255, name: 'motivo_anulacion', nullable: true })
  motivoAnulacion: string | null;

  @Column({ type: 'timestamp', name: 'anulado_en', nullable: true })
  anuladoEn: Date | null;

  @OneToMany(() => PagoAplicacion, (a) => a.pago, { cascade: ['insert'] })
  aplicaciones: Relation<PagoAplicacion>[];

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por_id' })
  creadoPor: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'creado_por_id' })
  creadoPorId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
