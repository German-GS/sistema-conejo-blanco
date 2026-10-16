import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionDescuento } from './configuracion-descuento.entity.js';
import { ConfiguracionFactura } from './configuracion-factura.entity.js';
import { ConfiguracionService } from './configuracion.service.js';
import { ConfiguracionController } from './configuracion.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionDescuento, ConfiguracionFactura])],
  providers: [ConfiguracionService],
  controllers: [ConfiguracionController],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
