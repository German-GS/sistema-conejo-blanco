import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { Permiso } from '../../common/enums/permiso.enum.js';
import type { UsuarioAutenticado } from '../usuario-autenticado.interface.js';

// Se usa DESPUÉS de JwtAuthGuard en la misma ruta: necesita request.user ya resuelto.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Permiso[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requeridos || requeridos.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    const usuario = request.user;

    const faltantes = requeridos.filter((p) => !usuario?.permisos.has(p));
    if (faltantes.length > 0) {
      throw new ForbiddenException(
        `No tenés permiso para esta acción (falta: ${faltantes.join(', ')}). Pedile a administración que te lo autorice.`,
      );
    }
    return true;
  }
}
