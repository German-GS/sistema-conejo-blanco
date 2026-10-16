import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GuardarPuestoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) nombre?: string;
  @IsOptional() @IsBoolean() esConfianza?: boolean;
  @IsOptional() @IsIn(['industria', 'comercio']) sector?: 'industria' | 'comercio';
  @IsOptional() @IsBoolean() activo?: boolean;
}
