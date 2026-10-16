import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { NaturalezaCuenta, TipoCuentaContable } from '../common/enums/tipo-cuenta-contable.enum.js';

// Plan de cuentas fijo (ver catalogo-cuentas.ts) — mismo criterio que
// Conejo Aquatics: un catálogo mínimo, sembrado una vez, no editable
// desde la app en esta primera fase.
@Entity({ name: 'cuentas_contables' })
export class CuentaContable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'enum', enum: TipoCuentaContable })
  tipo: TipoCuentaContable;

  @Column({ type: 'enum', enum: NaturalezaCuenta })
  naturaleza: NaturalezaCuenta;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  // Para qué sirve la cuenta (se muestra en el catálogo).
  @Column({ type: 'varchar', length: 255, default: '' })
  descripcion: string;

  // Cuentas que el sistema usa por sí solo (ventas, cuentas por cobrar,
  // bancos, planilla…): no se pueden desactivar ni cambiar de tipo.
  @Column({ type: 'boolean', default: false })
  sistema: boolean;
}
