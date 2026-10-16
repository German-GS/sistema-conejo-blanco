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
    TypeOrmModule.forFeature([Factura, FacturaLinea, FacturaContador, NotaCredito]),
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
    // Único lugar a tocar para conectar Hacienda de verdad: cambiar esta
    // línea de NoOpHaciendaClient a la implementación real. Ver
    // hacienda-client.interface.ts.
    { provide: HACIENDA_CLIENT, useClass: NoOpHaciendaClient },
  ],
  controllers: [FacturacionController, FacturasController, NotasCreditoController],
  exports: [FacturacionService],
})
export class FacturacionModule {}
