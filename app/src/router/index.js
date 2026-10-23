import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { avisarErrorDeRed, empezarEspera } from '../lib/red.js';

// Las pantallas se cargan cuando se necesitan (así el vendedor no descarga contabilidad ni planilla). Quedan incluidas desde el inicio
// la entrada, el cambio de clave y la caja POS, porque deben abrir sin internet.
import LoginPage from '../views/LoginPage.vue';
import CambiarClavePage from '../views/CambiarClavePage.vue';
import VendedorLayout from '../layout/VendedorLayout.vue';
const VendedorHomePage = () => import('../views/vendedor/VendedorHomePage.vue');
const NuevoPedidoPage = () => import('../views/vendedor/NuevoPedidoPage.vue');
const PedidoDetallePage = () => import('../views/vendedor/PedidoDetallePage.vue');
const AdminLayout = () => import('../layout/AdminLayout.vue');
const AdminHomePage = () => import('../views/admin/AdminHomePage.vue');
const ClientesPage = () => import('../views/admin/ClientesPage.vue');
const InventarioPage = () => import('../views/admin/InventarioPage.vue');
const BodegaPage = () => import('../views/admin/BodegaPage.vue');
const SistemaPage = () => import('../views/admin/SistemaPage.vue');
import PosPage from '../views/pos/PosPage.vue';
const PosAdminPage = () => import('../views/admin/PosAdminPage.vue');
const AnalisisPage = () => import('../views/admin/AnalisisPage.vue');
const AccesosPage = () => import('../views/admin/AccesosPage.vue');
const PedidosPage = () => import('../views/admin/PedidosPage.vue');
const ConfiguracionPage = () => import('../views/admin/ConfiguracionPage.vue');
const FacturasPage = () => import('../views/admin/FacturasPage.vue');
const FacturaNuevaPage = () => import('../views/admin/FacturaNuevaPage.vue');
const FacturaDetallePage = () => import('../views/admin/FacturaDetallePage.vue');
const PagosPage = () => import('../views/admin/PagosPage.vue');
const PagoNuevoPage = () => import('../views/admin/PagoNuevoPage.vue');
const PagoDetallePage = () => import('../views/admin/PagoDetallePage.vue');
const CatalogoCuentasPage = () => import('../views/admin/CatalogoCuentasPage.vue');
const DiarioPage = () => import('../views/admin/DiarioPage.vue');
const ReportesContablesPage = () => import('../views/admin/ReportesContablesPage.vue');
const CierreFiscalPage = () => import('../views/admin/CierreFiscalPage.vue');
const CierreMensualPage = () => import('../views/admin/CierreMensualPage.vue');
const LibroMayorPage = () => import('../views/admin/LibroMayorPage.vue');
const IntegridadPage = () => import('../views/admin/IntegridadPage.vue');
const NotasCreditoPage = () => import('../views/admin/NotasCreditoPage.vue');
const EmpleadosPlanillaPage = () => import('../views/admin/planilla/EmpleadosPlanillaPage.vue');
const AsistenciaPage = () => import('../views/admin/planilla/AsistenciaPage.vue');
const PlanillasPage = () => import('../views/admin/planilla/PlanillasPage.vue');
const InformesPlanillaPage = () => import('../views/admin/planilla/InformesPlanillaPage.vue');
const ParametrosPlanillaPage = () => import('../views/admin/planilla/ParametrosPlanillaPage.vue');
const HojaAlistamientoPage = () => import('../views/pedidos/HojaAlistamientoPage.vue');

