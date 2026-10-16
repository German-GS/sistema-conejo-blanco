import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Registro de quién hizo qué en el control de accesos: inicios de sesión,
// intentos fallidos, bloqueos y cada cambio a cuentas, claves y permisos.
// Solo se agrega: nunca se edita ni se borra desde la aplicación.
@Entity({ name: 'bitacora_accesos' })
export class Bitacora {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  // Quien hizo la acción (puede ser null en un intento de login con un correo que no existe).
  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'usuario_email', default: '' })
  usuarioEmail: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  accion: string;

  // Sobre quién o qué (ej. el correo de la cuenta modificada) y el detalle.
  @Column({ type: 'varchar', length: 160, default: '' })
  objetivo: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  detalle: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;
}
