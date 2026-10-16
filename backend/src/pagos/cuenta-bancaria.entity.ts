import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { CuentaContable } from '../contabilidad/cuenta-contable.entity.js';

// Cuentas donde la empresa recibe dinero (bancos y caja). Cada una tiene
// su propia cuenta contable de activo, así que al registrar un pago
// recibido el asiento lleva la plata a ESA cuenta, no a una genérica.
// La caja general (efectivo) es una fila especial ligada a la cuenta
// contable 1100 que ya usan las ventas de contado.
@Entity({ name: 'cuentas_bancarias' })
export class CuentaBancaria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nombre para mostrar (ej. "Banco Costa Rica — colones").
  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  // IBAN o número de cuenta tal como se le da al cliente. Vacío en caja.
  @Column({ type: 'varchar', length: 60, name: 'numero_cuenta', default: '' })
  numeroCuenta: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  titular: string;

  @Column({ type: 'varchar', length: 3, default: 'CRC' })
  moneda: string;

  @Column({ type: 'boolean', name: 'es_caja', default: false })
  esCaja: boolean;

  // Sale impresa en las facturas, en "cuentas bancarias para pago".
  @Column({ type: 'boolean', name: 'mostrar_en_factura', default: true })
  mostrarEnFactura: boolean;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @ManyToOne(() => CuentaContable, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_contable_id' })
  cuentaContable: Relation<CuentaContable>;

  @Column({ type: 'uuid', name: 'cuenta_contable_id' })
  cuentaContableId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
