import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MEDIOS_POS } from '../pos-pago.entity.js';

export class PosLineaDto {
  @IsUUID()
  varianteId: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  precioUnitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento?: number;
}

export class PosPagoDto {
  @IsIn([...MEDIOS_POS])
  medio: string;

  // Lo aplicado a la venta (sin el vuelto).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recibido?: number;
}

export class PosVentaDto {
  // Lo genera la terminal: reenviar la misma venta nunca la duplica.
  @IsUUID()
  id: string;

  // Consecutivo que la terminal le dio al tiquete (aunque estuviera sin internet).
  @IsInt()
  @Min(1)
  numero: number;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsUUID()
  cajaId?: string;

  @IsOptional()
  @IsUUID()
  cajeroId?: string;

  @IsOptional()
  @IsBoolean()
  sinConexion?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PosLineaDto)
  lineas: PosLineaDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PosPagoDto)
  pagos: PosPagoDto[];
}

export class PosCajaDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsUUID()
  cajeroId?: string;

  @IsDateString()
  abiertaEn: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  fondoInicial: number;

  @IsOptional()
  @IsDateString()
  cerradaEn?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  efectivoContado?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

export class PosOrdenLineaDto {
  @IsUUID()
  varianteId: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  cantidad: number;

  @IsInt()
  @Min(-100000)
  @Max(1000000)
  stockTienda: number;

  @IsInt()
  @Min(0)
  @Max(1000000)
  minimo: number;

  @IsInt()
  @Min(0)
  @Max(1000000)
  sugerida: number;
}

export class PosOrdenDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(1)
  numero: number;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsBoolean()
  urgente?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;

  @IsOptional()
  @IsBoolean()
  sinConexion?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => PosOrdenLineaDto)
  lineas: PosOrdenLineaDto[];
}

export class SincronizarPosDto {
  @IsUUID()
  ubicacionId: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PosVentaDto)
  ventas: PosVentaDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PosCajaDto)
  cajas: PosCajaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PosOrdenDto)
  ordenes?: PosOrdenDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PosRecepcionDto)
  recepciones?: PosRecepcionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PosAjusteDto)
  ajustes?: PosAjusteDto[];
}

export class NotaOrdenDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}

export class RevisionLineaDto {
  @IsUUID()
  varianteId: string;

  // Pares que se van a enviar (lo que hay en bodega; puede ser menos de lo pedido).
  @IsInt()
  @Min(0)
  @Max(100000)
  cantidad: number;

  // Costo especial por par con que se traslada a la tienda. Obligatorio para lo que se envía.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999.99)
  costoTienda?: number;
}

export class RevisarOrdenDto {
  @IsIn(['aceptada', 'corregida'])
  resolucion: string;

  // La anotación de la revisión (obligatoria si se corrige).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;

  @IsUUID()
  origenId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => RevisionLineaDto)
  lineas: RevisionLineaDto[];
}

export class RecepcionLineaDto {
  @IsUUID()
  varianteId: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  cantidadRecibida: number;
}

// La tienda verifica lo que llegó contra lo que dice la orden.
export class RecibirTiendaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => RecepcionLineaDto)
  lineas: RecepcionLineaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}

// Mercadería aceptada en la tienda mientras no había internet; se envía al reconectarse.
export class PosRecepcionDto extends RecibirTiendaDto {
  @IsUUID()
  ordenId: string;
}

export class AjusteLineaDto {
  @IsUUID()
  varianteId: string;

  // Solo aumentos: pares que se suman a la existencia de la tienda (nunca se puede bajar desde la tienda).
  @IsInt()
  @Min(1)
  @Max(100000)
  cantidad: number;
}

// Conteo de inventario hecho en la tienda (puede venir de cuando no había internet). Solo suma.
export class PosAjusteDto {
  @IsUUID()
  id: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  nota: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AjusteLineaDto)
  lineas: AjusteLineaDto[];
}

export class EstadoOrdenDto {
  @IsIn(['rechazada', 'cancelada'])
  estado: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  respuesta?: string;
}

export class AnularPosVentaDto {
  @IsString()
  @MaxLength(200)
  motivo: string;
}

export class ActualizarPosConfigDto {
  @IsOptional()
  @IsUUID()
  cuentaTarjetaId?: string | null;

  @IsOptional()
  @IsUUID()
  cuentaSinpeId?: string | null;

  @IsOptional()
  @IsUUID()
  cuentaTransferenciaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pieTiquete?: string;

  @IsOptional()
  @IsBoolean()
  modoPrueba?: boolean;
}
