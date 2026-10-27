import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const decimal = { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

// Un lugar donde se puede marcar (la empresa, cada tienda): dónde queda, qué tan cerca hay que estar y si
// además hay que escanear el QR de su pantalla.
@Entity({ name: 'planilla_puntos_marca' })
export class PuntoMarca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'varchar', length: 10, default: 'empresa' })
  tipo: 'empresa' | 'tienda';

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal })
  latitud: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal })
  longitud: number | null;

  @Column({ type: 'int', name: 'radio_metros', default: 100 })
  radioMetros: number;

  // true: hay que escanear el QR de la pantalla del punto (la empresa). false: basta la ubicación (una tienda sin pantalla).
  @Column({ type: 'boolean', name: 'requiere_qr', default: true })
  requiereQr: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  // Con él se calcula el QR de cada momento. Nunca sale del servidor.
  @Column({ type: 'varchar', length: 64, select: false })
  secreto: string;

  // Huella del token de la pantalla (tablet) que muestra el QR; el token solo se ve al crearlo.
  @Column({ type: 'varchar', length: 64, name: 'pantalla_huella', nullable: true, select: false })
  pantallaHuella: string | null;

  @Column({ type: 'timestamptz', name: 'pantalla_ultima_vez', nullable: true })
  pantallaUltimaVez: Date | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
