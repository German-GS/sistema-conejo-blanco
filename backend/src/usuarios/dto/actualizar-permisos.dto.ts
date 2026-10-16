import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Permiso } from '../../common/enums/permiso.enum.js';

class PermisoOverrideDto {
  @IsEnum(Permiso)
  permiso: Permiso;

  @IsBoolean()
  concedido: boolean;
}

export class ActualizarPermisosDto {
  // Lista completa de ajustes puntuales — reemplaza los anteriores.
  // Vacía = volver al set por defecto del rol.
  @IsArray()
  @ArrayMaxSize(Object.values(Permiso).length)
  @ValidateNested({ each: true })
  @Type(() => PermisoOverrideDto)
  permisos: PermisoOverrideDto[];
}
