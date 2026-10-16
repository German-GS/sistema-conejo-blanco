import { IsDefined, IsString, MaxLength } from 'class-validator';

export class ActualizarAjusteDto {
  @IsString()
  @MaxLength(80)
  clave: string;

  // El tipo del valor lo valida SistemaConfigService según el ajuste.
  @IsDefined()
  valor: unknown;
}
