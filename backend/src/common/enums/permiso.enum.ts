// Catálogo fijo de permisos del sistema. No es editable desde la app —
// para agregar un permiso nuevo se agrega acá y se asigna un valor por
// defecto por rol en permisos-por-defecto.ts. Mismo patrón que Conejo
// Aquatics.
export enum Permiso {
  // Ver TODOS los pedidos (no solo los propios) — lo que necesita, por
  // ejemplo, un asistente que solo recibe e imprime órdenes.
  PEDIDOS_VER = 'pedidos.ver',
  PEDIDOS_GESTIONAR = 'pedidos.gestionar', // anular

  CLIENTES_GESTIONAR = 'clientes.gestionar',
  CATALOGO_GESTIONAR = 'catalogo.gestionar',

  INVENTARIO_VER = 'inventario.ver',
  INVENTARIO_GESTIONAR = 'inventario.gestionar', // ingresos, ajustes
  TRASPASOS_GESTIONAR = 'traspasos.gestionar',

  FACTURACION_GESTIONAR = 'facturacion.gestionar', // facturar pedidos, ver facturas
  CONTABILIDAD_VER = 'contabilidad.ver',
  CONTABILIDAD_GESTIONAR = 'contabilidad.gestionar', // catálogo de cuentas, asientos manuales
  CUENTAS_POR_COBRAR_GESTIONAR = 'cuentas_por_cobrar.gestionar',

  // Planilla: datos de salarios. `ver` = consultar empleados, planillas e informes;
  // `gestionar` = crear/aprobar/pagar planillas, editar empleados, asistencia y parámetros operativos.
  PLANILLA_VER = 'planilla.ver',
  PLANILLA_GESTIONAR = 'planilla.gestionar',

  // Cierre mensual y fiscal (genera asientos de pago y bloquea meses/años).
  CIERRES_GESTIONAR = 'contabilidad.cierres',

  // Datos de la empresa: tope de descuentos, encabezado de facturas y logo, cuentas bancarias, bodegas.
  CONFIGURACION_GESTIONAR = 'configuracion.gestionar',

  // Nota: los permisos son SOLO de la gestión y administración de la empresa. El control de accesos,
  // la bitácora y el panel del sistema no son permisos: son exclusivos del administrador del sistema
  // (ver RequireRole(Rol.SISTEMA)), así que nunca se pueden asignar a nadie.
}
