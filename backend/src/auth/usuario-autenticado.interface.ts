import type { Rol } from '../common/enums/rol.enum.js';
import type { Permiso } from '../common/enums/permiso.enum.js';

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  permisos: Set<Permiso>;
  debeCambiarClave: boolean;
  // Su perfil exige verificación en dos pasos y todavía no la tiene activa.
  requiereDosPasos?: boolean;
  totpActivo?: boolean;
  // Solo el encargado de tienda: la tienda de su caja.
  tienda?: { id: string; nombre: string; codigo: string } | null;
}
