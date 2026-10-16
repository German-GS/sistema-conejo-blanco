import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ConfiguracionSistema } from './configuracion-sistema.entity.js';
import { RegistroActividad } from './registro-actividad.entity.js';
import { SistemaConfigService } from './sistema-config.service.js';
import { ActividadService } from './actividad.service.js';
import { ExportacionService } from './exportacion.service.js';
import { MetricasService } from './metricas.service.js';
import { SaludService } from './salud.service.js';
import { SistemaController } from './sistema.controller.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionSistema, RegistroActividad]), ContabilidadModule],
  providers: [SistemaConfigService, MetricasService, ActividadService, ExportacionService, SaludService],
  controllers: [SistemaController],
  exports: [SistemaConfigService, ActividadService],
})
export class SistemaModule {}
