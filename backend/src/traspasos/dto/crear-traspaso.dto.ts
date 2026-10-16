import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  Max,
  ValidateNested,
} from 'class-validator';

class LineaTraspasoDto {
  @IsUUID()
  varianteId: string;

  // Tope de 1 millón de pares — solo para atajar un error de tipeo.
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  cantidadEnviada: number;
}

export class CrearTraspasoDto {
  @IsUUID()
  origenId: string;

  @IsUUID()
  destinoId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El traspaso necesita al menos un producto.' })
  @ArrayMaxSize(200, { message: 'El traspaso no puede tener más de 200 líneas.' })
  @ValidateNested({ each: true })
  @Type(() => LineaTraspasoDto)
  lineas: LineaTraspasoDto[];
}
