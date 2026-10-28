import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';

export type TipoAnomalia = 'almuerzo_corto' | 'almuerzo_largo' | 'almuerzo_salida_temprana' | 'almuerzo_regreso_tarde' | 'tardanza' | 'salida_temprana' | 'ausencia' | 'otro';
export type EstadoAnomalia = 'pendiente' | 'carta_emitida' | 'descartada';

export const ETIQUETAS_ANOMALIA: Record<TipoAnomalia, string> = {
  almuerzo_corto: 'Almuerzo más corto de lo debido',
  almuerzo_largo: 'Almuerzo más largo de lo debido',
  almuerzo_salida_temprana: 'Salió a almorzar antes de la hora',
  almuerzo_regreso_tarde: 'Regresó tarde del almuerzo',
  tardanza: 'Llegada tarde',
  salida_temprana: 'Salida antes de la hora',
  ausencia: 'Ausencia',
  otro: 'Otro',
};

// Anotación sobre la conducta de un empleado (almuerzos fuera de lo normal, tardanzas, etc.). No cambia el pago: queda para
// que gerencia decida y, si corresponde, emita una carta de amonestación con estos hechos. Las de almuerzo salen solas de las marcas.
@Entity({ name: 'planilla_anomalias' })
@Index(['empleadoId', 'fecha'])
export class AnomaliaEmpleado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 30 })
  tipo: TipoAnomalia;

  @Column({ type: 'varchar', length: 500 })
  detalle: string;

  // Minutos involucrados (duración del almuerzo, minutos de tardanza…), si aplica.
  @Column({ type: 'integer', nullable: true })
  minutos: number | null;

  // 'automatica' = detectada de las marcas; 'manual' = anotada por una persona.
  @Column({ type: 'varchar', length: 12, default: 'manual' })
  origen: 'automatica' | 'manual';

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado: EstadoAnomalia;

  // Fecha en que se emitió la carta, o motivo por el que se descartó.
  @Column({ type: 'varchar', length: 255, nullable: true })
  nota: string | null;

  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
