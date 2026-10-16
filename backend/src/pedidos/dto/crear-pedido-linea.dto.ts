import { IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator';

export class CrearPedidoLineaDto {
  @IsUUID()
  varianteId: string;

  // En docenas, permite fracciones (ej. 0.5 docena = 6 pares). Tope de
  // 10 000 docenas (120 000 pares) por línea — ningún pedido real llega
  // ahí, es solo para atajar un error de tipeo (ej. un 0 de más) antes
  // de que se convierta en una línea absurda.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000)
  docenas: number;

  // Opcional, default 0. El tope real (según cliente/configuración
  // general) y el piso de costo de producción los valida PedidosService,
  // no este DTO — acá solo se valida que sea un porcentaje con forma.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;

  // Solo tiene efecto al EDITAR un pedido ya guardado (PedidosService.editarLineas)
  // — crear() siempre usa el precio de lista vigente de la variante. Permite
  // corregir el precio pactado en una línea existente (ej. se negoció aparte con
  // el cliente); si no se manda, el precio congelado original se mantiene. Sigue
  // sujeto al piso de costo de producción igual que el descuento.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  precioPorPar?: number;
}
