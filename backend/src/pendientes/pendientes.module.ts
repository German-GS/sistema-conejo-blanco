import { Module } from '@nestjs/common';
import { FacturacionModule } from '../facturacion/facturacion.module.js';
import { PendientesController } from './pendientes.controller.js';
import { PendientesService } from './pendientes.service.js';

@Module({
  imports: [FacturacionModule],
  providers: [PendientesService],
  controllers: [PendientesController],
})
export class PendientesModule {}
