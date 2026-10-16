import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
import { NaturalezaCuenta, TipoCuentaContable } from '../../common/enums/tipo-cuenta-contable.enum.js';

export class CrearCuentaContableDto {
  @Matches(/^[1-5]\d{3}$/, { message: 'El código son 4 dígitos y empieza en 1 (activo), 2 (pasivo), 3 (patrimonio), 4 (ingreso) o 5 (costo/gasto).' })
  codigo: string;

  @IsString() @MinLength(3) @MaxLength(120) nombre: string;

  @IsEnum(TipoCuentaContable) tipo: TipoCuentaContable;

  // Si no se manda, se deduce del tipo (activos y gastos deudora; el resto acreedora).
  @IsOptional() @IsEnum(NaturalezaCuenta) naturaleza?: NaturalezaCuenta;

  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
}

export class ActualizarCuentaContableDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
  @IsOptional() @IsBoolean() activa?: boolean;
}

export class LineaAsientoManualDto {
  @IsUUID() cuentaId: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000_000) debe?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000_000) haber?: number;
}

export class CrearAsientoManualDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  @IsString() @MinLength(3) @MaxLength(255) descripcion: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Un asiento necesita al menos dos líneas.' })
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LineaAsientoManualDto)
  lineas: LineaAsientoManualDto[];
}

export class ReversarAsientoDto {
  @IsString() @MinLength(3, { message: 'Indicá el motivo.' }) @MaxLength(200) motivo: string;
}

export class CerrarPeriodoDto {
  // De dónde sale el dinero de los pagos del cierre (por defecto, caja general).
  @IsOptional()
  @IsUUID()
  cuentaBancariaId?: string;

  // Fecha en que se pagó (por defecto hoy).
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class CerrarAnioFiscalDto {
  // Ajuste a la utilidad contable para llegar a la renta neta (gastos no deducibles,
  // pérdidas de años anteriores, etc.): suma si es positivo, resta si es negativo.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-10_000_000_000)
  @Max(10_000_000_000)
  ajusteFiscal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notas?: string;
}

export class ActualizarParametroFiscalDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100_000_000_000)
  valor: number;
}
