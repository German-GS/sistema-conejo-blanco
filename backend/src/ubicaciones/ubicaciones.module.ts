import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ubicacion } from './ubicacion.entity.js';
import { UbicacionesService } from './ubicaciones.service.js';
import { UbicacionesController } from './ubicaciones.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Ubicacion])],
  providers: [UbicacionesService],
  controllers: [UbicacionesController],
  exports: [UbicacionesService],
})
export class UbicacionesModule {}
