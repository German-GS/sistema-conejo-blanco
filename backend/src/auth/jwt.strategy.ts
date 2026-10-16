import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SistemaConfigService } from '../sistema/sistema-config.service.js';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { permisosEfectivos } from '../common/permisos/permisos.util.js';
import type { JwtPayload } from './jwt-payload.interface.js';
import type { UsuarioAutenticado } from './usuario-autenticado.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usuariosService: UsuariosService,
    private readonly sistemaConfig: SistemaConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload & { tipo?: string }): Promise<UsuarioAutenticado> {
    // El ticket del segundo paso del login no es una sesión.
    if (payload.tipo) throw new UnauthorizedException('Token no válido.');
    const usuario = await this.usuariosService.buscarPorIdConPermisos(payload.sub);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('La cuenta ya no está activa.');
    }
    // Tokens emitidos antes de un cambio de clave / desactivación / cambio
    // de rol quedan invalidados.
    if ((payload.v ?? 0) !== usuario.versionToken) {
      throw new UnauthorizedException('La sesión ya no es válida. Iniciá sesión de nuevo.');
    }

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      permisos: permisosEfectivos(usuario.rol, usuario.permisos),
      debeCambiarClave: usuario.debeCambiarClave,
      totpActivo: usuario.totpActivo,
      requiereDosPasos: (await this.sistemaConfig.get<string[]>('seguridad.dos_pasos_roles')).includes(usuario.rol) && !usuario.totpActivo,
    };
  }
}
