import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Factura } from './factura.entity.js';
import { FacturaLinea } from './factura-linea.entity.js';
import { FacturaManualService } from './factura-manual.service.js';
import { FacturaContador } from './factura-contador.entity.js';
import { NotaCredito } from './nota-credito.entity.js';
import { NumeracionService } from './numeracion.service.js';
import { FacturacionService } from './facturacion.service.js';
import { FacturacionController } from './facturacion.controller.js';
import { FacturasController } from './facturas.controller.js';
import { NotasCreditoController } from './notas-credito.controller.js';
import { HACIENDA_CLIENT } from './hacienda-client.interface.js';
import { NoOpHaciendaClient } from './noop-hacienda.client.js';
import { HaciendaClientReal } from './hacienda-client.real.js';
import { EmisionService, modoHacienda } from './emision.service.js';
import { EmisionCron } from './emision.cron.js';
import { EmisionController } from './emision.controller.js';
import { EmisorConfig } from './emisor-config.entity.js';
import { EmisorConfigService } from './emisor-config.service.js';
import { SecretosService } from './secretos.service.js';
import { CorreoService } from './correo.service.js';
import { ConfigService } from '@nestjs/config';
import { PedidosModule } from '../pedidos/pedidos.module.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { UbicacionesModule } from '../ubicaciones/ubicaciones.module.js';
import { PagosModule } from '../pagos/pagos.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factura, FacturaLinea, FacturaContador, NotaCredito, EmisorConfig]),
    PedidosModule,
    InventarioModule,
    ContabilidadModule,
    CatalogoModule,
    ClientesModule,
    UbicacionesModule,
    ConfiguracionModule,
    PagosModule,
  ],
  providers: [
    NumeracionService,
    FacturacionService,
    FacturaManualService,
    EmisionService,
    EmisionCron,
    EmisorConfigService,
    SecretosService,
    CorreoService,
    // Quién habla con Hacienda lo decide HACIENDA_MODO: «noop» (hoy: sin llaves,
    // no envía nada), «pruebas» (ambiente de pruebas de Hacienda) o «produccion».
    // Ver hacienda-client.interface.ts y docs/FACTURACION_ELECTRONICA.md.
    {
      provide: HACIENDA_CLIENT,
      inject: [ConfigService, SecretosService, EmisorConfigService],
      useFactory: (config: ConfigService, secretos: SecretosService, emisor: EmisorConfigService) => {
        const modo = modoHacienda(config);
        return modo === 'noop' ? new NoOpHaciendaClient() : new HaciendaClientReal(modo, secretos, emisor);
      },
    },
  ],
  controllers: [FacturacionController, FacturasController, NotasCreditoController, EmisionController],
  exports: [FacturacionService, EmisionService],
})
export class FacturacionModule {}
