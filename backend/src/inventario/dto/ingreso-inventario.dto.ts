import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

// Carga manual de stock existente en una ubicación — Conejo Blanco
// todavía no fabrica dentro del sistema, así que así es como entra el
// producto terminado por ahora (llega de producción externa).
export class IngresoInventarioDto {
  @IsUUID()
  ubicacionId: string;

  @IsUUID()
  varianteId: string;

  // Tope de 1 millón de pares — solo para atajar un error de tipeo, no
  // un límite de negocio real.
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  cantidad: number;
}
