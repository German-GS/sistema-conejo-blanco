import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';

// Lo que el empleado le debe a la empresa (adelanto, préstamo, etc.). Solo
// se descuenta de la planilla lo que el empleado autorizó por escrito.
@Entity({ name: 'planilla_deudas' })
export class DeudaEmpleado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  @Column({ type: 'varchar', length: 160 })
  descripcion: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'monto_original' })
  montoOriginal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saldo: string;

  // Cuánto se descuenta en cada planilla (hasta agotar el saldo).
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'cuota_por_planilla' })
  cuotaPorPlanilla: string;

  // Dónde consta la autorización del empleado para descontarle.
  @Column({ type: 'varchar', length: 255, name: 'autorizacion_nota' })
  autorizacionNota: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
