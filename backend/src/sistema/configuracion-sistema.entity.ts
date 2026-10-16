import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Ajustes del sistema que solo toca el administrador del sistema: políticas de
// seguridad, módulos activos, modo mantenimiento. Clave/valor.
@Entity({ name: 'configuracion_sistema' })
export class ConfiguracionSistema {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  clave: string;

  @Column({ type: 'jsonb' })
  valor: unknown;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
