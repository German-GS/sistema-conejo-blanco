import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosActividad } from './pos-actividad.entity.js';
import { ActividadTiendaService } from './actividad-tienda.service.js';
import { ActividadTiendaController } from './actividad-tienda.controller.js';

// Global (como la bitácora) para que el catálogo, el inventario y el POS puedan anotar cambios sin depender unos de otros.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PosActividad])],
  providers: [ActividadTiendaService],
  controllers: [ActividadTiendaController],
  exports: [ActividadTiendaService],
})
export class ActividadTiendaModule {}