const routes = [
  { path: '/login', name: 'login', component: LoginPage, meta: { publica: true } },
  { path: '/cambiar-clave', name: 'cambiar-clave', component: CambiarClavePage },
  // Punto de venta de la tienda: pantalla completa, funciona sin internet.
  { path: '/pos', name: 'pos', component: PosPage, meta: { usaPOS: true } },

  // Fuera de los layouts a propósito: es una hoja para imprimir, no debe
  // salir el sidebar/header de la app ni en pantalla ni en el papel.
  {
    path: '/pedidos/:id/alistamiento',
    name: 'pedido-alistamiento',
    component: HojaAlistamientoPage,
    props: true,
  },

  // Vendedor: sin sidebar a propósito, flujo lineal simple y rápido.
  {
    path: '/',
    component: VendedorLayout,
    children: [
      { path: '', name: 'vendedor-home', component: VendedorHomePage },
      { path: 'pedidos/nuevo', name: 'pedido-nuevo', component: NuevoPedidoPage },
      { path: 'pedidos/:id', name: 'pedido-detalle', component: PedidoDetallePage, props: true },
    ],
  },

  // Administración: mismo panel (sidebar) para administración, contador
  // y asistente — pero cada sección hija pide su propio permiso, así que
  // cada quien ve solo lo que le corresponde (ver AdminSidebar.vue para
  // el filtro del menú, y el guard más abajo para el bloqueo real de la ruta).
  {
    path: '/admin',
    component: AdminLayout,
    meta: { usaPanelAdmin: true },
    children: [
      { path: '', name: 'admin-home', component: AdminHomePage },
      { path: 'pedidos', name: 'admin-pedidos', component: PedidosPage, meta: { permiso: 'pedidos.ver' } },
      { path: 'clientes', name: 'admin-clientes', component: ClientesPage, meta: { permiso: 'clientes.gestionar' } },
      { path: 'inventario', name: 'admin-inventario', component: InventarioPage, meta: { permiso: 'catalogo.gestionar' } },
      { path: 'bodega', name: 'admin-bodega', component: BodegaPage, meta: { permiso: 'inventario.ver' } },
      { path: 'facturas', name: 'admin-facturas', component: FacturasPage, meta: { permiso: 'facturacion.gestionar' } },
      { path: 'facturas/nueva', name: 'admin-factura-nueva', component: FacturaNuevaPage, meta: { permiso: 'facturacion.gestionar' } },
      {
        path: 'facturas/:id',
        name: 'admin-factura-detalle',
        component: FacturaDetallePage,
        props: true,
        meta: { permiso: 'facturacion.gestionar' },
      },
      { path: 'pagos', name: 'admin-pagos', component: PagosPage, meta: { permiso: 'cuentas_por_cobrar.gestionar' } },
      { path: 'pagos/nuevo', name: 'admin-pago-nuevo', component: PagoNuevoPage, meta: { permiso: 'cuentas_por_cobrar.gestionar' } },
      {
        path: 'pagos/:id',
        name: 'admin-pago-detalle',
        component: PagoDetallePage,
        props: true,
        meta: { permiso: 'cuentas_por_cobrar.gestionar' },
      },
      { path: 'contabilidad/cuentas', name: 'contabilidad-cuentas', component: CatalogoCuentasPage, meta: { permiso: 'contabilidad.ver' } },
      { path: 'contabilidad/diario', name: 'contabilidad-diario', component: DiarioPage, meta: { permiso: 'contabilidad.ver' } },
      { path: 'contabilidad/reportes', name: 'contabilidad-reportes', component: ReportesContablesPage, meta: { permiso: 'contabilidad.ver' } },
      { path: 'contabilidad/cierre-fiscal', name: 'contabilidad-cierre-fiscal', component: CierreFiscalPage, meta: { permiso: 'contabilidad.cierres' } },
      { path: 'contabilidad/cierre', name: 'contabilidad-cierre', component: CierreMensualPage, meta: { permiso: 'contabilidad.cierres' } },
      { path: 'contabilidad/mayor', name: 'contabilidad-mayor', component: LibroMayorPage, meta: { permiso: 'contabilidad.ver' } },
      { path: 'contabilidad/integridad', name: 'contabilidad-integridad', component: IntegridadPage, meta: { permiso: 'contabilidad.ver' } },
      {
        path: 'notas-credito',
        name: 'admin-notas-credito',
        component: NotasCreditoPage,
        meta: { permiso: 'facturacion.gestionar' },
      },
      // Gestión de personal: exclusiva del rol Administración, no es un
      // permiso delegable (mismo criterio que el backend — ver
      // UsuariosController).
      // Control de accesos: exclusivo del administrador del sistema (mismo criterio que el
      // backend — ver UsuariosController). La gerencia no entra acá.
      { path: 'sistema', name: 'admin-sistema', component: SistemaPage, meta: { soloSistema: true } },
      // Análisis de datos (tableros y exportación para Power BI / Python): también exclusivo del sistema.
      { path: 'analisis', name: 'admin-analisis', component: AnalisisPage, meta: { soloSistema: true } },
      // Tienda (POS): ventas, cajas, alertas de inventario, productos de tienda y configuración.
      { path: 'tienda', name: 'admin-tienda', component: PosAdminPage, meta: { permiso: 'pos.ver' } },
      { path: 'accesos', name: 'admin-accesos', component: AccesosPage, meta: { soloSistema: true } },
      // Tope general de descuentos: decisión de negocio, exclusiva de
      // Administración (mismo criterio que el backend — ver
      // ConfiguracionController).
      // Planilla: salarios, exclusivo de Administración (gerente).
      { path: 'planilla/empleados', name: 'planilla-empleados', component: EmpleadosPlanillaPage, meta: { permiso: 'planilla.ver' } },
      { path: 'planilla/asistencia', name: 'planilla-asistencia', component: AsistenciaPage, meta: { permiso: 'planilla.ver' } },
      { path: 'planilla/planillas', name: 'planilla-planillas', component: PlanillasPage, meta: { permiso: 'planilla.ver' } },
      { path: 'planilla/informes', name: 'planilla-informes', component: InformesPlanillaPage, meta: { permiso: 'planilla.ver' } },
      { path: 'planilla/parametros', name: 'planilla-parametros', component: ParametrosPlanillaPage, meta: { permiso: 'planilla.ver' } },
      { path: 'configuracion', name: 'admin-configuracion', component: ConfiguracionPage, meta: { permiso: 'configuracion.gestionar' } },
    ],
  },
];

