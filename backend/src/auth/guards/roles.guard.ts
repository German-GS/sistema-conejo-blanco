import { ForbiddenException, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OCULTAR_KEY, ROLES_ESTRICTO_KEY, ROLES_KEY } from '../decorators/roles.decorator.js';
import { Rol } from '../../common/enums/rol.enum.js';
import type { UsuarioAutenticado } from '../usuario-autenticado.interface.js';

// Se usa DESPUÉS de JwtAuthGuard en la misma ruta: necesita request.user ya resuelto.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requeridos || requeridos.length === 0) return true;
    const estricto = this.reflector.getAllAndOverride<boolean>(ROLES_ESTRICTO_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    const usuario = request.user;

    // El administrador del sistema pasa cualquier control de rol; ningún otro rol
    // pasa un control que lo deje fuera (ej. el control de accesos).
    // El gerente general es administración con un poder más; el sistema pasa todo salvo lo estricto.
    const rol = usuario?.rol;
    const pasa =
      !!rol &&
      (requeridos.includes(rol) ||
        (rol === Rol.GERENTE_GENERAL && requeridos.includes(Rol.ADMINISTRACION)) ||
        (rol === Rol.SISTEMA && !estricto));
    if (!pasa) {
      if (this.reflector.getAllAndOverride<boolean>(OCULTAR_KEY, [context.getHandler(), context.getClass()])) {
        throw new NotFoundException();
      }
      throw new ForbiddenException(
        estricto && requeridos.includes(Rol.GERENTE_GENERAL)
          ? 'Esta acción es exclusiva del gerente general.'
          : requeridos.includes(Rol.ADMINISTRACION)
            ? 'Esta acción es exclusiva de administración.'
            : 'Esta acción es exclusiva del administrador del sistema.',
      );
    }
    return true;
  }
}
