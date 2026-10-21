// Debe coincidir con el backend (common/enums/permiso.enum.ts y
// permisos-por-defecto.ts) — el catálogo de permisos no se expone por
// API porque es fijo, así que se replica acá para poder armar los
// checkboxes de la pantalla de Personal.

export const PERMISOS = [
  { valor: 'pedidos.ver', etiqueta: 'Ver todos los pedidos' },
  { valor: 'pedidos.gestionar', etiqueta: 'Anular pedidos' },
  { valor: 'clientes.gestionar', etiqueta: 'Gestionar clientes' },
  // Ojo: este permiso (catalogo.gestionar) es distinto de
  // inventario.gestionar de abajo — este es productos/colores/precios;
  // el otro es cantidades en bodega (ingresos, ajustes, traspasos).
  { valor: 'catalogo.gestionar', etiqueta: 'Gestionar productos y precios' },
  { valor: 'inventario.ver', etiqueta: 'Ver inventario' },
  { valor: 'inventario.gestionar', etiqueta: 'Gestionar inventario (ingresos, ajustes)' },
  { valor: 'traspasos.gestionar', etiqueta: 'Gestionar traspasos entre ubicaciones' },
  { valor: 'facturacion.gestionar', etiqueta: 'Facturar pedidos' },
  { valor: 'contabilidad.ver', etiqueta: 'Ver contabilidad' },
  { valor: 'contabilidad.gestionar', etiqueta: 'Gestionar contabilidad (catálogo, asientos manuales)' },
  { valor: 'cuentas_por_cobrar.gestionar', etiqueta: 'Gestionar cuentas por cobrar' },
  { valor: 'planilla.ver', etiqueta: 'Ver planilla: empleados, planillas e informes de salarios' },
  { valor: 'planilla.gestionar', etiqueta: 'Gestionar planilla: crear, aprobar y pagar, editar empleados y asistencia' },
  { valor: 'contabilidad.cierres', etiqueta: 'Hacer los cierres mensual y fiscal' },
  { valor: 'pos.ver', etiqueta: 'Ver el punto de venta: ventas, cajas y alertas de las tiendas' },
  { valor: 'pos.gestionar', etiqueta: 'Gestionar el punto de venta: anular ventas y configurarlo' },
  { valor: 'configuracion.gestionar', etiqueta: 'Configuración de la empresa: descuentos, datos de factura, cuentas bancarias, bodegas' },
];

// Ámbitos en que se agrupan los permisos al asignarlos (solo gestión y administración de la empresa).
export const AMBITOS = [
  { titulo: 'Ventas y clientes', valores: ['pedidos.ver', 'pedidos.gestionar', 'clientes.gestionar'] },
  { titulo: 'Productos e inventario', valores: ['catalogo.gestionar', 'inventario.ver', 'inventario.gestionar', 'traspasos.gestionar'] },
  { titulo: 'Facturación y cobros', valores: ['facturacion.gestionar', 'cuentas_por_cobrar.gestionar'] },
  { titulo: 'Contabilidad', valores: ['contabilidad.ver', 'contabilidad.gestionar', 'contabilidad.cierres'] },
  { titulo: 'Planilla', valores: ['planilla.ver', 'planilla.gestionar'] },
  { titulo: 'Tiendas (POS)', valores: ['pos.ver', 'pos.gestionar'] },
  { titulo: 'Empresa', valores: ['configuracion.gestionar'] },
];

const TODOS = PERMISOS.map((p) => p.valor);

export const PERMISOS_POR_DEFECTO = {
  sistema: TODOS,
  gerente_general: TODOS,
  administracion: TODOS,
  vendedor: [],
  contador: ['pedidos.ver', 'facturacion.gestionar', 'contabilidad.ver', 'contabilidad.gestionar', 'cuentas_por_cobrar.gestionar', 'pos.ver'],
  asistente: ['pedidos.ver'],
  encargado_tienda: [],
};

// Perfiles que se pueden asignar desde Control de accesos (el del sistema no se crea desde la app).
export const ROLES_ASIGNABLES = [
  { valor: 'vendedor', etiqueta: 'Vendedor' },
  { valor: 'encargado_tienda', etiqueta: 'Encargado de tienda (caja de su tienda)' },
  { valor: 'asistente', etiqueta: 'Asistente' },
  { valor: 'contador', etiqueta: 'Contador' },
  { valor: 'gerente_general', etiqueta: 'Gerente general (único; modifica parámetros de ley)' },
  { valor: 'administracion', etiqueta: 'Administración (gerencia)' },
];

export const ROLES = [
  { valor: 'sistema', etiqueta: 'Administrador del sistema' },
  { valor: 'gerente_general', etiqueta: 'Gerente general' },
  { valor: 'vendedor', etiqueta: 'Vendedor' },
  { valor: 'encargado_tienda', etiqueta: 'Encargado de tienda' },
  { valor: 'asistente', etiqueta: 'Asistente' },
  { valor: 'contador', etiqueta: 'Contador' },
  { valor: 'administracion', etiqueta: 'Administración' },
];

export function etiquetaRol(rol) {
  return ROLES.find((r) => r.valor === rol)?.etiqueta ?? rol;
}

// Set de permisos efectivos de un usuario: los del rol por defecto, más
// sus overrides puntuales (usuario.permisos, tal como viene de la API:
// [{permiso, concedido}]) — misma lógica que permisosEfectivos() del backend.
export function permisosEfectivos(rol, overrides = []) {
  if (rol === 'sistema') return new Set(TODOS);

  const efectivos = new Set(PERMISOS_POR_DEFECTO[rol] ?? []);
  for (const o of overrides) {
    if (o.concedido) efectivos.add(o.permiso);
    else efectivos.delete(o.permiso);
  }
  return efectivos;
}
