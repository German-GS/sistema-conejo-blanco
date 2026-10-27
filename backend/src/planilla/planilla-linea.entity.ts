import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Planilla } from './planilla.entity.js';
import { Empleado } from './empleado.entity.js';

// Una fila del libro de salarios: todo lo de un empleado en una planilla.
// Los montos quedan congelados al aprobar — si mañana cambia un porcentaje
// o el salario, esta planilla no se mueve.
@Entity({ name: 'planilla_lineas' })
export class PlanillaLinea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Planilla, (planilla) => planilla.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planilla_id' })
  planilla: Relation<Planilla>;

  @Column({ type: 'uuid', name: 'planilla_id' })
  planillaId: string;

  @ManyToOne(() => Empleado, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  // Foto del empleado al momento de calcular.
  @Column({ type: 'varchar', length: 160, name: 'empleado_nombre' })
  empleadoNombre: string;

  @Column({ type: 'varchar', length: 40, name: 'empleado_cedula', nullable: true })
  empleadoCedula: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'salario_base' })
  salarioBase: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'tarifa_hora' })
  tarifaHora: string;

  @Column({ type: 'integer', name: 'dias_ausencia_descontados', default: 0 })
  diasAusenciaDescontados: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'descuento_ausencias', default: 0 })
  descuentoAusencias: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'horas_ausentes', default: 0 })
  horasAusentes: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'descuento_horas', default: 0 })
  descuentoHoras: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'horas_extra', default: 0 })
  horasExtra: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'monto_extra', default: 0 })
  montoExtra: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'horas_especiales', default: 0 })
  horasEspeciales: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'monto_especiales', default: 0 })
  montoEspeciales: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  bruto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  sem: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ivm: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'banco_popular', default: 0 })
  bancoPopular: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  renta: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'deudas_descontadas', default: 0 })
  deudasDescontadas: string;

  // Préstamos del Banco Popular descontados en esta planilla (no son deuda con la empresa).
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'deducciones_externas', default: 0 })
  deduccionesExternas: string;

  // Viáticos pagados con la planilla: se suman al neto pero no entran al bruto, ni a la CCSS, ni a la renta, ni a las provisiones.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  viaticos: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'total_deducciones' })
  totalDeducciones: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  neto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'cargas_patronales' })
  cargasPatronales: string;

  @Column({ type: 'jsonb', name: 'desglose_cargas' })
  desgloseCargas: Record<string, number>;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  provisiones: string;

  @Column({ type: 'jsonb', name: 'desglose_provisiones' })
  desgloseProvisiones: Record<string, number>;

  // Días que entraron al cálculo, para poder explicar cualquier monto.
  @Column({ type: 'jsonb' })
  detalle: Record<string, unknown>;
}
