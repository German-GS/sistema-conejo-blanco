import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Traspaso } from './traspaso.entity.js';
import { TraspasoLinea } from './traspaso-linea.entity.js';
import { TraspasosService } from './traspasos.service.js';
import { TraspasosController } from './traspasos.controller.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { UbicacionesModule } from '../ubicaciones/ubicaciones.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Traspaso, TraspasoLinea]), InventarioModule, UbicacionesModule],
  providers: [TraspasosService],
  controllers: [TraspasosController],
  exports: [TraspasosService],
})
export class TraspasosModule {}
