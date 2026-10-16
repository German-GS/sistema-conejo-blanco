import { SetMetadata } from '@nestjs/common';
import type { Permiso } from '../../common/enums/permiso.enum.js';

export const PERMISSIONS_KEY = 'permisos_requeridos';

// Uso: @RequirePermissions(Permiso.CONTABILIDAD_VER)
// El usuario necesita TODOS los permisos listados (AND), no basta con uno.
export const RequirePermissions = (...permisos: Permiso[]) => SetMetadata(PERMISSIONS_KEY, permisos);
