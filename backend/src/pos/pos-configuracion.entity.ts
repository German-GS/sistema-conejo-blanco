import { Column, Entity, PrimaryColumn } from 'typeorm';

// Una sola fila (id 'general'): a qué cuenta bancaria entra lo cobrado por cada medio y el pie del tiquete.
// Lo cobrado en efectivo va siempre a Caja y Bancos (1100). Sin cuenta elegida, el medio también va ahí.
@Entity({ name: 'pos_configuracion' })
export class PosConfiguracion {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'uuid', name: 'cuenta_tarjeta_id', nullable: true })
  cuentaTarjetaId: string | null;

  @Column({ type: 'uuid', name: 'cuenta_sinpe_id', nullable: true })
  cuentaSinpeId: string | null;

  @Column({ type: 'uuid', name: 'cuenta_transferencia_id', nullable: true })
  cuentaTransferenciaId: string | null;

  // Modo de demostración: mientras está activo, la caja de las tiendas muestra los productos de prueba.
  @Column({ type: 'boolean', name: 'modo_prueba', default: false })
  modoPrueba: boolean;

  @Column({ type: 'varchar', length: 300, name: 'pie_tiquete', default: '¡Gracias por su compra!' })
  pieTiquete: string;
}
