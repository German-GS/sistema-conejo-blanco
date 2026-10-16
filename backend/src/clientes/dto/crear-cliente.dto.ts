import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TipoIdentificacion } from '../../common/enums/tipo-identificacion.enum.js';
import { Provincia } from '../../common/enums/provincia.enum.js';

// Los MaxLength de acá abajo coinciden con el largo de columna en
// Cliente (clientes/cliente.entity.ts) — sin esto, un texto más largo
// de lo que la columna admite no falla acá con un 400 claro, sino
// abajo en Postgres con un 500 feo ("value too long for type character
// varying").
export class CrearClienteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre: string;

  @IsEnum(TipoIdentificacion)
  tipoIdentificacion: TipoIdentificacion;

  @IsString()
  @MinLength(4, { message: 'La cédula debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  cedula: string;

  @IsString()
  @MinLength(4, { message: 'El teléfono debe tener al menos 4 caracteres.' })
  @MaxLength(40)
  telefono: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsEnum(Provincia)
  provincia?: Provincia;

  // Descuento por defecto asignado por administración — solo se puede
  // fijar/cambiar desde el panel (ver ClientesController).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;
}
