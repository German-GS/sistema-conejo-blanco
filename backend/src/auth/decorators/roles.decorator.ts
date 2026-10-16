import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../../common/enums/rol.enum.js';

export const ROLES_KEY = 'roles_requeridos';

// Uso: @RequireRole(Rol.ADMINISTRACION)
export const ROLES_ESTRICTO_KEY = 'roles_estricto';

// Igual que RequireRole, pero ni siquiera el administrador del sistema pasa si su rol no está
// en la lista (ej. los parámetros de ley, que solo modifica el gerente general).
export const RequireRoleStrict = (...roles: Rol[]) => (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
  SetMetadata(ROLES_KEY, roles)(target, key as string, descriptor as PropertyDescriptor);
  SetMetadata(ROLES_ESTRICTO_KEY, true)(target, key as string, descriptor as PropertyDescriptor);
};

export const RequireRole = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

export const OCULTAR_KEY = 'ocultar_si_no_autorizado';

// Quien no tiene el rol recibe un 404, como si la ruta no existiera (módulos que solo conoce el
// administrador del sistema: control de accesos, registros de actividad, salud).
export const OcultarSiNoAutorizado = () => SetMetadata(OCULTAR_KEY, true);
