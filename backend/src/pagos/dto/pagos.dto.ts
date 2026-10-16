import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MEDIOS_PAGO_RECIBIDO = ['efectivo', 'transferencia', 'sinpe', 'tarjeta', 'cheque', 'otro'];

export class CrearCuentaBancariaDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsString() @MinLength(4, { message: 'Anotá el número de cuenta o IBAN.' }) @MaxLength(60) numeroCuenta: string;
  @IsOptional() @IsString() @MaxLength(120) titular?: string;
  @IsOptional() @IsBoolean() mostrarEnFactura?: boolean;
}

export class ActualizarCuentaBancariaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(60) numeroCuenta?: string;
  @IsOptional() @IsString() @MaxLength(120) titular?: string;
  @IsOptional() @IsBoolean() mostrarEnFactura?: boolean;
  @IsOptional() @IsBoolean() activa?: boolean;
}

export class AplicacionPagoDto {
  @IsUUID() facturaId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  monto: number;
}

export class CrearPagoDto {
  @IsIn(['factura', 'otros']) tipo: 'factura' | 'otros';

  // Obligatorio en pago a facturas; opcional en otros ingresos.
  @IsOptional() @IsUUID() clienteId?: string;

  @IsUUID() cuentaBancariaId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  @IsIn(MEDIOS_PAGO_RECIBIDO) medioPago: string;

  // Pago a facturas: cuánto se aplica a cada una.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AplicacionPagoDto)
  aplicaciones?: AplicacionPagoDto[];

  // Otros ingresos: de qué y cuánto.
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) concepto?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  monto?: number;

  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
}

export class AnularPagoDto {
  @IsString()
  @MinLength(3, { message: 'Indicá el motivo de la anulación.' })
  @MaxLength(255)
  motivo: string;
}
