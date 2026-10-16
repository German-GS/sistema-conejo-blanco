import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaBancaria } from './cuenta-bancaria.entity.js';
import { PagoRecibido } from './pago-recibido.entity.js';
import { PagoAplicacion } from './pago-aplicacion.entity.js';
import { PagoContador } from './pago-contador.entity.js';
import { Factura } from '../facturacion/factura.entity.js';
import { CuentasBancariasService } from './cuentas-bancarias.service.js';
import { PagosService } from './pagos.service.js';
import { PagosController, CuentasBancariasController } from './pagos.controller.js';
import { ContabilidadModule } from '../contabilidad/contabilidad.module.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CuentaBancaria, PagoRecibido, PagoAplicacion, PagoContador, Factura]),
    ContabilidadModule,
    ClientesModule,
    ConfiguracionModule,
  ],
  providers: [CuentasBancariasService, PagosService],
  controllers: [PagosController, CuentasBancariasController],
  exports: [CuentasBancariasService],
})
export class PagosModule {}
