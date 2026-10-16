import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { LineaAsiento } from './linea-asiento.entity.js';

// Inmutable — igual que el kardex de inventario y el resto del sistema,
// ningún asiento se edita ni se borra; para corregir uno se registra
// otro que lo reversa. origenTipo/origenId apuntan a lo que lo generó
// (factura, pago de cuenta por cobrar, etc.) — polimórfico, no FK real.
@Entity({ name: 'asientos_contables' })
export class AsientoContable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Número consecutivo del asiento (libro diario / mayor). Lo asigna el sistema
  // desde una secuencia al registrar el asiento; nunca se reutiliza.
  @Column({ type: 'int', nullable: true })
  numero: number | null;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 255 })
  descripcion: string;

  @Column({ type: 'varchar', length: 40, name: 'origen_tipo', nullable: true })
  origenTipo: string | null;

  @Column({ type: 'uuid', name: 'origen_id', nullable: true })
  origenId: string | null;

  @OneToMany(() => LineaAsiento, (linea) => linea.asiento, { cascade: true })
  lineas: Relation<LineaAsiento>[];

  // Quién lo registró (asientos manuales); nulo en los automáticos.
  @Column({ type: 'uuid', name: 'creado_por_id', nullable: true })
  creadoPorId: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
