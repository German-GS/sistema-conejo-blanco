import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class MinimoVarianteDto {
  @IsUUID()
  varianteId: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  minimo: number;
}

// Define el stock mínimo de varias variantes en una ubicación (0 = sin alerta).
export class MinimosInventarioDto {
  @IsUUID()
  ubicacionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MinimoVarianteDto)
  minimos: MinimoVarianteDto[];
}
