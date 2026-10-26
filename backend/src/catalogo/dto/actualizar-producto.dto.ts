import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  CODIGO_PRODUCTO_MENSAJE,
  CODIGO_PRODUCTO_REGEX,
  normalizarCodigoProducto,
} from '../../common/utils/codigo-producto.util.js';

export class ActualizarProductoDto {
  @IsOptional()
  @Transform(({ value }) => normalizarCodigoProducto(value))
  @IsString()
  @Matches(CODIGO_PRODUCTO_REGEX, { message: CODIGO_PRODUCTO_MENSAJE })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  // Código CABYS de Hacienda (13 dígitos); vacío lo quita.
  @IsOptional()
  @Matches(/^(\d{13})?$/, { message: 'El CABYS tiene 13 dígitos.' })
  cabys?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
