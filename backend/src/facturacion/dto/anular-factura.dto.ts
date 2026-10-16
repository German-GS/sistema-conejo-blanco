import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularFacturaDto {
  // Obligatorio: la nota de crédito necesita un motivo, y es lo único
  // que documenta por qué se anuló una factura ya emitida.
  @IsString()
  @MinLength(3, { message: 'Indicá el motivo de la anulación.' })
  @MaxLength(255)
  motivo: string;
}
