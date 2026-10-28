import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';
import { PuntoMarca } from './punto-marca.entity.js';

// Cada toque de «Marcar» desde el celular, tal cual ocurrió. La hora la pone el servidor y siempre se hizo
// escaneando el QR de la pantalla del punto (que solo se ve en el lugar).
@Entity({ name: 'planilla_marcas_app' })
@Index(['empleadoId', 'fecha'])
@Index(['empleadoId', 'intento'])
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

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo: string | null;

  // false si la hora no se sumó a las marcas del día (día ya decidido, planilla aprobada, personal de tienda).
  @Column({ type: 'boolean', name: 'en_dia', default: true })
  enDia: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  // Identificador que genera el celular en cada intento de marcar. Si la respuesta se pierde y el celular reintenta,
  // el servidor reconoce el intento y devuelve la marca que ya guardó en vez de rechazarla o duplicarla.
  @Column({ type: 'varchar', length: 40, nullable: true })
  intento: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
