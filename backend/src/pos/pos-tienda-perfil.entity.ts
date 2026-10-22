import { Column, Entity, PrimaryColumn } from 'typeorm';

// Datos propios de cada tienda para el encabezado del tiquete: cada tienda tiene su cédula jurídica (por eso trabajan en régimen
// simplificado). Lo que se deja vacío cae en los datos generales de la empresa (Configuración → Datos de factura).
@Entity({ name: 'pos_tienda_perfiles' })
export class PosTiendaPerfil {
  @PrimaryColumn({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  @Column({ type: 'varchar', length: 160, name: 'razon_social', default: '' })
  razonSocial: string;

  @Column({ type: 'varchar', length: 160, name: 'nombre_comercial', default: '' })
  nombreComercial: string;

  @Column({ type: 'varchar', length: 30, name: 'cedula_juridica', default: '' })
  cedulaJuridica: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  telefono: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  correo: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  direccion: string;

  // Mensaje al pie de ESTA tienda; si queda vacío se usa el general de la configuración del POS.
  @Column({ type: 'varchar', length: 300, name: 'pie_tiquete', default: '' })
  pieTiquete: string;

  // Leyenda legal al final del tiquete; si queda vacía se usa la del régimen simplificado.
  @Column({ type: 'varchar', length: 300, default: '' })
  leyenda: string;
}
