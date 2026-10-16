import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TipoIdentificacion } from '../../common/enums/tipo-identificacion.enum.js';
import { Provincia } from '../../common/enums/provincia.enum.js';

export class ActualizarClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @IsEnum(TipoIdentificacion)
  tipoIdentificacion?: TipoIdentificacion;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'La cédula debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'El teléfono debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsEnum(Provincia)
  provincia?: Provincia;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;
}
