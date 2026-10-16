import { IsNumber, Max, Min } from 'class-validator';

export class ActualizarConfiguracionDescuentoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoMaximoVendedorPorcentaje: number;
}
