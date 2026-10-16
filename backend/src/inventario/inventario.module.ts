import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockUbicacion } from './stock-ubicacion.entity.js';
import { MovimientoInventario } from './movimiento-inventario.entity.js';
import { InventarioService } from './inventario.service.js';
import { InventarioController } from './inventario.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([StockUbicacion, MovimientoInventario])],
  providers: [InventarioService],
  controllers: [InventarioController],
  exports: [InventarioService],
})
export class InventarioModule {}
