import { generarPasswordTemporal } from '../common/utils/password.util.js';
import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../usuarios/usuario.entity.js';
import { UsuarioPermiso } from '../usuarios/usuario-permiso.entity.js';
import { Cliente } from '../clientes/cliente.entity.js';
import { Producto } from '../catalogo/producto.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { ProductoEdicion } from '../catalogo/producto-edicion.entity.js';
import { ProductoFoto } from '../catalogo/producto-foto.entity.js';
import { Pedido } from '../pedidos/pedido.entity.js';
import { PedidoLinea } from '../pedidos/pedido-linea.entity.js';
import { PedidoContador } from '../pedidos/pedido-contador.entity.js';
import { PedidoEdicion } from '../pedidos/pedido-edicion.entity.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { StockUbicacion } from '../inventario/stock-ubicacion.entity.js';
import { MovimientoInventario } from '../inventario/movimiento-inventario.entity.js';
import { Traspaso } from '../traspasos/traspaso.entity.js';
import { TraspasoLinea } from '../traspasos/traspaso-linea.entity.js';
import { Factura } from '../facturacion/factura.entity.js';
import { FacturaLinea } from '../facturacion/factura-linea.entity.js';
import { FacturaContador } from '../facturacion/factura-contador.entity.js';
import { EmisorConfig } from '../facturacion/emisor-config.entity.js';
import { NotaCredito } from '../facturacion/nota-credito.entity.js';
import { CuentaContable } from '../contabilidad/cuenta-contable.entity.js';
import { AsientoContable } from '../contabilidad/asiento-contable.entity.js';
import { LineaAsiento } from '../contabilidad/linea-asiento.entity.js';
import { ConfiguracionDescuento } from '../configuracion/configuracion-descuento.entity.js';
import { CuentaBancaria } from '../pagos/cuenta-bancaria.entity.js';
import { PagoRecibido } from '../pagos/pago-recibido.entity.js';
import { PagoAplicacion } from '../pagos/pago-aplicacion.entity.js';
import { PagoContador } from '../pagos/pago-contador.entity.js';
import { ConfiguracionFactura } from '../configuracion/configuracion-factura.entity.js';
import { ParametroPlanilla } from '../planilla/parametro-planilla.entity.js';
import { Feriado } from '../planilla/feriado.entity.js';
import { Empleado } from '../planilla/empleado.entity.js';
import { ImportacionMarcas } from '../planilla/importacion-marcas.entity.js';
import { DiaAsistencia } from '../planilla/dia-asistencia.entity.js';
import { ResolucionDia } from '../planilla/resolucion-dia.entity.js';
import { DeudaEmpleado } from '../planilla/deuda-empleado.entity.js';
import { Planilla } from '../planilla/planilla.entity.js';
import { HorarioBase } from '../planilla/horario-base.entity.js';
import { PuestoPlanilla } from '../planilla/puesto.entity.js';
import { ConfiguracionBancoPopular } from '../planilla/configuracion-banco-popular.entity.js';
import { PlanillaLinea } from '../planilla/planilla-linea.entity.js';
import { AnomaliaEmpleado } from '../planilla/anomalia-empleado.entity.js';
import { AccesoMarca } from '../planilla/acceso-marca.entity.js';
import { DeduccionExterna } from '../planilla/deduccion-externa.entity.js';
import { PuntoMarca } from '../planilla/punto-marca.entity.js';
import { MarcaApp } from '../planilla/marca-app.entity.js';
import { Rol } from '../common/enums/rol.enum.js';
import { TipoIdentificacion } from '../common/enums/tipo-identificacion.enum.js';
import { TipoUbicacion } from '../common/enums/tipo-ubicacion.enum.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';

