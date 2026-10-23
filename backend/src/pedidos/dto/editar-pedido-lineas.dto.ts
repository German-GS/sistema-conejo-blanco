import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CrearPedidoLineaDto } from './crear-pedido-linea.dto.js';
import { MetodoEntrega } from '../../common/enums/metodo-entrega.enum.js';

export class EditarPedidoLineasDto {
  // Reemplaza TODAS las líneas del pedido — la que no venga acá se
  // considera eliminada (ver PedidosService.editarLineas).
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido necesita al menos un producto.' })
  @ArrayMaxSize(200, { message: 'El pedido no puede tener más de 200 líneas.' })
  @ValidateNested({ each: true })
  @Type(() => CrearPedidoLineaDto)
  lineas: CrearPedidoLineaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;

  // Opcional: se manda solo cuando también se corrige la vía de entrega
  // junto con las líneas.
  @IsOptional()
  @IsEnum(MetodoEntrega)
  metodoEntrega?: MetodoEntrega;

  @ValidateIf((dto: EditarPedidoLineasDto) => dto.metodoEntrega === MetodoEntrega.ENCOMIENDA)
  @IsString()
  @MinLength(2, { message: 'Indique el nombre de la empresa de encomienda.' })
  @MaxLength(120)
  empresaEncomienda?: string;
}
