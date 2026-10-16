import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaContable } from './cuenta-contable.entity.js';
import { AsientoContable } from './asiento-contable.entity.js';
import { PeriodoCerrado } from './periodo-cerrado.entity.js';
import { CierreFiscal } from './cierre-fiscal.entity.js';
import { ParametroFiscal } from './parametro-fiscal.entity.js';
import { CierreFiscalService } from './cierre-fiscal.service.js';
import { LineaAsiento } from './linea-asiento.entity.js';
import { ContabilidadService } from './contabilidad.service.js';
import { ContabilidadController } from './contabilidad.controller.js';
import { ReportesContablesService } from './reportes-contables.service.js';
import { LibroMayorService } from './libro-mayor.service.js';
import { CierreMensualService } from './cierre-mensual.service.js';
import { IntegridadService } from './integridad.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaContable, AsientoContable, LineaAsiento, PeriodoCerrado, CierreFiscal, ParametroFiscal])],
  providers: [ContabilidadService, ReportesContablesService, IntegridadService, LibroMayorService, CierreMensualService, CierreFiscalService],
  controllers: [ContabilidadController],
  exports: [ContabilidadService, IntegridadService],
})
export class ContabilidadModule {}
