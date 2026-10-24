import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { DiaAsistencia } from './dia-asistencia.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { TipoResolucionDia } from './planilla.enums.js';

// Bitácora inmutable: cada decisión sobre un día con marcas raras o una
// ausencia (quién, cuándo, qué decidió y por qué). Nunca se edita ni se
// borra — si se cambia de idea, se agrega otra fila.
@Entity({ name: 'planilla_resoluciones' })
export class ResolucionDia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DiaAsistencia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dia_id' })
  dia: Relation<DiaAsistencia>;

  @Column({ type: 'uuid', name: 'dia_id' })
  diaId: string;

  @Column({ type: 'enum', enum: TipoResolucionDia })
  tipo: TipoResolucionDia;

  @Column({ type: 'varchar', length: 255 })
  motivo: string;

  // Supervisor que confirmó las horas, si lo hubo.
  @Column({ type: 'varchar', length: 120, nullable: true })
  supervisor: string | null;

  // Datos usados (ej. entrada/salida manual) y cómo estaba el día antes.
  @Column({ type: 'jsonb' })
  detalle: Record<string, unknown>;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
