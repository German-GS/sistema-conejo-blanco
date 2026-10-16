import { Permiso } from '../enums/permiso.enum.js';
import { Rol } from '../enums/rol.enum.js';
import { PERMISOS_POR_DEFECTO } from './permisos-por-defecto.js';

export interface PermisoOverride {
  permiso: Permiso;
  concedido: boolean;
}

// El administrador del sistema siempre tiene todo (no se le puede quitar nada, para que nunca quede
// bloqueado de su propio sistema). Para el resto de perfiles —incluidos gerente general y
// administración— se parte de los permisos por defecto del perfil y se aplican los ajustes
// puntuales de la cuenta (conceder de más o quitar).
export function permisosEfectivos(rol: Rol, overrides: PermisoOverride[]): Set<Permiso> {
  if (rol === Rol.SISTEMA) {
    return new Set(Object.values(Permiso));
  }

  const efectivos = new Set(PERMISOS_POR_DEFECTO[rol]);
  for (const override of overrides) {
    if (override.concedido) {
      efectivos.add(override.permiso);
    } else {
      efectivos.delete(override.permiso);
    }
  }
  return efectivos;
}
