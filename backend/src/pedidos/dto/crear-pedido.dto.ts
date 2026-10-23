import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TipoPago } from '../../common/enums/tipo-pago.enum.js';
import { MetodoEntrega } from '../../common/enums/metodo-entrega.enum.js';
import { DIAS_CREDITO_MINIMO } from '../../common/constants/negocio.constant.js';
import { CrearPedidoLineaDto } from './crear-pedido-linea.dto.js';
import { ClienteNuevoPedidoDto } from './cliente-nuevo-pedido.dto.js';

export class CrearPedidoDto {
  // Exactamente uno de los dos: clienteId (ya existe en la base) o
  // clienteNuevo (el vendedor lo tecleó a mano porque no lo encontró).
  // PedidosService.crear valida que venga uno u otro, no ambos ni ninguno.
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteNuevoPedidoDto)
  clienteNuevo?: ClienteNuevoPedidoDto;

  // Opcional: si no se manda, el servicio usa la fecha de hoy.
  @IsOptional()
  @IsDateString()
  fecha?: string;

  // Opcional: el vendedor no elige ubicación (siempre sale de la bodega
  // de distribución central — ver PedidosService.crear). Se deja acá por
  // si algún día hace falta que administración lo pueda forzar a otra.
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @IsEnum(TipoPago)
  tipoPago: TipoPago;

  // Obligatorio y >= 30 solo cuando el pedido es a crédito. Max de 10
  // años: no hay plazo de crédito real que llegue ahí, es solo para
  // atajar un error de tipeo.
  @ValidateIf((dto: CrearPedidoDto) => dto.tipoPago === TipoPago.CREDITO)
  @IsInt()
  @Min(DIAS_CREDITO_MINIMO, {
    message: `El crédito mínimo autorizado es de ${DIAS_CREDITO_MINIMO} días.`,
  })
  @Max(3650)
  diasCredito?: number;

  // Vía de distribución: por encomienda o entrega propia.
  @IsEnum(MetodoEntrega)
  metodoEntrega: MetodoEntrega;

  // Obligatoria solo cuando el método es Encomienda.
  @ValidateIf((dto: CrearPedidoDto) => dto.metodoEntrega === MetodoEntrega.ENCOMIENDA)
  @IsString()
  @MinLength(2, { message: 'Indique el nombre de la empresa de encomienda.' })
  @MaxLength(120)
  empresaEncomienda?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido necesita al menos un producto.' })
  @ArrayMaxSize(200, { message: 'El pedido no puede tener más de 200 líneas.' })
  @ValidateNested({ each: true })
  @Type(() => CrearPedidoLineaDto)
  lineas: CrearPedidoLineaDto[];
}
