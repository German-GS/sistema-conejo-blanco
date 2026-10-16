import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

class LineaRecibidaDto {
  @IsUUID()
  lineaId: string;

  // Tope de 1 millón de pares — solo para atajar un error de tipeo.
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  cantidadRecibida: number;
}

export class RecibirTraspasoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaRecibidaDto)
  lineas: LineaRecibidaDto[];
}
