import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';

// Un préstamo del Banco Popular o un embargo que la empresa descuenta por planilla. Se anota el monto y cada cuánto se descuenta (semana,
// quincena o mes); si el período es más largo que la planilla, se reparte entre los sábados. No es plata prestada por la empresa: no sale de
// caja ni es una cuenta por cobrar; lo descontado se le debe al banco o al juzgado.
@Entity({ name: 'planilla_deducciones_externas' })
export class DeduccionExterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id' })
  empleadoId: string;

  // Préstamo del Banco Popular o embargo judicial: en ambos solo importa cuánto se descuenta y cada cuánto.
  @Column({ type: 'varchar', length: 30, default: 'prestamo_banco_popular' })
  tipo: 'prestamo_banco_popular' | 'embargo';

  // Número de operación, expediente o nota para reconocerlo (opcional).
  @Column({ type: 'varchar', length: 160, default: '' })
  descripcion: string;

  // Monto a descontar, por semana, quincena o mes según `periodicidad` (la columna se llama cuota_mensual por su origen: antes solo había mensual).
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'cuota_mensual' })
  monto: string;

  @Column({ type: 'varchar', length: 10, default: 'mes' })
  periodicidad: 'semana' | 'quincena' | 'mes';

  // Período en que se descuenta. Sin fecha de inicio (null) vale para cualquier planilla desde siempre; sin fecha de fin (null), mientras esté activo.
  @Column({ type: 'date', name: 'fecha_desde', nullable: true })
  fechaDesde: string | null;

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
