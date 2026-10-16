import { Column, Entity, PrimaryColumn } from 'typeorm';

// Datos de la empresa para la planilla web del Banco Popular (en el Excel
// del banco son las hojas «Datos_Empresa»). Una sola fila, id 'general'.
@Entity({ name: 'planilla_banco_popular' })
export class ConfiguracionBancoPopular {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  // Nombre que sale en la línea de débito (máx. 35 caracteres en el archivo).
  @Column({ type: 'varchar', length: 120, name: 'nombre_empresa', default: '' })
  nombreEmpresa: string;

  @Column({ type: 'varchar', length: 20, name: 'numero_patrono', default: '' })
  numeroPatrono: string;

  // Cédula jurídica, solo dígitos.
  @Column({ type: 'varchar', length: 20, name: 'cedula_patrono', default: '' })
  cedulaPatrono: string;

  @Column({ type: 'varchar', length: 20, name: 'identificador_cliente', default: '' })
  identificadorCliente: string;

  // Tipo de convenio: 1 = colones, 2 = dólares.
  @Column({ type: 'integer', default: 1 })
  convenio: number;

  // IBAN de la cuenta de la empresa que se debita.
  @Column({ type: 'varchar', length: 34, name: 'cuenta_patrono', default: '' })
  cuentaPatrono: string;

  @Column({ type: 'varchar', length: 3, default: 'CRC' })
  moneda: string;
}
