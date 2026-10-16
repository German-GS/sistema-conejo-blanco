import { ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { SistemaConfigService } from '../sistema/sistema-config.service.js';
import { permisosEfectivos } from '../common/permisos/permisos.util.js';
import { Rol } from '../common/enums/rol.enum.js';
import { generarSecretoTotp, urlOtpauth, verificarTotp } from './totp.js';
import type { Usuario } from '../usuarios/usuario.entity.js';
import type { JwtPayload } from './jwt-payload.interface.js';

// Hash de relleno: cuando el correo no existe igual se hace un bcrypt.compare
// para que el tiempo de respuesta no delate qué correos están registrados.
const HASH_RELLENO = bcrypt.hashSync('relleno-para-igualar-tiempos', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly bitacora: BitacoraService,
    private readonly sistemaConfig: SistemaConfigService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const maxIntentos = await this.sistemaConfig.get<number>('seguridad.intentos_maximos');
    const minutosBloqueo = await this.sistemaConfig.get<number>('seguridad.bloqueo_minutos');

    const usuario = await this.usuariosService.buscarPorEmailConPermisos(email);
    if (!usuario) {
      await bcrypt.compare(password, HASH_RELLENO);
      await this.bitacora.registrar({ accion: 'login_fallido', usuarioEmail: email.slice(0, 160), detalle: 'correo no registrado', ip });
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      await bcrypt.compare(password, HASH_RELLENO);
      await this.bitacora.registrar({ accion: 'login_bloqueado', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: 'cuenta bloqueada por intentos fallidos', ip });
      throw new HttpException(
        'Demasiados intentos fallidos. Esperá unos minutos o pedile al administrador del sistema que restablezca tu clave.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValida || !usuario.activo) {
      if (usuario.activo) {
        const bloqueada = await this.usuariosService.registrarLoginFallido(usuario.id, maxIntentos, minutosBloqueo);
        await this.bitacora.registrar({ accion: 'login_fallido', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: 'clave incorrecta', ip });
        if (bloqueada) await this.bitacora.registrar({ accion: 'cuenta_bloqueada', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: `${minutosBloqueo} minutos`, ip });
      } else {
        await this.bitacora.registrar({ accion: 'login_fallido', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: 'cuenta desactivada', ip });
      }
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    // La clave temporal solo sirve un tiempo: si no se usó a tiempo hay que pedir otra.
    if (usuario.debeCambiarClave && usuario.claveTemporalVence && usuario.claveTemporalVence.getTime() < Date.now()) {
      await this.bitacora.registrar({ accion: 'login_fallido', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: 'clave temporal vencida', ip });
      throw new UnauthorizedException('Tu clave temporal venció. Pedile al administrador del sistema que te genere una nueva.');
    }

    // La cuenta del sistema puede restringirse a ciertas direcciones IP.
    if (usuario.rol === Rol.SISTEMA) {
      const permitidas = (await this.sistemaConfig.get<string>('seguridad.sistema_ips')).split(',').map((x) => x.trim()).filter(Boolean);
      if (permitidas.length > 0 && !permitidas.includes((ip ?? '').replace('::ffff:', ''))) {
        await this.bitacora.registrar({ accion: 'ip_no_permitida', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: `IP ${ip} fuera de la lista`, ip });
        throw new ForbiddenException('Esta cuenta solo puede entrar desde las direcciones autorizadas.');
      }
    }

    // En mantenimiento solo entra el administrador del sistema.
    if (usuario.rol !== Rol.SISTEMA) {
      const mant = await this.sistemaConfig.enMantenimiento();
      if (mant.activo) throw new ServiceUnavailableException({ statusCode: 503, code: 'MANTENIMIENTO', message: mant.mensaje });
    }

    // Con verificación en dos pasos activa, la clave sola no basta: se devuelve un ticket
    // de 5 minutos que se canjea (con el código de la app) en /auth/login-2fa.
    if (usuario.totpActivo) {
      const ticket = await this.jwtService.signAsync({ sub: usuario.id, tipo: '2fa' }, { expiresIn: '5m' });
      return { requiereDosPasos: true as const, ticket };
    }

    await this.usuariosService.registrarLoginExitoso(usuario.id);
    await this.bitacora.registrar({ accion: 'login_ok', usuarioId: usuario.id, usuarioEmail: usuario.email, ip });
    return this.armarSesion(usuario);
  }

  async loginDosPasos(ticket: string, codigo: string, ip?: string) {
    let payload: { sub: string; tipo?: string };
    try {
      payload = await this.jwtService.verifyAsync(ticket);
    } catch {
      throw new UnauthorizedException('El paso anterior venció. Ingresá de nuevo.');
    }
    if (payload.tipo !== '2fa') throw new UnauthorizedException('El paso anterior no es válido.');

    const usuario = await this.usuariosService.buscarPorIdConPermisos(payload.sub);
    if (!usuario || !usuario.activo) throw new UnauthorizedException('La cuenta ya no está activa.');
    const { activo, secreto } = await this.usuariosService.totpDe(usuario.id);
    if (!activo || !secreto) throw new UnauthorizedException('Esta cuenta no usa verificación en dos pasos.');

    if (!verificarTotp(secreto, codigo)) {
      const bloqueada = await this.usuariosService.registrarLoginFallido(
        usuario.id,
        await this.sistemaConfig.get<number>('seguridad.intentos_maximos'),
        await this.sistemaConfig.get<number>('seguridad.bloqueo_minutos'),
      );
      await this.bitacora.registrar({ accion: 'dos_pasos_fallido', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: bloqueada ? 'código incorrecto; cuenta bloqueada' : 'código incorrecto', ip });
      throw new UnauthorizedException('El código no es correcto.');
    }
    await this.usuariosService.registrarLoginExitoso(usuario.id);
    await this.bitacora.registrar({ accion: 'login_ok', usuarioId: usuario.id, usuarioEmail: usuario.email, detalle: 'con verificación en dos pasos', ip });
    return this.armarSesion(usuario as Usuario);
  }

  // ---- Activar / desactivar la verificación en dos pasos (cuenta propia) ----

  async iniciarDosPasos(usuarioId: string, correo: string) {
    const actual = await this.usuariosService.totpDe(usuarioId);
    if (actual.activo) throw new ForbiddenException('La verificación en dos pasos ya está activa.');
    const secreto = generarSecretoTotp();
    await this.usuariosService.guardarTotpPendiente(usuarioId, secreto);
    return { secreto, otpauthUrl: urlOtpauth(secreto, correo) };
  }

  async activarDosPasos(usuarioId: string, codigo: string, ip?: string) {
    const { activo, secreto } = await this.usuariosService.totpDe(usuarioId);
    if (activo || !secreto) throw new ForbiddenException('Primero iniciá la activación.');
    if (!verificarTotp(secreto, codigo)) throw new UnauthorizedException('El código no es correcto. Revisá la hora del teléfono.');
    const usuario = await this.usuariosService.activarTotp(usuarioId);
    await this.bitacora.registrar({ accion: 'dos_pasos_activado', usuarioId, usuarioEmail: usuario.email, objetivo: usuario.email, ip });
    return { accessToken: await this.emitirToken(usuario) };
  }

  async desactivarDosPasos(usuarioId: string, rol: Rol, password: string, codigo: string, ip?: string) {
    if ((await this.sistemaConfig.get<string[]>('seguridad.dos_pasos_roles')).includes(rol)) {
      throw new ForbiddenException('Tu perfil exige verificación en dos pasos: no se puede desactivar.');
    }
    const usuario = await this.usuariosService.buscarPorIdConHash(usuarioId);
    if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) throw new UnauthorizedException('La contraseña no es correcta.');
    const { activo, secreto } = await this.usuariosService.totpDe(usuarioId);
    if (!activo || !secreto || !verificarTotp(secreto, codigo)) throw new UnauthorizedException('El código no es correcto.');
    await this.usuariosService.quitarTotp(usuarioId);
    await this.bitacora.registrar({ accion: 'dos_pasos_desactivado', usuarioId, usuarioEmail: usuario.email, objetivo: usuario.email, ip });
    return { desactivado: true };
  }

  async emitirToken(usuario: Pick<Usuario, 'id' | 'email' | 'rol' | 'versionToken'>): Promise<string> {
    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      v: usuario.versionToken,
    };
    const horas = await this.sistemaConfig.get<number>('seguridad.sesion_horas');
    return this.jwtService.signAsync(payload, { expiresIn: `${horas}h` });
  }

  async armarSesion(usuario: Usuario) {
    // Set -> array acá: es la frontera hacia JSON (un Set se serializa
    // como "{}" vacío si se manda tal cual en la respuesta HTTP).
    const permisos = [...permisosEfectivos(usuario.rol, usuario.permisos ?? [])];
    const exigidos = await this.sistemaConfig.get<string[]>('seguridad.dos_pasos_roles');

    return {
      accessToken: await this.emitirToken(usuario),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos,
        debeCambiarClave: usuario.debeCambiarClave,
        totpActivo: usuario.totpActivo,
        requiereDosPasos: exigidos.includes(usuario.rol) && !usuario.totpActivo,
      },
    };
  }
}
