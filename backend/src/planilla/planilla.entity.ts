import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { EstadoPlanilla, FrecuenciaPago } from './planilla.enums.js';
import { PlanillaLinea } from './planilla-linea.entity.js';

@Entity({ name: 'planilla_planillas' })
export class Planilla {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: FrecuenciaPago })
  frecuencia: FrecuenciaPago;

  @Column({ type: 'date', name: 'fecha_desde' })
  fechaDesde: string;

  @Column({ type: 'date', name: 'fecha_hasta' })
  fechaHasta: string;

  @Column({ type: 'enum', enum: EstadoPlanilla, default: EstadoPlanilla.BORRADOR })
  estado: EstadoPlanilla;

  // Viáticos anotados a mano por empleado (empleadoId → monto). Viven aquí para que sobrevivan a cada recálculo de las líneas.
  @Column({ type: 'jsonb', default: () => "'{}'" })
  viaticos: Record<string, number>;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'total_bruto', default: 0 })
  totalBruto: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'total_deducciones', default: 0 })
  totalDeducciones: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'total_neto', default: 0 })
  totalNeto: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'total_cargas_patronales', default: 0 })
  totalCargasPatronales: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'total_provisiones', default: 0 })
  totalProvisiones: string;

  @OneToMany(() => PlanillaLinea, (linea) => linea.planilla, { cascade: true })
  lineas: Relation<PlanillaLinea>[];

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creada_por' })
  creadaPor: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'creada_por' })
  creadaPorId: string;

  @Column({ type: 'timestamp', name: 'aprobada_en', nullable: true })
  aprobadaEn: Date | null;

  @Column({ type: 'uuid', name: 'aprobada_por', nullable: true })
  aprobadaPorId: string | null;

  @Column({ type: 'timestamp', name: 'pagada_en', nullable: true })
  pagadaEn: Date | null;

  @Column({ type: 'timestamp', name: 'anulada_en', nullable: true })
  anuladaEn: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'motivo_anulacion', nullable: true })
  motivoAnulacion: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
