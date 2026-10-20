import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

import LoginPage from '../views/LoginPage.vue';
import CambiarClavePage from '../views/CambiarClavePage.vue';
import VendedorLayout from '../layout/VendedorLayout.vue';
import VendedorHomePage from '../views/vendedor/VendedorHomePage.vue';
import NuevoPedidoPage from '../views/vendedor/NuevoPedidoPage.vue';
import PedidoDetallePage from '../views/vendedor/PedidoDetallePage.vue';
import AdminLayout from '../layout/AdminLayout.vue';
import AdminHomePage from '../views/admin/AdminHomePage.vue';
import ClientesPage from '../views/admin/ClientesPage.vue';
import InventarioPage from '../views/admin/InventarioPage.vue';
import BodegaPage from '../views/admin/BodegaPage.vue';
import SistemaPage from '../views/admin/SistemaPage.vue';
import AnalisisPage from '../views/admin/AnalisisPage.vue';
import AccesosPage from '../views/admin/AccesosPage.vue';
import PedidosPage from '../views/admin/PedidosPage.vue';
import ConfiguracionPage from '../views/admin/ConfiguracionPage.vue';
import FacturasPage from '../views/admin/FacturasPage.vue';
import FacturaNuevaPage from '../views/admin/FacturaNuevaPage.vue';
import FacturaDetallePage from '../views/admin/FacturaDetallePage.vue';
import PagosPage from '../views/admin/PagosPage.vue';
import PagoNuevoPage from '../views/admin/PagoNuevoPage.vue';
import PagoDetallePage from '../views/admin/PagoDetallePage.vue';
import CatalogoCuentasPage from '../views/admin/CatalogoCuentasPage.vue';
import DiarioPage from '../views/admin/DiarioPage.vue';
import ReportesContablesPage from '../views/admin/ReportesContablesPage.vue';
import CierreFiscalPage from '../views/admin/CierreFiscalPage.vue';
import CierreMensualPage from '../views/admin/CierreMensualPage.vue';
import LibroMayorPage from '../views/admin/LibroMayorPage.vue';
import IntegridadPage from '../views/admin/IntegridadPage.vue';
import NotasCreditoPage from '../views/admin/NotasCreditoPage.vue';
import EmpleadosPlanillaPage from '../views/admin/planilla/EmpleadosPlanillaPage.vue';
import AsistenciaPage from '../views/admin/planilla/AsistenciaPage.vue';
import PlanillasPage from '../views/admin/planilla/PlanillasPage.vue';
import InformesPlanillaPage from '../views/admin/planilla/InformesPlanillaPage.vue';
import ParametrosPlanillaPage from '../views/admin/planilla/ParametrosPlanillaPage.vue';
import HojaAlistamientoPage from '../views/pedidos/HojaAlistamientoPage.vue';

const routes = [
  { path: '/login', name: 'login', component: LoginPage, meta: { publica: true } },
  { path: '/cambiar-clave', name: 'cambiar-clave', component: CambiarClavePage },

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
  if (to.meta.usaPanelAdmin && !auth.usaPanelAdmin) {
    return { name: 'vendedor-home' };
  }
  const modulo = /^planilla-/.test(String(to.name)) ? 'planilla' : /^contabilidad-/.test(String(to.name)) ? 'contabilidad' : /^admin-(facturas|factura-|notas-credito)/.test(String(to.name)) ? 'facturacion' : /^admin-pago/.test(String(to.name)) ? 'pagos' : to.name === 'admin-bodega' ? 'inventario' : null;
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
    return { name: auth.usaPanelAdmin ? 'admin-home' : 'vendedor-home' };
  }
  return true;
});
