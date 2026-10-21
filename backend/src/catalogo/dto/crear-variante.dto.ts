import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, Max, MaxLength, MinLength } from 'class-validator';

// Max en precioPorPar/costo: el mismo límite que admite la columna
// decimal(12,2) de VarianteProducto — sin esto, un número más grande
// revienta en Postgres con un 500 feo en vez de un 400 claro acá.
export class CrearVarianteDto {
  @IsUUID()
  productoId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  color: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  precioPorPar: number;

  // Opcional: sin costo cargado no se puede poner un piso de descuento
  // para esta variante (ver PedidosService), pero igual se puede vender.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  costo?: number;

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
