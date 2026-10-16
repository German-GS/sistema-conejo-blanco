import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Empleado } from './empleado.entity.js';
import { ImportacionMarcas } from './importacion-marcas.entity.js';
import { EstadoDia, TipoResolucionDia } from './planilla.enums.js';

// Un día de un empleado, ya interpretado a partir de las marcas crudas.
// Las marcas originales quedan guardadas tal cual vinieron del reloj
// (marcas) — lo que se paga sale de los minutos calculados, que cambian
// solo si administración resuelve el día (ver ResolucionDia).
@Entity({ name: 'planilla_dias' })
@Unique(['empleadoId', 'fecha'])
export class DiaAsistencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  @ManyToOne(() => ImportacionMarcas, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'importacion_id' })
  importacion: Relation<ImportacionMarcas> | null;

  @Column({ type: 'uuid', name: 'importacion_id', nullable: true })
  importacionId: string | null;

  @Column({ type: 'date' })
  fecha: string;

  // ['08:11','13:00','17:01'] — tal cual salieron del reloj, ordenadas.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  marcas: string[];

  @Column({ type: 'enum', enum: EstadoDia })
  estado: EstadoDia;

  // 'ordinario' | 'domingo' | 'feriado'
  @Column({ type: 'varchar', length: 12, name: 'tipo_dia', default: 'ordinario' })
  tipoDia: string;

  // Todo en minutos.
  @Column({ type: 'integer', name: 'minutos_brutos', default: 0 })
  minutosBrutos: number;

  @Column({ type: 'integer', name: 'minutos_almuerzo', default: 0 })
  minutosAlmuerzo: number;

  @Column({ type: 'boolean', name: 'almuerzo_estimado', default: false })
  almuerzoEstimado: boolean;

  @Column({ type: 'integer', name: 'minutos_netos', default: 0 })
  minutosNetos: number;

  @Column({ type: 'integer', name: 'minutos_extra', default: 0 })
  minutosExtra: number;

  // Minutos trabajados en domingo o feriado (se pagan con otro factor).
  @Column({ type: 'integer', name: 'minutos_especiales', default: 0 })
  minutosEspeciales: number;

  // Se descuenta el día completo del salario (ausencia injustificada).
  @Column({ type: 'boolean', default: false })
  descuenta: boolean;

  // Ausencia parcial: minutos que faltaron para la jornada, y cuántos se
  // descuentan (0 si caen en la tolerancia o fueron justificados).
  @Column({ type: 'int', name: 'minutos_faltantes', default: 0 })
  minutosFaltantes: number;

  @Column({ type: 'int', name: 'minutos_descontar', default: 0 })
  minutosDescontar: number;

  // Comprobante (foto o PDF) de la justificación; se sirve solo con sesión
  // de Administración (ver PlanillaController).
  @Column({ type: 'varchar', length: 80, nullable: true })
  justificante: string | null;

  @Column({ type: 'varchar', length: 255, name: 'motivo_revision', nullable: true })
  motivoRevision: string | null;

  // Resolución vigente (la bitácora completa está en ResolucionDia).
  @Column({ type: 'enum', enum: TipoResolucionDia, name: 'resolucion_tipo', nullable: true })
  resolucionTipo: TipoResolucionDia | null;

  @Column({ type: 'varchar', length: 255, name: 'resolucion_motivo', nullable: true })
  resolucionMotivo: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
