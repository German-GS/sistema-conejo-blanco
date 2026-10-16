import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'planilla_feriados' })
export class Feriado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  fecha: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  // De pago obligatorio: se paga aunque no se trabaje (y doble si se
  // trabaja). Los de pago no obligatorio solo se pagan si se trabajó.
  @Column({ type: 'boolean', name: 'pago_obligatorio', default: true })
  pagoObligatorio: boolean;
}
