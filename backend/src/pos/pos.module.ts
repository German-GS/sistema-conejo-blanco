import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosVenta } from './pos-venta.entity.js';
import { PosVentaLinea } from './pos-venta-linea.entity.js';
import { PosPago } from './pos-pago.entity.js';
import { PosCaja } from './pos-caja.entity.js';
import { PosConfiguracion } from './pos-configuracion.entity.js';
import { OrdenTienda } from './orden-tienda.entity.js';
import { OrdenTiendaLinea } from './orden-tienda-linea.entity.js';
import { OrdenTiendaEvento } from './orden-tienda-evento.entity.js';
import { OrdenesTiendaService } from './ordenes-tienda.service.js';
import { PruebasPosService } from './pruebas-pos.service.js';
import { AjustesTiendaService } from './ajustes-tienda.service.js';
import { TraspasosModule } from '../traspasos/traspasos.module.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PosService } from './pos.service.js';
import { PosController } from './pos.controller.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([PosVenta, PosVentaLinea, PosPago, PosCaja, PosConfiguracion, OrdenTienda, OrdenTiendaLinea, OrdenTiendaEvento, Ubicacion, Usuario]), InventarioModule, ContabilidadModule, ConfiguracionModule, TraspasosModule],
  providers: [PosService, OrdenesTiendaService, PruebasPosService, AjustesTiendaService],
  controllers: [PosController],
  exports: [PosService],
})
export class PosModule {}
