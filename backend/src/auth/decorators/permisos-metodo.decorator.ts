import { SetMetadata } from '@nestjs/common';
import type { Permiso } from '../../common/enums/permiso.enum.js';

export const PERMISOS_METODO_KEY = 'permisos_por_metodo';

// Un controlador con muchas rutas: las lecturas (GET) piden un permiso y los cambios (POST/PATCH/PUT/DELETE) otro.
export const PermisosPorMetodo = (lectura: Permiso, escritura: Permiso) => SetMetadata(PERMISOS_METODO_KEY, { lectura, escritura });
