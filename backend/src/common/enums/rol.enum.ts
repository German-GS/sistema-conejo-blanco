// El rol define QUÉ INTERFAZ ve el usuario y sus permisos de partida:
// - VENDEDOR: la UI simplificada aparte (sin sidebar), acceso solo a sus
//   propios pedidos. No usa el sistema de permisos de abajo.
// - SISTEMA: el administrador del sistema (quien lo desarrolla y mantiene).
//   Pasa todos los controles de rol y es el ÚNICO que administra cuentas,
//   claves y permisos de otras personas (ver usuarios.controller.ts). Solo
//   existe la cuenta definida en ADMIN_SEED_EMAIL: no se crea desde la app.
// - ADMINISTRACION: la gerencia. Acceso total al negocio (ventas, planilla,
//   contabilidad, configuración), no delegable, pero SIN control de accesos.
// - CONTADOR / ASISTENTE: usan el mismo panel de administración
//   (sidebar), pero con acceso restringido a las secciones que les
//   correspondan según sus permisos — ver permisos-por-defecto.ts para
//   el set inicial de cada uno, y UsuarioPermiso para ajustes puntuales
//   por persona.
export enum Rol {
  SISTEMA = 'sistema',
  // Una sola cuenta: la persona que dirige la empresa. Tiene todo lo de administración y,
  // además, es la única que modifica los parámetros de ley (cargas sociales, renta, tarifas).
  GERENTE_GENERAL = 'gerente_general',
  ADMINISTRACION = 'administracion',
  VENDEDOR = 'vendedor',
  CONTADOR = 'contador',
  ASISTENTE = 'asistente',
  // Encargado de tienda: atiende la caja de su tienda y solo ve el punto de venta (POS) de esa tienda.
  ENCARGADO_TIENDA = 'encargado_tienda',
}
