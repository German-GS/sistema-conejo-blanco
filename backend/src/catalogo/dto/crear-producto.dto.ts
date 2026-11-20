import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  CODIGO_PRODUCTO_MENSAJE,
  CODIGO_PRODUCTO_REGEX,
  normalizarCodigoProducto,
} from '../../common/utils/codigo-producto.util.js';

export class CrearProductoDto {
  @Transform(({ value }) => normalizarCodigoProducto(value))
  @IsString()
  @MaxLength(30)
  // Los productos exclusivos de una tienda conservan el código que ya tenían; el formato estándar es para el catálogo general.
  @ValidateIf((o: CrearProductoDto) => !o.ubicacionExclusivaId)
  @Matches(CODIGO_PRODUCTO_REGEX, { message: CODIGO_PRODUCTO_MENSAJE })
  codigo: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  // Código CABYS de Hacienda (13 dígitos); vacío lo quita.
  @IsOptional()
  @Matches(/^(\d{13})?$/, { message: 'El CABYS tiene 13 dígitos.' })
  cabys?: string;

  // Solo lo acepta el administrador del sistema.
  @IsOptional()
  @IsBoolean()
  esPrueba?: boolean;

  // Tienda a la que pertenece el producto (vacío = catálogo general).
  @IsOptional()
  @IsUUID()
  ubicacionExclusivaId?: string;
}
