import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ConfiguracionSistema } from './configuracion-sistema.entity.js';
import { RegistroActividad } from './registro-actividad.entity.js';
import { SistemaConfigService } from './sistema-config.service.js';
import { ActividadService } from './actividad.service.js';
import { ExportacionService } from './exportacion.service.js';
import { MetricasService } from './metricas.service.js';
import { ConexionesService } from './conexiones.service.js';
import { SaludService } from './salud.service.js';
import { SistemaController } from './sistema.controller.js';
import { AnalisisController, AnalisisFeedController } from './analisis/analisis.controller.js';
import { AnalisisService } from './analisis/analisis.service.js';
import { SaludFinancieraService } from './analisis/salud-financiera.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionSistema, RegistroActividad]), ContabilidadModule],
  providers: [SistemaConfigService, MetricasService, ActividadService, ExportacionService, SaludService, AnalisisService, SaludFinancieraService, ConexionesService],
  controllers: [SistemaController, AnalisisController, AnalisisFeedController],
  exports: [SistemaConfigService, ActividadService],
})
export class SistemaModule {}
