import { Column, Entity, PrimaryColumn } from 'typeorm';

// Parámetros del impuesto sobre la renta de la empresa (tramos y tarifas). Se
// actualizan cada año con el decreto de Hacienda, desde la pantalla de cierre fiscal.
@Entity({ name: 'parametros_fiscales' })
export class ParametroFiscal {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  clave: string;

  @Column({ type: 'decimal', precision: 16, scale: 4 })
  valor: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  descripcion: string;
}
