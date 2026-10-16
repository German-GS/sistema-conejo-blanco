import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';

export class ActualizarVarianteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  precioPorPar?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  costo?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
