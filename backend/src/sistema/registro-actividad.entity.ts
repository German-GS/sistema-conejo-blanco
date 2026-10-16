import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Registro de actividad de TODO el sistema (quién hizo qué, desde dónde y con qué resultado),
// solo visible para el administrador del sistema. Solo se agrega; se depura por antigüedad.
@Entity({ name: 'registro_actividad' })
export class RegistroActividad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'usuario_email', default: '' })
  usuarioEmail: string;

  @Column({ type: 'varchar', length: 30, default: '' })
  rol: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  area: string;

  @Column({ type: 'varchar', length: 8 })
  metodo: string;

  @Column({ type: 'varchar', length: 300 })
  ruta: string;

  @Column({ type: 'int' })
  estado: number;

  @Column({ type: 'int', name: 'duracion_ms', default: 0 })
  duracionMs: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 200, name: 'agente', default: '' })
  agente: string;

  // Resumen de lo enviado (sin claves ni datos sensibles) y, si falló, el mensaje de error.
  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 400, default: '' })
  mensaje: string;
}
