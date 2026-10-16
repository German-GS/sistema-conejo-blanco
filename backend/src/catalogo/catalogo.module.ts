import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Producto } from './producto.entity.js';
import { VarianteProducto } from './variante-producto.entity.js';
import { ProductoEdicion } from './producto-edicion.entity.js';
import { ProductoFoto } from './producto-foto.entity.js';
import { CatalogoService } from './catalogo.service.js';
import { CatalogoController } from './catalogo.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Producto, VarianteProducto, ProductoEdicion, ProductoFoto])],
  providers: [CatalogoService],
  controllers: [CatalogoController],
  exports: [CatalogoService],
})
export class CatalogoModule {}
