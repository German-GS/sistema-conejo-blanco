import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DiaManualDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  // trabajo = tiene entrada y salida; libre = día libre que se paga; ausencia = no vino (se descuenta).
  @IsIn(['trabajo', 'libre', 'ausencia'])
  tipo: 'trabajo' | 'libre' | 'ausencia';

  @IsOptional() @Matches(HORA, { message: 'La entrada debe ser HH:mm.' }) entrada?: string;
  @IsOptional() @Matches(HORA, { message: 'La salida debe ser HH:mm.' }) salida?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  almuerzoMinutos?: number;

  @IsOptional() @IsString() @MaxLength(200) motivo?: string;
}

// Horas que se meten a mano (personal de tienda, que no marca en el reloj de la fábrica).
export class RegistrarHorasManualesDto {
  @IsUUID() empleadoId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => DiaManualDto)
  dias: DiaManualDto[];
}

export class DiaMarcasManualesDto {
  @IsUUID() empleadoId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD.' })
  fecha: string;

  // Las horas anotadas (de 0 a 6), tal cual las marcó la persona; el sistema las ordena y las lee como las del reloj.
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(HORA, { each: true, message: 'Cada hora debe ser HH:mm.' })
  marcas: string[];

  // Sin ninguna marca: true = no vino (queda como ausencia por resolver); false/vacío = no se anotó nada ese día.
  @IsOptional() ausente?: boolean;
}

// Marcas anotadas a mano mientras el reloj de huella no funciona. Solo administrador del sistema y gerente general.
export class RegistrarMarcasManualesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => DiaMarcasManualesDto)
  dias: DiaMarcasManualesDto[];
}
