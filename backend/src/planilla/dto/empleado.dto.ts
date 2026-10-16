import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FrecuenciaPago, TipoSalario } from '../planilla.enums.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MSJ_HORA = 'La hora debe tener formato HH:mm (ej. 08:00).';

export class CrearEmpleadoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  numeroReloj: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  puesto?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de ingreso debe ser YYYY-MM-DD.' })
  fechaIngreso?: string;

  @IsEnum(TipoSalario)
  tipoSalario: TipoSalario;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  montoSalario: number;

  @IsEnum(FrecuenciaPago)
  frecuenciaPago: FrecuenciaPago;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioEntrada?: string;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioSalida?: string;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioSalidaSabado?: string;

  @IsOptional()
  @IsBoolean()
  tieneConyuge?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidadHijos?: number;

  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  @IsOptional()
  @IsIn(['banco_popular', 'efectivo'])
  formaPago?: 'banco_popular' | 'efectivo';

  // Horas ordinarias por semana (vacío = las del sistema). Permitido 30–72.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(30)
  @Max(72)
  horasSemana?: number | null;

  @IsOptional()
  @IsBoolean()
  almuerzoMarca?: boolean;

  @IsOptional()
  @IsBoolean()
  marcaReloj?: boolean;

  @IsOptional()
  @IsBoolean()
  esDeTienda?: boolean;

  // Horario propio por día; null = usar el de la fábrica. Se valida en el servicio.
  @IsOptional()
  @IsObject()
  horarioSemanal?: Record<string, { entrada: string; salida: string } | null> | null;

  @IsOptional()
  @IsIn(['industria', 'comercio'])
  sector?: 'industria' | 'comercio';

  @IsOptional()
  @IsUUID()
  puestoId?: string;

  @IsOptional()
  @IsBoolean()
  esConfianza?: boolean;

  // Minutos de almuerzo que se descuentan si no marca (0–180).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  almuerzoMinutos?: number | null;

  @IsOptional()
  @Matches(/^\d{1,20}$/, { message: 'El identificador del Banco Popular son solo números.' })
  identificadorBp?: string;
}

export class ActualizarEmpleadoDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  numeroReloj?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  puesto?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de ingreso debe ser YYYY-MM-DD.' })
  fechaIngreso?: string;

  @IsOptional()
  @IsEnum(TipoSalario)
  tipoSalario?: TipoSalario;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  montoSalario?: number;

  @IsOptional()
  @IsEnum(FrecuenciaPago)
  frecuenciaPago?: FrecuenciaPago;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioEntrada?: string;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioSalida?: string;

  @IsOptional()
  @Matches(HORA, { message: MSJ_HORA })
  horarioSalidaSabado?: string;

  @IsOptional()
  @IsBoolean()
  tieneConyuge?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidadHijos?: number;

  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  @IsOptional()
  @IsIn(['banco_popular', 'efectivo'])
  formaPago?: 'banco_popular' | 'efectivo';

  // Horas ordinarias por semana (vacío = las del sistema). Permitido 30–72.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(30)
  @Max(72)
  horasSemana?: number | null;

  @IsOptional()
  @IsBoolean()
  almuerzoMarca?: boolean;

  @IsOptional()
  @IsBoolean()
  marcaReloj?: boolean;

  @IsOptional()
  @IsBoolean()
  esDeTienda?: boolean;

  // Horario propio por día; null = usar el de la fábrica. Se valida en el servicio.
  @IsOptional()
  @IsObject()
  horarioSemanal?: Record<string, { entrada: string; salida: string } | null> | null;

  @IsOptional()
  @IsIn(['industria', 'comercio'])
  sector?: 'industria' | 'comercio';

  @IsOptional()
  @IsUUID()
  puestoId?: string;

  @IsOptional()
  @IsBoolean()
  esConfianza?: boolean;

  // Minutos de almuerzo que se descuentan si no marca (0–180).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  almuerzoMinutos?: number | null;

  @IsOptional()
  @Matches(/^\d{1,20}$/, { message: 'El identificador del Banco Popular son solo números.' })
  identificadorBp?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CrearDeudaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  descripcion: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  monto: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  cuotaPorPlanilla: number;

  // Obligatorio: no se le descuenta a nadie sin constancia de que lo autorizó.
  @IsString()
  @MinLength(3, { message: 'Indicá dónde consta la autorización del empleado para el descuento.' })
  @MaxLength(255)
  autorizacionNota: string;

  // De dónde salió el dinero prestado (cuenta bancaria o caja). Sin indicar: caja general.
  @IsOptional()
  @IsUUID()
  cuentaBancariaId?: string;

  // Fecha en que se entregó el dinero (por defecto hoy).
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha?: string;
}

export class CesarEmpleadoDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de cese debe ser YYYY-MM-DD.' })
  fechaCese: string;

  @IsIn(['renuncia', 'despido_con_responsabilidad', 'despido_sin_responsabilidad', 'mutuo_acuerdo', 'fin_contrato'])
  tipoCese: 'renuncia' | 'despido_con_responsabilidad' | 'despido_sin_responsabilidad' | 'mutuo_acuerdo' | 'fin_contrato';

  @IsString()
  @MinLength(3, { message: 'Anotá el motivo del cese.' })
  @MaxLength(255)
  motivo: string;
}
