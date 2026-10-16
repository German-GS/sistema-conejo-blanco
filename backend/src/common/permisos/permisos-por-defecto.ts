import { Permiso } from '../enums/permiso.enum.js';
import { Rol } from '../enums/rol.enum.js';

// Qué ve cada perfil el día que se crea la cuenta, antes de cualquier
// ajuste puntual (ver UsuarioPermiso). Administración siempre tiene todo
// — no por estar listado acá, sino porque permisosEfectivos() la trata
// aparte (ver permisos.util.ts): no se le puede quitar nada.
export const PERMISOS_POR_DEFECTO: Record<Rol, Permiso[]> = {
  [Rol.SISTEMA]: Object.values(Permiso),
  [Rol.GERENTE_GENERAL]: Object.values(Permiso),
  [Rol.ADMINISTRACION]: Object.values(Permiso),

  // El vendedor no usa este sistema de permisos — tiene su propia UI
  // aparte, sin sidebar, que solo toca sus propios pedidos.
  [Rol.VENDEDOR]: [],

  // Contador: todo lo relacionado con dinero — factura, cobra, lleva el
  // libro contable. Ve los pedidos para tener contexto de qué está
  // facturando, pero no los anula ni toca catálogo/inventario/clientes.
  [Rol.CONTADOR]: [
    Permiso.PEDIDOS_VER,
    Permiso.FACTURACION_GESTIONAR,
    Permiso.CONTABILIDAD_VER,
    Permiso.CONTABILIDAD_GESTIONAR,
    Permiso.CUENTAS_POR_COBRAR_GESTIONAR,
  ],

  // Asistente: recibe pedidos y los imprime (ej. la hoja de bodega) —
  // nada más, ni siquiera anular.
  [Rol.ASISTENTE]: [Permiso.PEDIDOS_VER],
};
