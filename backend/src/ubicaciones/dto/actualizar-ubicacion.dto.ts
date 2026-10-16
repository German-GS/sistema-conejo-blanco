import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TipoUbicacion } from '../../common/enums/tipo-ubicacion.enum.js';

export class ActualizarUbicacionDto {
  @IsOptional()
  @IsEnum(TipoUbicacion)
  tipo?: TipoUbicacion;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  codigo?: string;

  @IsOptional()
  @IsBoolean()
  permiteVenta?: boolean;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
