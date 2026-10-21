import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, MinLength } from 'class-validator';

export class ActualizarVarianteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  precioPorPar?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  costo?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Precio al detalle de la tienda (POS). null = quitarlo (la variante deja de venderse en la tienda).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  precioTienda?: number | null;

  // Código de barras que lee el lector de la caja. null o vacío = quitarlo.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9._-]{4,40}$/, { message: 'El código de barras debe tener de 4 a 40 letras, números, punto, guion o guion bajo.' })
  codigoBarras?: string | null;
}
