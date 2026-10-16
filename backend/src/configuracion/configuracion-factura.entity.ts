import { Column, Entity, PrimaryColumn } from 'typeorm';

// Una sola fila (id fijo 'general') — mismo patrón que
// ConfiguracionDescuento. Es el encabezado y los textos fijos que salen
// impresos en toda factura emitida a mano (logo, razón social, cédula
// jurídica, notas, términos y condiciones, leyenda de autorización). Cada
// factura guarda una copia de esto al emitirse (Factura.encabezado), así
// que cambiar la configuración no altera facturas ya emitidas.
@Entity({ name: 'configuracion_factura' })
export class ConfiguracionFactura {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  // Ruta pública del logo (ej. /uploads/empresa/abc.png).
  @Column({ type: 'varchar', length: 255, name: 'logo_url', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 160, name: 'razon_social', default: '' })
  razonSocial: string;

  @Column({ type: 'varchar', length: 30, name: 'cedula_juridica', default: '' })
  cedulaJuridica: string;

  // Texto bajo el nombre (a qué se dedica la empresa).
  @Column({ type: 'varchar', length: 300, name: 'descripcion_actividad', default: '' })
  descripcionActividad: string;

  // Actividad económica que se muestra en "Ajustes" (código y nombre).
  @Column({ type: 'varchar', length: 200, name: 'actividad_economica', default: '' })
  actividadEconomica: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  correo: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  telefono: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  direccion: string;

  // Texto que aparece precargado en "Notas" (ej. cuentas bancarias).
  @Column({ type: 'text', name: 'notas_predeterminadas', default: '' })
  notasPredeterminadas: string;

  @Column({ type: 'text', name: 'terminos_condiciones', default: '' })
  terminosCondiciones: string;

  // Ej. "Autorizada mediante resolución MH-DGT-RES-0027-2024 …".
  @Column({ type: 'text', name: 'leyenda_autorizacion', default: '' })
  leyendaAutorizacion: string;
}
