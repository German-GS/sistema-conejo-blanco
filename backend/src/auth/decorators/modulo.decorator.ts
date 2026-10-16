import { SetMetadata } from '@nestjs/common';
import type { ModuloSistema } from '../../sistema/sistema-config.service.js';

export const MODULO_KEY = 'modulo_sistema';

// Marca un controlador como parte de un módulo que el administrador del sistema puede apagar.
export const Modulo = (modulo: ModuloSistema) => SetMetadata(MODULO_KEY, modulo);
