import { IsIn, IsInt, Max, Min, NotEquals, IsUUID } from 'class-validator';

export class AjusteInventarioDto {
  @IsUUID()
  ubicacionId: string;

  @IsUUID()
  varianteId: string;

  // Con signo: positivo si el conteo físico encontró más de lo que el
  // sistema tenía, negativo si encontró menos (o si es una merma).
  // NotEquals(0): un ajuste de cero pares no hace nada, sería ruido en
  // el kardex — IsNotEmpty no lo atajaba porque 0 no cuenta como "vacío".
  @IsInt()
  @NotEquals(0, { message: 'El ajuste no puede ser de 0 pares.' })
  @Min(-1_000_000)
  @Max(1_000_000)
  cantidad: number;

  @IsIn(['ajuste_conteo', 'ajuste_merma'])
  tipo: 'ajuste_conteo' | 'ajuste_merma';
}
