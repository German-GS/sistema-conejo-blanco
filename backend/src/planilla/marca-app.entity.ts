import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';
import { PuntoMarca } from './punto-marca.entity.js';

const decimal = { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

// Cada toque de «Marcar» desde el celular, tal cual ocurrió. La hora la pone el servidor. Se guarda siempre
// (aunque la ubicación falle) para que nadie pierda pago por un problema técnico; `verificada` dice si
// además la ubicación coincidió con el punto.
@Entity({ name: 'planilla_marcas_app' })
@Index(['empleadoId', 'fecha'])
export class MarcaApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  @ManyToOne(() => PuntoMarca, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'punto_id' })
  punto: Relation<PuntoMarca> | null;

  @Column({ type: 'uuid', name: 'punto_id', nullable: true })
  puntoId: string | null;

  @Column({ type: 'timestamptz' })
  instante: Date;

  // Día y hora de Costa Rica del instante (lo que entra a la asistencia).
  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 5 })
  hora: string;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal })
  latitud: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal })
  longitud: number | null;

  @Column({ type: 'int', name: 'precision_m', nullable: true })
  precisionM: number | null;

  @Column({ type: 'int', name: 'distancia_m', nullable: true })
  distanciaM: number | null;

  @Column({ type: 'boolean', name: 'con_qr', default: false })
  conQr: boolean;

  @Column({ type: 'boolean', default: false })
  verificada: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo: string | null;

  // false si la hora no se sumó a las marcas del día (día ya decidido, planilla aprobada, personal de tienda).
  @Column({ type: 'boolean', name: 'en_dia', default: true })
  enDia: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
