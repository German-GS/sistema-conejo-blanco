import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagosModule } from '../pagos/pagos.module.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ParametroPlanilla } from './parametro-planilla.entity.js';
import { Feriado } from './feriado.entity.js';
import { Empleado } from './empleado.entity.js';
import { ImportacionMarcas } from './importacion-marcas.entity.js';
import { DiaAsistencia } from './dia-asistencia.entity.js';
import { ResolucionDia } from './resolucion-dia.entity.js';
import { DeudaEmpleado } from './deuda-empleado.entity.js';
import { Planilla } from './planilla.entity.js';
import { PlanillaLinea } from './planilla-linea.entity.js';
import { ParametrosService } from './parametros.service.js';
import { EmpleadosService } from './empleados.service.js';
import { AsistenciaService } from './asistencia.service.js';
import { PlanillasService } from './planillas.service.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { ConfiguracionBancoPopular } from './configuracion-banco-popular.entity.js';
import { BancoPopularService } from './banco-popular.service.js';
import { PuestoPlanilla } from './puesto.entity.js';
import { HorarioBase } from './horario-base.entity.js';
import { PuestosService } from './puestos.service.js';
import { PlanillaController } from './planilla.controller.js';
import { ColillaService } from './colilla.service.js';
import { InformesService } from './informes.service.js';
import { InformesController } from './informes.controller.js';
import { AnomaliaEmpleado } from './anomalia-empleado.entity.js';
import { AnomaliasService } from './anomalias.service.js';

@Module({
  imports: [
    ContabilidadModule,
    PagosModule,
    ConfiguracionModule,
    TypeOrmModule.forFeature([
      ParametroPlanilla,
      Feriado,
      Empleado,
      ImportacionMarcas,
      DiaAsistencia,
      ResolucionDia,
      DeudaEmpleado,
      Planilla,
      PlanillaLinea,
      ConfiguracionBancoPopular,
      PuestoPlanilla,
      HorarioBase,
      AnomaliaEmpleado,
    ]),
  ],
  providers: [ParametrosService, EmpleadosService, AsistenciaService, PlanillasService, InformesService, BancoPopularService, PuestosService, ColillaService, AnomaliasService],
  controllers: [PlanillaController, InformesController],
})
export class PlanillaModule {}
