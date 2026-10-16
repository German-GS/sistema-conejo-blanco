import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISOS_METODO_KEY } from '../decorators/permisos-metodo.decorator.js';
import type { Permiso } from '../../common/enums/permiso.enum.js';
import type { UsuarioAutenticado } from '../usuario-autenticado.interface.js';

@Injectable()
export class PermisosMetodoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<{ lectura: Permiso; escritura: Permiso }>(PERMISOS_METODO_KEY, [context.getHandler(), context.getClass()]);
    if (!cfg) return true;
    const req = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado; method: string }>();
    const lee = req.method === 'GET' || req.method === 'HEAD';
    const requerido = lee ? cfg.lectura : cfg.escritura;
    // Quien puede gestionar también puede consultar.
    const ok = req.user?.permisos.has(requerido) || (lee && req.user?.permisos.has(cfg.escritura));
    if (!ok) {
      throw new ForbiddenException(`No tenés permiso para esta acción (falta: ${requerido}). Pedile al administrador del sistema que te lo autorice.`);
    }
    return true;
  }
}
