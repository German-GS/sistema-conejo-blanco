import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Empleado } from '../planilla/empleado.entity.js';
import { Rol } from '../common/enums/rol.enum.js';
import { UsuarioPermiso } from './usuario-permiso.entity.js';

// Cuenta de personal (administración, vendedor, contador, asistente).
// Separada de Cliente: un cliente nunca inicia sesión en este sistema,
// solo se le toman pedidos.
@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', unique: true, length: 160 })
  email: string;

  // select:false: el hash nunca sale en una consulta normal ni en las
  // respuestas que devuelven la entidad; solo se pide explícito (login,
  // cambio de clave).
  @Column({ type: 'varchar', name: 'password_hash', select: false })
  passwordHash: string;

  // Se incrementa al cambiar/restablecer la clave o desactivar la cuenta:
  // invalida todos los JWT emitidos antes (el token lleva esta versión).
  @Column({ type: 'int', name: 'version_token', default: 0 })
  versionToken: number;

  @Column({ type: 'int', name: 'intentos_fallidos', default: 0 })
  intentosFallidos: number;

  @Column({ type: 'timestamptz', name: 'bloqueado_hasta', nullable: true })
  bloqueadoHasta: Date | null;

  // Clave temporal (cuenta nueva o restablecida por administración): hasta
  // que la persona la cambie solo puede usar /auth/me y /auth/password.
  @Column({ type: 'boolean', name: 'debe_cambiar_clave', default: false })
  debeCambiarClave: boolean;

  // Hasta cuándo sirve la clave temporal (si no se usa a tiempo hay que pedir otra).
  @Column({ type: 'timestamptz', name: 'clave_temporal_vence', nullable: true })
  claveTemporalVence: Date | null;

  // Verificación en dos pasos (app autenticadora). El secreto va cifrado y nunca sale en una consulta normal.
  @Column({ type: 'varchar', name: 'totp_secreto', nullable: true, select: false })
  totpSecreto: string | null;

  @Column({ type: 'boolean', name: 'totp_activo', default: false })
  totpActivo: boolean;

  @Column({ type: 'enum', enum: Rol })
  rol: Rol;

  // La persona (empleado de planilla) a la que pertenece esta cuenta, si la
  // hay. Un empleado no tiene acceso al sistema hasta que se le crea una cuenta.
  @ManyToOne(() => Empleado, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado> | null;

  @Column({ type: 'uuid', name: 'empleado_id', nullable: true, unique: true })
  empleadoId: string | null;

  @Column({ type: 'timestamptz', name: 'ultimo_acceso', nullable: true })
  ultimoAcceso: Date | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @OneToMany(() => UsuarioPermiso, (permiso) => permiso.usuario)
  permisos: Relation<UsuarioPermiso>[];

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
