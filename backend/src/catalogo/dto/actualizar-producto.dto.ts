import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizarCodigoProducto } from '../../common/utils/codigo-producto.util.js';

export class ActualizarProductoDto {
  @IsOptional()
  @Transform(({ value }) => normalizarCodigoProducto(value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  // El formato estándar (ej. «KW 223») se exige en el servicio: no aplica a los productos exclusivos de una tienda.
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
