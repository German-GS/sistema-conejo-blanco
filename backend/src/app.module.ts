import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { CatalogoModule } from './catalogo/catalogo.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { FacturacionModule } from './facturacion/facturacion.module.js';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module.js';
import { InventarioModule } from './inventario/inventario.module.js';
import { TraspasosModule } from './traspasos/traspasos.module.js';
import { ContabilidadModule } from './contabilidad/contabilidad.module.js';
import { ConfiguracionModule } from './configuracion/configuracion.module.js';
import { Bitacora } from './bitacora/bitacora.entity.js';
import { SistemaModule } from './sistema/sistema.module.js';
import { ConfiguracionSistema } from './sistema/configuracion-sistema.entity.js';
import { RegistroActividad } from './sistema/registro-actividad.entity.js';
import { BitacoraModule } from './bitacora/bitacora.module.js';
import { ActividadTiendaModule } from './actividad-tienda/actividad-tienda.module.js';
import { PosActividad } from './actividad-tienda/pos-actividad.entity.js';
import { Usuario } from './usuarios/usuario.entity.js';
import { UsuarioPermiso } from './usuarios/usuario-permiso.entity.js';
import { Cliente } from './clientes/cliente.entity.js';
import { Producto } from './catalogo/producto.entity.js';
import { VarianteProducto } from './catalogo/variante-producto.entity.js';
import { ProductoEdicion } from './catalogo/producto-edicion.entity.js';
import { ProductoFoto } from './catalogo/producto-foto.entity.js';
import { Pedido } from './pedidos/pedido.entity.js';
import { PedidoLinea } from './pedidos/pedido-linea.entity.js';
import { PedidoContador } from './pedidos/pedido-contador.entity.js';
import { PedidoEdicion } from './pedidos/pedido-edicion.entity.js';
import { Factura } from './facturacion/factura.entity.js';
import { FacturaLinea } from './facturacion/factura-linea.entity.js';
import { FacturaContador } from './facturacion/factura-contador.entity.js';
import { EmisorConfig } from './facturacion/emisor-config.entity.js';
import { NotaCredito } from './facturacion/nota-credito.entity.js';
import { Ubicacion } from './ubicaciones/ubicacion.entity.js';
import { StockUbicacion } from './inventario/stock-ubicacion.entity.js';
import { MovimientoInventario } from './inventario/movimiento-inventario.entity.js';
import { Traspaso } from './traspasos/traspaso.entity.js';
import { TraspasoLinea } from './traspasos/traspaso-linea.entity.js';
import { CuentaContable } from './contabilidad/cuenta-contable.entity.js';
import { AsientoContable } from './contabilidad/asiento-contable.entity.js';
import { LineaAsiento } from './contabilidad/linea-asiento.entity.js';
import { PeriodoCerrado } from './contabilidad/periodo-cerrado.entity.js';
import { CierreFiscal } from './contabilidad/cierre-fiscal.entity.js';
import { ParametroFiscal } from './contabilidad/parametro-fiscal.entity.js';
import { ConfiguracionDescuento } from './configuracion/configuracion-descuento.entity.js';
import { CuentaBancaria } from './pagos/cuenta-bancaria.entity.js';
import { PagoRecibido } from './pagos/pago-recibido.entity.js';
import { PagoAplicacion } from './pagos/pago-aplicacion.entity.js';
import { PagoContador } from './pagos/pago-contador.entity.js';
import { ConfiguracionFactura } from './configuracion/configuracion-factura.entity.js';
import { PagosModule } from './pagos/pagos.module.js';
import { PlanillaModule } from './planilla/planilla.module.js';
import { PosModule } from './pos/pos.module.js';
import { PendientesModule } from './pendientes/pendientes.module.js';
import { UsoModule } from './uso/uso.module.js';
import { UsoEvento } from './uso/uso-evento.entity.js';
import { PosVenta } from './pos/pos-venta.entity.js';
import { PosVentaLinea } from './pos/pos-venta-linea.entity.js';
import { PosPago } from './pos/pos-pago.entity.js';
import { PosCaja } from './pos/pos-caja.entity.js';
import { PosTiendaPerfil } from './pos/pos-tienda-perfil.entity.js';
import { PosConfiguracion } from './pos/pos-configuracion.entity.js';
import { OrdenTienda } from './pos/orden-tienda.entity.js';
import { OrdenTiendaLinea } from './pos/orden-tienda-linea.entity.js';
import { OrdenTiendaEvento } from './pos/orden-tienda-evento.entity.js';
import { ParametroPlanilla } from './planilla/parametro-planilla.entity.js';
import { Feriado } from './planilla/feriado.entity.js';
import { Empleado } from './planilla/empleado.entity.js';
import { ImportacionMarcas } from './planilla/importacion-marcas.entity.js';
import { DiaAsistencia } from './planilla/dia-asistencia.entity.js';
import { ResolucionDia } from './planilla/resolucion-dia.entity.js';
import { DeudaEmpleado } from './planilla/deuda-empleado.entity.js';
import { Planilla } from './planilla/planilla.entity.js';
import { HorarioBase } from './planilla/horario-base.entity.js';
import { PuestoPlanilla } from './planilla/puesto.entity.js';
import { ConfiguracionBancoPopular } from './planilla/configuracion-banco-popular.entity.js';
import { PlanillaLinea } from './planilla/planilla-linea.entity.js';
import { AnomaliaEmpleado } from './planilla/anomalia-empleado.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        entities: [
          Bitacora,
          ConfiguracionSistema,
          RegistroActividad,
          Usuario,
          UsuarioPermiso,
          Cliente,
          Producto,
          VarianteProducto,
          ProductoEdicion,
          ProductoFoto,
          Pedido,
          PedidoLinea,
          PedidoContador,
          PedidoEdicion,
          Factura,
          FacturaLinea,
          FacturaContador,
          EmisorConfig,
          NotaCredito,
          Ubicacion,
          StockUbicacion,
          MovimientoInventario,
          Traspaso,
          TraspasoLinea,
          CuentaContable,
          AsientoContable,
          LineaAsiento,
          PeriodoCerrado,
          CierreFiscal,
          ParametroFiscal,
          ConfiguracionDescuento,
          ConfiguracionFactura,
          CuentaBancaria,
          PagoRecibido,
          PagoAplicacion,
          PagoContador,
          ParametroPlanilla,
          Feriado,
          Empleado,
          ImportacionMarcas,
          DiaAsistencia,
          ResolucionDia,
          DeudaEmpleado,
          Planilla,
          PlanillaLinea,
          AnomaliaEmpleado,
          ConfiguracionBancoPopular,
          PuestoPlanilla,
          HorarioBase,
          PosVenta,
          PosVentaLinea,
          PosPago,
          PosCaja,
          PosTiendaPerfil,
          PosActividad,
          UsoEvento,
          PosConfiguracion,
          OrdenTienda,
          OrdenTiendaLinea,
          OrdenTiendaEvento,
        ],
        // Solo en desarrollo: sincroniza el esquema desde las entidades
        // sin migraciones manuales (mismo patrón que Conejo Aquatics).
        // Antes de producción esto se reemplaza por migraciones versionadas.
        synchronize: true,
      }),
    }),
    BitacoraModule,
    ActividadTiendaModule,
    SistemaModule,
    AuthModule,
    UsuariosModule,
    ClientesModule,
    CatalogoModule,
    PedidosModule,
    FacturacionModule,
    UbicacionesModule,
    InventarioModule,
    TraspasosModule,
    ContabilidadModule,
    ConfiguracionModule,
    PlanillaModule,
    PagosModule,
    PosModule,
    PendientesModule,
    UsoModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