const SALT_ROUNDS = 12;

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // Misma lista que app.module.ts — este DataSource es independiente
    // del de la app (corre aparte, contra producción vía IP pública
    // autorizada temporalmente), así que necesita TODAS las entidades
    // para que TypeORM resuelva relaciones (ej. Usuario.permisos
    // necesita que UsuarioPermiso también esté acá, o falla al construir
    // los metadatos aunque el seed nunca toque esa tabla).
    entities: [
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
      AccesoMarca,
      DeduccionExterna,
      PuntoMarca,
      MarcaApp,
      ConfiguracionBancoPopular,
      PuestoPlanilla,
      HorarioBase,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  const usuarioRepo = dataSource.getRepository(Usuario);
  const clienteRepo = dataSource.getRepository(Cliente);
  const productoRepo = dataSource.getRepository(Producto);
  const varianteRepo = dataSource.getRepository(VarianteProducto);

  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('Definí ADMIN_SEED_EMAIL y ADMIN_SEED_PASSWORD en backend/.env antes de sembrar.');
  }

  const existente = await usuarioRepo.findOne({ where: { email } });
  if (!existente) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = usuarioRepo.create({
      nombre: 'Administración',
      email,
      passwordHash,
      // Cuenta del administrador del sistema (la única que controla accesos y ve el panel Sistema).
      rol: Rol.SISTEMA,
    });
    await usuarioRepo.save(admin);
    console.log(`Usuario administrador creado: ${email}`);
  } else {
    console.log(`Ya existe un usuario administrador con ${email}, no se creó otro.`);
  }

  // Datos de demostración para desarrollo local: la clave se genera al azar y se muestra una sola vez.
  const vendedorEmail = 'vendedor@ejemplo.cr';
  const existeVendedor = await usuarioRepo.findOne({ where: { email: vendedorEmail } });
  if (!existeVendedor) {
    const claveDemo = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(claveDemo, SALT_ROUNDS);
    const vendedor = usuarioRepo.create({
      nombre: 'Vendedor de prueba',
      email: vendedorEmail,
      passwordHash,
      rol: Rol.VENDEDOR,
      debeCambiarClave: true,
    });
    await usuarioRepo.save(vendedor);
    console.log(`Usuario vendedor de prueba creado: ${vendedorEmail} / ${claveDemo}`);
  }

  const clienteDemo = await clienteRepo.findOne({ where: { nombre: 'Comercial La Esperanza' } });
  if (!clienteDemo) {
    const cliente = clienteRepo.create({
      nombre: 'Comercial La Esperanza',
      tipoIdentificacion: TipoIdentificacion.JURIDICA,
      cedula: '3-101-123456',
      telefono: '8888-1234',
      email: 'contacto@comerciallaesperanza.cr',
      direccion: 'San José, Costa Rica',
    });
    await clienteRepo.save(cliente);
    console.log('Cliente de prueba creado: Comercial La Esperanza');
  }

  let productoDemo = await productoRepo.findOne({ where: { codigo: 'KW 034' }, relations: { variantes: true } });
  if (!productoDemo) {
    const producto = productoRepo.create({
      codigo: 'KW 034',
      nombre: 'Media deportiva KW 034',
    });
    const productoGuardado = await productoRepo.save(producto);

    const colores = [
      { color: 'Rojo', precioPorPar: '1500.00' },
      { color: 'Negro', precioPorPar: '1500.00' },
      { color: 'Azul', precioPorPar: '1500.00' },
    ];
    for (const c of colores) {
      const variante = varianteRepo.create({ productoId: productoGuardado.id, ...c });
      await varianteRepo.save(variante);
    }
    console.log('Producto de prueba creado: KW034 (Rojo, Negro, Azul)');
    productoDemo = await productoRepo.findOne({ where: { codigo: 'KW 034' }, relations: { variantes: true } });
  }

  // Ubicaciones base — con 2-5 tiendas fijas alcanza una tabla plana (ver
  // Ubicacion). Fábrica y Bodega Distribución no venden directamente
  // todavía (permiteVenta=false); la Tienda sí.
  const ubicacionRepo = dataSource.getRepository(Ubicacion);
  const ubicacionesSeed = [
    { tipo: TipoUbicacion.FABRICA, nombre: 'Fábrica San José', codigo: 'FAB', permiteVenta: false },
    { tipo: TipoUbicacion.BODEGA_DISTRIBUCION, nombre: 'Bodega de Distribución', codigo: 'BD', permiteVenta: true },
    { tipo: TipoUbicacion.TIENDA, nombre: 'Tienda Principal', codigo: 'T01', permiteVenta: true },
  ];
  const ubicacionesGuardadas: Ubicacion[] = [];
  for (const u of ubicacionesSeed) {
    let ubicacion = await ubicacionRepo.findOne({ where: { codigo: u.codigo } });
    if (!ubicacion) {
      ubicacion = await ubicacionRepo.save(ubicacionRepo.create(u));
      console.log(`Ubicación creada: ${u.nombre} (${u.codigo})`);
    }
    ubicacionesGuardadas.push(ubicacion);
  }

  // Stock inicial de KW034 en Bodega de Distribución (si todavía no
  // tiene), para poder probar pedidos/facturación/traspasos sin tener
  // que cargar inventario a mano primero.
  if (productoDemo) {
    const bodega = ubicacionesGuardadas.find((u) => u.codigo === 'BD')!;
    const stockRepo = dataSource.getRepository(StockUbicacion);
    const movimientoRepo = dataSource.getRepository(MovimientoInventario);
    const admin = await usuarioRepo.findOneBy({ email });
    let algunoNuevo = false;
    for (const variante of productoDemo.variantes) {
      const existeStock = await stockRepo.findOneBy({ ubicacionId: bodega.id, varianteId: variante.id });
      if (existeStock) continue;
      algunoNuevo = true;
      await stockRepo.save(stockRepo.create({ ubicacionId: bodega.id, varianteId: variante.id, cantidad: 240 }));
      await movimientoRepo.save(
        movimientoRepo.create({
          ubicacionId: bodega.id,
          varianteId: variante.id,
          tipo: TipoMovimientoInventario.INGRESO_INICIAL,
          cantidad: 240,
          creadoPorId: admin!.id,
        }),
      );
    }
    if (algunoNuevo) {
      console.log('Stock inicial cargado en Bodega de Distribución (240 pares por color de KW034).');
    }
  }

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Error al sembrar la base de datos:', err);
  process.exit(1);
});
