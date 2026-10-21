import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Rol } from '../../common/enums/rol.enum.js';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsIn([Rol.GERENTE_GENERAL, Rol.ADMINISTRACION, Rol.CONTADOR, Rol.ASISTENTE, Rol.VENDEDOR, Rol.ENCARGADO_TIENDA], { message: 'Ese perfil no se puede asignar.' })
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Solo para el perfil "encargado de tienda": la tienda donde trabaja.
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}