export const router = createRouter({
  // import.meta.env.BASE_URL = lo que diga `base` en vite.config.js — en
  // producción es /cb/app/ (subcarpeta del hosting de Conejo Motors), en
  // dev sigue siendo '/'. Sin esto, los links quedarían resueltos contra
  // la raíz del dominio y no contra la subcarpeta real.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Mientras se abre una pantalla (se descarga si es la primera vez) se muestra el indicador de carga.
let terminarEspera = null;
router.beforeEach(() => {
  terminarEspera?.();
  terminarEspera = empezarEspera();
});
router.afterEach(() => {
  terminarEspera?.();
  terminarEspera = null;
});
// Después de una actualización, una pestaña vieja puede pedir un archivo que ya no existe: se recarga sola (una vez) para tomar la versión nueva.
router.onError((err, to) => {
  terminarEspera?.();
  terminarEspera = null;
  const mensaje = String(err?.message ?? err);
  if (!/dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch/i.test(mensaje)) return;
  const clave = 'cb-recarga-pantalla';
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(clave) ?? 0);
  } catch {
    /* sin almacenamiento no se puede evitar el ciclo: no se recarga */
    ultima = Date.now();
  }
  if (Date.now() - ultima > 30_000) {
    try {
      sessionStorage.setItem(clave, String(Date.now()));
    } catch {
      /* nada */
    }
    window.location.assign(to?.fullPath ? router.resolve(to.fullPath).href : window.location.href);
  } else {
    avisarErrorDeRed('No se pudo abrir esa pantalla. Revise su conexión a internet y vuelva a intentarlo.');
  }
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (!to.meta.publica && !auth.autenticado) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  // Clave temporal (cuenta nueva o restablecida): no se puede usar nada más
  // hasta cambiarla — el backend también lo exige.
  if ((auth.usuario?.debeCambiarClave || auth.usuario?.requiereDosPasos) && to.name !== 'cambiar-clave') {
    return { name: 'cambiar-clave' };
  }
  if (to.name === 'cambiar-clave') return true;
  // El encargado de tienda solo ve el punto de venta.
  if (auth.esEncargadoTienda && to.name !== 'pos') return { name: 'pos' };
  if (to.meta.usaPOS && !auth.puedeUsarPOS) return { name: auth.usaPanelAdmin ? 'admin-home' : 'vendedor-home' };
  if (to.meta.usaPanelAdmin && !auth.usaPanelAdmin) {
    return { name: 'vendedor-home' };
  }
  const modulo = /^planilla-/.test(String(to.name)) ? 'planilla' : /^contabilidad-/.test(String(to.name)) ? 'contabilidad' : /^admin-(facturas|factura-|notas-credito)/.test(String(to.name)) ? 'facturacion' : /^admin-pago/.test(String(to.name)) ? 'pagos' : to.name === 'admin-bodega' ? 'inventario' : to.name === 'pos' || to.name === 'admin-tienda' ? 'pos' : null;
  if (modulo && !auth.moduloActivo(modulo)) {
    return { name: 'admin-home' };
  }
  if (to.meta.soloSistema && !auth.esSistema) {
    return { name: 'admin-home' };
  }
  if (to.meta.permiso && !auth.tienePermiso(to.meta.permiso)) {
    return { name: 'admin-home' };
  }
  if (to.name === 'login' && auth.autenticado) {
    return { name: auth.esEncargadoTienda ? 'pos' : auth.usaPanelAdmin ? 'admin-home' : 'vendedor-home' };
  }
  return true;
});

// Título de la pestaña del navegador según la zona: panel de administración, vendedor o acceso.
router.afterEach((to) => {
  const zona = to.path.startsWith('/admin') ? 'Administración' : to.path.startsWith('/pos') ? 'Punto de venta' : to.meta.publica || to.name === 'cambiar-clave' ? null : 'Pedidos';
  document.title = zona ? `Conejo Blanco — ${zona}` : 'Conejo Blanco';
});
