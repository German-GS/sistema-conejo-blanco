import { ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { MODULO_KEY } from '../decorators/modulo.decorator.js';
import { Rol } from '../../common/enums/rol.enum.js';
import { SistemaConfigService } from '../../sistema/sistema-config.service.js';
import type { UsuarioAutenticado } from '../usuario-autenticado.interface.js';

// Rutas que una cuenta con clave temporal sí puede usar para poder cambiarla.
const RUTAS_PERMITIDAS_CON_CLAVE_TEMPORAL = ['/auth/me', '/auth/password', '/auth/dos-pasos/iniciar', '/auth/dos-pasos/activar'];
// Rutas que siguen funcionando en mantenimiento para que la pantalla pueda avisar.
const RUTAS_EN_MANTENIMIENTO = ['/auth/me', '/sistema/publico'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: SistemaConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const request = context.switchToHttp().getRequest<{ user: UsuarioAutenticado; path?: string; url: string }>();
    const ruta = (request.path ?? request.url).split('?')[0].replace(/\/+$/, '');
    const usuario = request.user;

    if (usuario?.debeCambiarClave && !RUTAS_PERMITIDAS_CON_CLAVE_TEMPORAL.includes(ruta)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CAMBIO_CLAVE_REQUERIDO',
        message: 'Debés cambiar tu contraseña temporal antes de continuar.',
      });
    }
    if (usuario?.requiereDosPasos && !RUTAS_PERMITIDAS_CON_CLAVE_TEMPORAL.includes(ruta)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'DOS_PASOS_REQUERIDO',
        message: 'Tu perfil exige verificación en dos pasos: activala para continuar.',
      });
    }

    // El administrador del sistema no se ve afectado por el mantenimiento ni por módulos apagados.
    if (usuario?.rol !== Rol.SISTEMA) {
      const mant = await this.config.enMantenimiento();
      if (mant.activo && !RUTAS_EN_MANTENIMIENTO.includes(ruta)) {
        throw new ServiceUnavailableException({ statusCode: 503, code: 'MANTENIMIENTO', message: mant.mensaje });
      }
      const modulo = this.reflector.getAllAndOverride<string>(MODULO_KEY, [context.getHandler(), context.getClass()]);
      if (modulo && !(await this.config.moduloActivo(modulo))) {
        throw new ForbiddenException({ statusCode: 403, code: 'MODULO_APAGADO', message: 'Este módulo no está habilitado en tu sistema.' });
      }
    }
    return true;
  }
}
