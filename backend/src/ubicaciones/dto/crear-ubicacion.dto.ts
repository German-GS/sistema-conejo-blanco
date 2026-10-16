import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TipoUbicacion } from '../../common/enums/tipo-ubicacion.enum.js';

export class CrearUbicacionDto {
  @IsEnum(TipoUbicacion)
  tipo: TipoUbicacion;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  codigo: string;

  @IsOptional()
  @IsBoolean()
  permiteVenta?: boolean;
}
