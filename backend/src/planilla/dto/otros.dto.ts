import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FrecuenciaPago, TipoResolucionDia } from '../planilla.enums.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ActualizarParametroDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100_000_000)
  valor: number;
}

export class CrearFeriadoDto {
  @Matches(FECHA, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  pagoObligatorio?: boolean;
}

export class ResolverDiaDto {
  @IsEnum(TipoResolucionDia)
  tipo: TipoResolucionDia;

  // Siempre se pide la razón: queda en la bitácora de la decisión.
  @IsString()
  @MinLength(3, { message: 'Anotá el motivo de la decisión.' })
  @MaxLength(255)
  motivo: string;

  @IsOptional()
  @Matches(HORA, { message: 'La entrada debe ser HH:mm.' })
  entrada?: string;

  @IsOptional()
  @Matches(HORA, { message: 'La salida debe ser HH:mm.' })
  salida?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  almuerzoMinutos?: number;

  // Comprobante ya subido (nombre devuelto por POST asistencia/justificantes).
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/, { message: 'El comprobante no es válido.' })
  justificante?: string;

  // Con hora manual: las horas que faltan para la jornada no se descuentan.
  @IsOptional()
  @IsBoolean()
  justificarHoras?: boolean;
}

export class CrearPlanillaDto {
  @IsEnum(FrecuenciaPago)
  frecuencia: FrecuenciaPago;

  @Matches(FECHA, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fechaDesde: string;
}

export class AprobarPlanillaDto {
  // Confirmación explícita de que se sabe que faltan marcas de algunos
  // días y se quiere pagar igual (ej. cierre de empresa, ingreso a medio
  // período).
  @IsOptional()
  @IsBoolean()
  aceptarDiasSinDatos?: boolean;
}

export class PagarPlanillaDto {
  // De dónde salió la plata (cuenta bancaria o caja). Sin indicar: caja general.
  @IsOptional()
  @IsUUID()
  cuentaBancariaId?: string;

  // Fecha en que se pagó (por defecto hoy).
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha?: string;
}

export class MotivoPlanillaDto {
  @IsString()
  @MinLength(5, { message: 'Explicá el motivo (al menos 5 caracteres).' })
  @MaxLength(200)
  motivo: string;
}
