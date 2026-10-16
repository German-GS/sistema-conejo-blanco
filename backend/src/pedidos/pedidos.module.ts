import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from './pedido.entity.js';
import { PedidoLinea } from './pedido-linea.entity.js';
import { PedidoContador } from './pedido-contador.entity.js';
import { PedidoEdicion } from './pedido-edicion.entity.js';
import { PedidosService } from './pedidos.service.js';
import { PedidosController } from './pedidos.controller.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { UbicacionesModule } from '../ubicaciones/ubicaciones.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { InventarioModule } from '../inventario/inventario.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pedido, PedidoLinea, PedidoContador, PedidoEdicion]),
    ClientesModule,
    CatalogoModule,
    UbicacionesModule,
    ConfiguracionModule,
    InventarioModule,
  ],
  providers: [PedidosService],
  controllers: [PedidosController],
  exports: [PedidosService],
})
export class PedidosModule {}
