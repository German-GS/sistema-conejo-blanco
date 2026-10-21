import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Rol } from '../../common/enums/rol.enum.js';

// El rol "sistema" no se crea desde la app: es la cuenta del administrador del sistema.
export const ROLES_ASIGNABLES = [Rol.GERENTE_GENERAL, Rol.ADMINISTRACION, Rol.CONTADOR, Rol.ASISTENTE, Rol.VENDEDOR, Rol.ENCARGADO_TIENDA];

export class CrearUsuarioDto {
  // Si la cuenta es para un empleado de planilla ya registrado, se toman de ahí
  // el nombre (y queda vinculada). Sin empleadoId es una cuenta de una persona
  // externa (ej. el contador).
  @IsOptional()
  @IsUUID()
  empleadoId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(160)
  email: string;

  // Opcional: si no viene, el sistema genera una clave temporal fácil de dictar y la
  // devuelve una sola vez. En ambos casos es solo para el primer ingreso (por eso acepta
  // cualquier clave de al menos 6 caracteres): la persona debe cambiarla por una propia.
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La clave temporal debe tener al menos 6 caracteres.' })
  @MaxLength(200)
  password?: string;

  @IsIn(ROLES_ASIGNABLES, { message: 'Ese perfil no se puede asignar.' })
  rol: Rol;

  // Solo para el perfil "encargado de tienda": la tienda donde trabaja.
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}
