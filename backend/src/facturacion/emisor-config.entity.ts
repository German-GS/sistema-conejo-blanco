import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Datos del emisor para la factura electrónica (los que Hacienda exige en el
// XML). Una sola fila (id fijo 'general'), editable desde Facturación
// electrónica. La primera vez se llena con lo que ya hay en la configuración
// de facturas y en las variables EMISOR_*.
@Entity({ name: 'emisor_config' })
export class EmisorConfig {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'varchar', length: 200, name: 'razon_social', default: '' })
  razonSocial: string;

  @Column({ type: 'varchar', length: 200, name: 'nombre_comercial', default: '' })
  nombreComercial: string;

  // Solo dígitos.
  @Column({ type: 'varchar', length: 12, default: '' })
  cedula: string;

  // 01 física, 02 jurídica, 03 DIMEX, 04 NITE.
  @Column({ type: 'varchar', length: 2, name: 'tipo_identificacion', default: '02' })
  tipoIdentificacion: string;

  // Código de actividad económica (6 dígitos, el de Hacienda).
  @Column({ type: 'varchar', length: 6, name: 'actividad_economica', default: '' })
  actividadEconomica: string;

  // Cédula de quien registró el sistema de facturación ante Hacienda.
  @Column({ type: 'varchar', length: 12, name: 'proveedor_sistemas', default: '' })
  proveedorSistemas: string;

  @Column({ type: 'varchar', length: 1, default: '1' })
  provincia: string;

  @Column({ type: 'varchar', length: 2, default: '01' })
  canton: string;

  @Column({ type: 'varchar', length: 2, default: '01' })
  distrito: string;

  @Column({ type: 'varchar', length: 250, name: 'otras_senas', default: '' })
  otrasSenas: string;

  @Column({ type: 'varchar', length: 20, default: '' })
  telefono: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  correo: string;

  // CABYS que se usa en las líneas sin uno propio (productos sin CABYS, líneas libres).
  @Column({ type: 'varchar', length: 13, name: 'cabys_predeterminado', default: '' })
  cabysPredeterminado: string;

  // Las facturas creadas desde esta fecha se envían solas a Hacienda cuando hay
  // conexión. Las anteriores esperan a que alguien decida (enviarlas o no). Nula
  // = no se envía nada solo.
  @Column({ type: 'date', name: 'emision_desde', nullable: true })
  emisionDesde: string | null;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
