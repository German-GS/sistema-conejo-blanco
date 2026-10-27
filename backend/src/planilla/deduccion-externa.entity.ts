import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';

// Un préstamo del empleado en el Banco Popular que la empresa descuenta por planilla. El banco manda cada mes cuánto descontar: esa es la
// cuota mensual, y la planilla semanal la reparte entre los sábados del mes (4 o 5). No es plata prestada por la empresa: no sale de caja
// ni es una cuenta por cobrar; lo descontado se le debe al banco.
@Entity({ name: 'planilla_deducciones_externas' })
export class DeduccionExterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  // Por ahora solo préstamos del Banco Popular (los embargos se dejan como están).
  @Column({ type: 'varchar', length: 30, default: 'prestamo_banco_popular' })
  tipo: 'prestamo_banco_popular';

  // Número de operación o nota para reconocerlo en la orden del banco.
  @Column({ type: 'varchar', length: 160 })
  descripcion: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'cuota_mensual' })
  cuotaMensual: string;

  // Período en que se descuenta (hasta = null: sin fecha de fin, mientras esté activo).
  @Column({ type: 'date', name: 'fecha_desde' })
  fechaDesde: string;

  @Column({ type: 'date', name: 'fecha_hasta', nullable: true })
  fechaHasta: string | null;

  // Saldo pendiente, si se sabe: baja con cada planilla aprobada y el descuento para al llegar a cero. Vacío = sin control de saldo.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  saldo: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
