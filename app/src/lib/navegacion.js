import { Home, ClipboardList, Users, Package, Warehouse, UserCog, Settings, Receipt, Undo2, HandCoins, BookOpen, NotebookText, Wallet, Fingerprint, SlidersHorizontal, BadgeDollarSign, FileBarChart, ShieldCheck, BookMarked, Lock, Landmark, Server, ChartColumnBig, Store, ScanBarcode, FileSpreadsheet, Palette, FileCheck2 } from '@lucide/vue';

// Secciones del panel de administración, en un solo lugar: las usan el menú lateral, la búsqueda rápida (Ctrl/Cmd+K) y las migas de pan.
// permiso/soloSistema/puedePOS es lo mismo que exige la ruta (ver router/index.js), así el menú y el bloqueo real nunca se desalinean.
// `palabras` son sinónimos para la búsqueda rápida; `hijas` son pantallas de detalle que pertenecen a la sección.
// Lista centralizada de secciones del panel: agregar una nueva área de
// administración a futuro es sumar una línea acá, no tocar el layout.
// permiso/soloAdmin es lo mismo que exige la ruta (ver router/index.js)
// — así el ítem del menú y el bloqueo real de la ruta nunca se
// desalinean. Una entrada con `items` es un grupo con encabezado (ej.
// "Ingresos") en vez de un ítem suelto.
export const NAV = [
  { to: { name: 'admin-home' }, etiqueta: 'Inicio', icono: Home, palabras: 'resumen pendientes tablero' },
  { to: { name: 'admin-pedidos' }, etiqueta: 'Pedidos', icono: ClipboardList, palabras: 'ordenes vendedores reposicion tiendas alistamiento', hijas: ['admin-hoja-alistamiento'], permiso: 'pedidos.ver' },
  { to: { name: 'admin-clientes' }, etiqueta: 'Clientes', icono: Users, palabras: 'cedula telefono descuento credito', permiso: 'clientes.gestionar' },
  { to: { name: 'admin-inventario' }, etiqueta: 'Inventario', icono: Package, palabras: 'productos colores fotos precios catalogo costo', permiso: 'catalogo.gestionar' },
  { to: { name: 'admin-bodega' }, etiqueta: 'Bodega', icono: Warehouse, palabras: 'existencias kardex ingreso ajuste stock movimientos', permiso: 'inventario.ver', modulo: 'inventario' },
  {
    grupo: 'Tienda',
    items: [
      { to: { name: 'pos' }, etiqueta: 'Abrir caja (POS)', icono: ScanBarcode, palabras: 'punto de venta cobrar tiquete', puedePOS: true, modulo: 'pos' },
      { to: { name: 'admin-tienda' }, etiqueta: 'Panel de tiendas', icono: Store, palabras: 'ventas cajas actividad alertas precios tienda configuracion tiquete cedula', permiso: 'pos.ver', modulo: 'pos' },
    ],
  },
  {
    grupo: 'Ingresos',
    items: [
      { to: { name: 'admin-facturas' }, etiqueta: 'Facturas', icono: Receipt, palabras: 'factura electronica emitir iva hacienda cobrar', hijas: ['admin-factura-nueva', 'admin-factura-detalle'], permiso: 'facturacion.gestionar', modulo: 'facturacion' },
      { to: { name: 'admin-facturacion-electronica' }, etiqueta: 'Facturación electrónica', icono: FileCheck2, palabras: 'hacienda llave p12 cabys emisor enviar emitir pruebas certificado atv', permiso: 'facturacion.gestionar', modulo: 'facturacion' },
      { to: { name: 'admin-pagos' }, etiqueta: 'Pagos recibidos', icono: HandCoins, palabras: 'cobros abonos cuentas por cobrar transferencia sinpe', hijas: ['admin-pago-nuevo', 'admin-pago-detalle'], permiso: 'cuentas_por_cobrar.gestionar', modulo: 'pagos' },
      {
        to: { name: 'admin-notas-credito' },
        etiqueta: 'Notas de crédito',
        icono: Undo2,
        palabras: 'devolucion anular factura',
        permiso: 'facturacion.gestionar',
        modulo: 'facturacion',
      },
    ],
  },
  {
    grupo: 'Contabilidad',
    items: [
      { to: { name: 'contabilidad-cuentas' }, etiqueta: 'Catálogo de cuentas', icono: BookOpen, palabras: 'plan de cuentas contabilidad', permiso: 'contabilidad.ver', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-diario' }, etiqueta: 'Libro diario', icono: NotebookText, palabras: 'asientos asiento manual contabilidad', permiso: 'contabilidad.ver', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-mayor' }, etiqueta: 'Libro mayor', icono: BookMarked, palabras: 'saldos movimientos cuenta contabilidad', permiso: 'contabilidad.ver', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-reportes' }, etiqueta: 'Reportes contables', icono: FileBarChart, palabras: 'balance estado de resultados balanza reportes', permiso: 'contabilidad.ver', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-cierre' }, etiqueta: 'Cierre mensual', icono: Lock, palabras: 'cerrar mes periodo contabilidad', permiso: 'contabilidad.cierres', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-cierre-fiscal' }, etiqueta: 'Cierre fiscal', icono: Landmark, palabras: 'cerrar año impuesto renta contabilidad', permiso: 'contabilidad.cierres', modulo: 'contabilidad' },
      { to: { name: 'contabilidad-integridad' }, etiqueta: 'Verificar cuadres', icono: ShieldCheck, palabras: 'integridad errores cuadre contabilidad revisar', permiso: 'contabilidad.ver', modulo: 'contabilidad' },
    ],
  },
  {
    grupo: 'Planilla',
    items: [
      { to: { name: 'planilla-empleados' }, etiqueta: 'Empleados', icono: Wallet, palabras: 'planilla personal salario cedula', permiso: 'planilla.ver', modulo: 'planilla' },
      { to: { name: 'planilla-asistencia' }, etiqueta: 'Asistencia', icono: Fingerprint, palabras: 'reloj huella marcas horas planilla importar', permiso: 'planilla.ver', modulo: 'planilla' },
      { to: { name: 'planilla-planillas' }, etiqueta: 'Planillas', icono: BadgeDollarSign, palabras: 'pagar nomina semana quincena aprobar colillas', permiso: 'planilla.ver', modulo: 'planilla' },
      { to: { name: 'planilla-informes' }, etiqueta: 'Informes de planilla', icono: FileSpreadsheet, palabras: 'reportes planilla ccss ins', permiso: 'planilla.ver', modulo: 'planilla' },
      { to: { name: 'planilla-parametros' }, etiqueta: 'Parámetros de planilla', icono: SlidersHorizontal, palabras: 'ley ccss renta tasas planilla', permiso: 'planilla.ver', modulo: 'planilla' },
    ],
  },
  { to: { name: 'admin-accesos' }, etiqueta: 'Accesos y usuarios', icono: UserCog, palabras: 'cuentas contraseña permisos roles bitacora 2fa', soloSistema: true },
  { to: { name: 'admin-analisis' }, etiqueta: 'Análisis de datos', icono: ChartColumnBig, palabras: 'power bi python salud financiera datasets graficos', soloSistema: true },
  { to: { name: 'admin-sistema' }, etiqueta: 'Estado del sistema', icono: Server, palabras: 'metricas salud seguridad modulos mantenimiento', soloSistema: true },
  { to: { name: 'admin-guia-diseno' }, etiqueta: 'Guía de diseño', icono: Palette, palabras: 'componentes colores botones estilos interfaz', soloSistema: true },
  { to: { name: 'admin-configuracion' }, etiqueta: 'Configuración', icono: Settings, palabras: 'datos de factura logo cuentas bancarias empresa', permiso: 'configuracion.gestionar' },
];


export function puedeVer(item, auth) {
  if (item.modulo && !auth.moduloActivo(item.modulo)) return false;
  if (item.soloSistema) return auth.esSistema;
  if (item.puedePOS) return auth.puedeUsarPOS;
  if (item.permiso) return auth.tienePermiso(item.permiso);
  return true;
}

// Lista plana de secciones que la persona puede ver: { etiqueta, grupo, to, icono, palabras, hijas }.
export function seccionesVisibles(auth) {
  return NAV.flatMap((e) => (e.grupo ? e.items.filter((i) => puedeVer(i, auth)).map((i) => ({ ...i, grupo: e.grupo })) : puedeVer(e, auth) ? [{ ...e, grupo: '' }] : []));
}

// ¿Esta sección es la pantalla actual (o una de sus pantallas de detalle)?
export const esActiva = (item, nombreRuta) => item.to.name === nombreRuta || (item.hijas ?? []).includes(nombreRuta);
