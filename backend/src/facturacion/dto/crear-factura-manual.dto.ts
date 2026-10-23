import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoPago } from '../../common/enums/tipo-pago.enum.js';

export const IMPUESTOS_PERMITIDOS = [0, 1, 2, 4, 8, 13];
export const MEDIOS_PAGO = ['efectivo', 'transferencia', 'sinpe', 'tarjeta', 'cheque', 'otro'];

export class LineaFacturaManualDto {
  // Producto del catálogo: descuenta stock. Sin esto es una línea libre.
  @IsOptional()
  @IsUUID()
  varianteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  precioUnitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;

  @IsNumber()
  @IsIn(IMPUESTOS_PERMITIDOS, { message: 'El impuesto debe ser 0, 1, 2, 4, 8 o 13 %.' })
  impuestoPorcentaje: number;
}

export class CrearFacturaManualDto {
  @IsUUID()
  clienteId: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha?: string;

  @IsEnum(TipoPago)
  tipoPago: TipoPago;

  // Obligatorio si es a crédito.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  diasCredito?: number;

  @IsString()
  @IsIn(MEDIOS_PAGO)
  medioPago: string;

  @IsOptional() @IsString() @MaxLength(80) ordenCompra?: string;
  @IsOptional() @IsString() @MaxLength(120) vendedor?: string;

  // Obligatoria si alguna línea es un producto del catálogo.
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @IsOptional() @IsString() @MaxLength(4000) notas?: string;
  @IsOptional() @IsString() @MaxLength(8000) terminos?: string;
  @IsOptional() @IsString() @MaxLength(2000) leyenda?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos una línea.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineaFacturaManualDto)
  lineas: LineaFacturaManualDto[];
}
