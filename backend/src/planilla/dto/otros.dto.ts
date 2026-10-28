import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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
  @MinLength(3, { message: 'Anote el motivo de la decisión.' })
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

  // Incapacidad: horas del día que cubre (vacío = el día completo o lo que faltó) y % que paga la empresa (vacío = el parámetro, 50).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(24)
  horasIncapacidad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajePagoEmpresa?: number;

  // Supervisor que confirma las horas (hora manual u horario estándar). Sin
  // él las horas no cuentan como verificadas y no se rebaja nada por ellas.
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Anote el nombre del supervisor.' })
  @MaxLength(120)
  supervisor?: string;
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

export class ViaticosDto {
  @IsUUID()
  empleadoId: string;

  // 0 quita los viáticos de ese empleado en la planilla.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  monto: number;

  // Para qué fue el viático y qué comprobante tiene; obligatorio cuando el monto es mayor que 0.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  justificante?: string;
}

export class CrearAnomaliaDto {
  @IsUUID()
  empleadoId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  @IsIn(['almuerzo_corto', 'almuerzo_largo', 'almuerzo_salida_temprana', 'almuerzo_regreso_tarde', 'tardanza', 'salida_temprana', 'ausencia', 'otro'])
  tipo: 'almuerzo_corto' | 'almuerzo_largo' | 'almuerzo_salida_temprana' | 'almuerzo_regreso_tarde' | 'tardanza' | 'salida_temprana' | 'ausencia' | 'otro';

  @IsString()
  @MinLength(3, { message: 'Describa lo ocurrido.' })
  @MaxLength(500)
  detalle: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  minutos?: number;
}

export class CambiarEstadoAnomaliaDto {
  @IsIn(['pendiente', 'carta_emitida', 'descartada'])
  estado: 'pendiente' | 'carta_emitida' | 'descartada';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nota?: string;
}
