import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Un lugar donde se puede marcar (la empresa, cada tienda): su pantalla muestra el QR que cambia cada 30 s.
// No se guarda ni se pide ubicación: el QR solo se ve en el lugar.
@Entity({ name: 'planilla_puntos_marca' })
export class PuntoMarca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'varchar', length: 10, default: 'empresa' })
  tipo: 'empresa' | 'tienda';

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
