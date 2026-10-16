import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './usuario.entity.js';
import { Rol } from '../common/enums/rol.enum.js';
import { Empleado } from '../planilla/empleado.entity.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { SistemaConfigService } from '../sistema/sistema-config.service.js';
import { cifrarSecreto, descifrarSecreto } from '../auth/totp.js';
import { UsuarioPermiso } from './usuario-permiso.entity.js';
import type { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import type { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import type { CambiarPasswordDto } from './dto/cambiar-password.dto.js';
import type { ActualizarPermisosDto } from './dto/actualizar-permisos.dto.js';
import { generarPasswordTemporal, validarPoliticaPassword } from '../common/utils/password.util.js';

const SALT_ROUNDS = 12;

// Columnas que necesita la sesión (JwtStrategy). Sin password_hash.
const COLUMNAS_SESION: (keyof Usuario)[] = [
  'id',
  'nombre',
  'email',
  'rol',
  'activo',
  'creadoEn',
  'versionToken',
  'debeCambiarClave',
  'totpActivo',
];

// Nunca devolver el hash ni los contadores internos de seguridad en una respuesta.
function sanear(usuario: Usuario): Usuario {
  const { passwordHash: _h, versionToken: _v, intentosFallidos: _i, bloqueadoHasta: _b, ...resto } = usuario;
  return resto as Usuario;
}

@Injectable()
export class UsuariosService implements OnModuleInit {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(UsuarioPermiso)
    private readonly usuarioPermisoRepo: Repository<UsuarioPermiso>,
    @InjectRepository(Empleado)
    private readonly empleadoRepo: Repository<Empleado>,
    private readonly config: ConfigService,
    private readonly bitacora: BitacoraService,
    private readonly sistemaConfig: SistemaConfigService,
  ) {}

  // La cuenta definida en ADMIN_SEED_EMAIL es siempre el administrador del sistema:
  // si no existe se crea con ADMIN_SEED_PASSWORD (solo la primera vez) y si ya existía
  // como administración, pasa a ser del sistema. Sin esto nadie podría administrar accesos.
  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_SEED_EMAIL')?.trim().toLowerCase();
    if (!email) return;
    const existente = await this.usuarioRepo.findOneBy({ email });
    // Recuperación de emergencia (solo quien administra el servidor): si se define
    // SISTEMA_CLAVE_TEMPORAL, esa clave reemplaza la de la cuenta del sistema al arrancar y
    // se debe cambiar al entrar. Después hay que quitar la variable.
    const claveEmergencia = this.config.get<string>('SISTEMA_CLAVE_TEMPORAL');
    if (existente && claveEmergencia) {
      validarPoliticaPassword(claveEmergencia, { email, nombre: existente.nombre });
      await this.usuarioRepo.update(
        { id: existente.id },
        { passwordHash: await bcrypt.hash(claveEmergencia, SALT_ROUNDS), debeCambiarClave: true, claveTemporalVence: null, intentosFallidos: 0, bloqueadoHasta: null, activo: true, totpActivo: false, totpSecreto: null, versionToken: existente.versionToken + 1 },
      );
      await this.bitacora.registrar({ accion: 'clave_restablecida', usuarioEmail: 'servidor', objetivo: email, detalle: 'recuperación de emergencia (SISTEMA_CLAVE_TEMPORAL)' });
    }
    if (existente && existente.rol !== Rol.SISTEMA) {
      await this.usuarioRepo.update({ id: existente.id }, { rol: Rol.SISTEMA, activo: true, versionToken: existente.versionToken + 1 });
      await this.bitacora.registrar({ accion: 'rol_cambiado', usuarioEmail: 'sistema', objetivo: email, detalle: `${existente.rol} → sistema (cuenta del administrador del sistema)` });
    }
  }

  // Sin password_hash a propósito: esta lista la consume la pantalla de
  // administración de cuentas, nunca debe viajar el hash al frontend.
  // Con permisos: para que esa misma pantalla muestre los ajustes
  // puntuales que ya tiene cada quien.
  listar(): Promise<Usuario[]> {
    return this.usuarioRepo.find({
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        creadoEn: true,
        ultimoAcceso: true,
        bloqueadoHasta: true,
        intentosFallidos: true,
        debeCambiarClave: true,
        totpActivo: true,
        empleadoId: true,
      },
      relations: { permisos: true, empleado: true },
      order: { nombre: 'ASC' },
    });
  }

  // Empleados de planilla activos que todavía no tienen cuenta en el sistema.
  empleadosDisponibles(): Promise<Array<Pick<Empleado, 'id' | 'nombre' | 'cedula' | 'puesto'>>> {
    return this.empleadoRepo
      .createQueryBuilder('e')
      .select(['e.id', 'e.nombre', 'e.cedula', 'e.puesto'])
      .where('e.activo = true')
      .andWhere('NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.empleado_id = e.id)')
      .orderBy('e.nombre', 'ASC')
      .getMany();
  }

  buscarPorIdConHash(id: string): Promise<Usuario | null> {
    return this.usuarioRepo.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id }).getOne();
  }

  // Con password_hash y permisos: la usa AuthService para armar la sesión de login.
  // El correo se compara sin distinguir mayúsculas (el índice único sí las distingue).
  buscarPorEmailConPermisos(email: string): Promise<Usuario | null> {
    return this.usuarioRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.permisos', 'p')
      .where('LOWER(u.email) = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  // Sin password_hash, con permisos: la usa JwtStrategy para hidratar request.user.
  buscarPorIdConPermisos(id: string): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({
      where: { id },
      select: COLUMNAS_SESION,
      relations: { permisos: true },
    });
  }

  // Devuelve true si este intento fallido bloqueó la cuenta.
  async registrarLoginFallido(id: string, maxIntentos: number, minutosBloqueo: number): Promise<boolean> {
    const usuario = await this.usuarioRepo.findOneBy({ id });
    if (!usuario) return false;
    usuario.intentosFallidos += 1;
    let bloqueada = false;
    if (usuario.intentosFallidos >= maxIntentos) {
      usuario.bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
      usuario.intentosFallidos = 0;
      bloqueada = true;
    }
    await this.usuarioRepo.save(usuario);
    return bloqueada;
  }

  async registrarLoginExitoso(id: string): Promise<void> {
    await this.usuarioRepo.update({ id }, { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() });
  }

  private async existeCorreo(email: string, exceptoId?: string): Promise<boolean> {
    const qb = this.usuarioRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: email.trim().toLowerCase() });
    if (exceptoId) qb.andWhere('u.id <> :id', { id: exceptoId });
    return (await qb.getCount()) > 0;
  }

  private async vencimientoClaveTemporal(): Promise<Date> {
    return new Date(Date.now() + (await this.sistemaConfig.get<number>('seguridad.clave_temporal_horas')) * 3_600_000);
  }

  // Crea una cuenta de acceso. Con empleadoId toma el nombre del empleado y la vincula.
  // Devuelve la clave temporal una sola vez cuando la generó el sistema.
  // Solo puede haber un gerente general activo.
  private async exigirUnicoGerenteGeneral(exceptoId?: string): Promise<void> {
    const qb = this.usuarioRepo.createQueryBuilder('u').where('u.rol = :rol AND u.activo = true', { rol: Rol.GERENTE_GENERAL });
    if (exceptoId) qb.andWhere('u.id <> :id', { id: exceptoId });
    if ((await qb.getCount()) > 0) {
      throw new ConflictException('Ya hay un gerente general activo. Cambiale el perfil o desactivalo antes de asignar otro.');
    }
  }

  async crear(dto: CrearUsuarioDto, actor: { id: string; email: string }, ip?: string): Promise<{ usuario: Usuario; passwordTemporal: string; venceEn: Date | null }> {
    const email = dto.email.trim().toLowerCase();
    if (await this.existeCorreo(email)) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }
    if (dto.rol === Rol.GERENTE_GENERAL) await this.exigirUnicoGerenteGeneral();
    let nombre = dto.nombre?.trim();
    let empleadoId: string | null = null;
    if (dto.empleadoId) {
      const empleado = await this.empleadoRepo.findOneBy({ id: dto.empleadoId });
      if (!empleado) throw new NotFoundException('El empleado no existe.');
      if (!empleado.activo) throw new BadRequestException('Ese empleado ya no trabaja en la empresa: no se le puede crear acceso.');
      if (await this.usuarioRepo.exists({ where: { empleadoId: empleado.id } })) {
        throw new ConflictException('Ese empleado ya tiene una cuenta de acceso.');
      }
      empleadoId = empleado.id;
      nombre = nombre || empleado.nombre;
    }
    if (!nombre) throw new BadRequestException('Indicá el nombre de la persona o elegí un empleado.');

    // La clave del primer ingreso no pasa por la política de contraseñas: es temporal, la persona debe
    // cambiarla (y esa sí cumple la política) y vence si no se usa.
    const password = dto.password ?? generarPasswordTemporal(await this.sistemaConfig.get<number>('seguridad.clave_largo_minimo'));

    const usuario = this.usuarioRepo.create({
      nombre,
      email,
      passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      rol: dto.rol,
      empleadoId,
      // La clave la definió quien administra los accesos: la persona la cambia al entrar.
      debeCambiarClave: true,
      claveTemporalVence: await this.vencimientoClaveTemporal(),
    });
    const guardado = sanear(await this.usuarioRepo.save(usuario));
    await this.bitacora.registrar({
      accion: 'usuario_creado',
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      objetivo: email,
      detalle: `perfil ${dto.rol}${empleadoId ? ', vinculada a un empleado de planilla' : ', persona externa'}`,
      ip,
    });
    return { usuario: guardado, passwordTemporal: password, venceEn: usuario.claveTemporalVence };
  }

  // La cuenta del administrador del sistema no se desactiva ni cambia de perfil desde la app
  // (ni siquiera ella misma): así nunca queda el sistema sin quien administre los accesos.
  private async buscarGestionable(id: string): Promise<Usuario> {
    const usuario = await this.usuarioRepo.findOneBy({ id });
    if (!usuario) throw new NotFoundException('El usuario no existe.');
    return usuario;
  }

  private exigirNoSistema(usuario: Usuario, accion: string): void {
    if (usuario.rol === Rol.SISTEMA) {
      throw new ForbiddenException(`La cuenta del administrador del sistema no admite esta acción (${accion}).`);
    }
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, actor: { id: string; email: string }, ip?: string): Promise<Usuario> {
    const usuario = await this.buscarGestionable(id);
    if (dto.rol !== undefined && dto.rol !== usuario.rol) this.exigirNoSistema(usuario, 'cambiar de perfil');
    if (dto.activo === false) this.exigirNoSistema(usuario, 'desactivar');
    if (id === actor.id && (dto.activo === false || (dto.rol && dto.rol !== usuario.rol))) {
      throw new ConflictException('No podés desactivar tu propia cuenta ni cambiar tu propio perfil.');
    }
    if ((dto.rol === Rol.GERENTE_GENERAL && usuario.rol !== Rol.GERENTE_GENERAL) || (dto.activo === true && !usuario.activo && usuario.rol === Rol.GERENTE_GENERAL)) {
      await this.exigirUnicoGerenteGeneral(id);
    }
    const antes = { ...usuario };
    const cambios: Partial<Usuario> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (await this.existeCorreo(email, id)) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      cambios.email = email;
    }
    if (dto.rol !== undefined) cambios.rol = dto.rol;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    // Desactivar o cambiar de perfil corta las sesiones abiertas de esa persona.
    if ((dto.activo === false && usuario.activo) || (dto.rol !== undefined && dto.rol !== usuario.rol)) {
      cambios.versionToken = usuario.versionToken + 1;
    }
    Object.assign(usuario, cambios);
    const guardado = sanear(await this.usuarioRepo.save(usuario));

    const quien = { usuarioId: actor.id, usuarioEmail: actor.email, objetivo: usuario.email, ip };
    if (dto.rol !== undefined && dto.rol !== antes.rol) await this.bitacora.registrar({ ...quien, accion: 'rol_cambiado', detalle: `${antes.rol} → ${dto.rol}` });
    if (dto.activo !== undefined && dto.activo !== antes.activo) await this.bitacora.registrar({ ...quien, accion: dto.activo ? 'usuario_activado' : 'usuario_desactivado' });
    if ((dto.nombre !== undefined && dto.nombre !== antes.nombre) || (cambios.email && cambios.email !== antes.email)) {
      await this.bitacora.registrar({ ...quien, accion: 'usuario_editado', detalle: [dto.nombre !== undefined && dto.nombre !== antes.nombre ? 'nombre' : '', cambios.email && cambios.email !== antes.email ? `correo (antes ${antes.email})` : ''].filter(Boolean).join(', ') });
    }
    return guardado;
  }

  // Reemplaza TODOS los ajustes puntuales del usuario por los que vengan
  // en el DTO (lista vacía = volver al set por defecto de su rol). Más
  // simple y predecible que ir agregando/quitando uno por uno desde el
  // frontend.
  async actualizarPermisos(usuarioId: string, dto: ActualizarPermisosDto, actor: { id: string; email: string }, ip?: string): Promise<Usuario> {
    const usuario = await this.buscarGestionable(usuarioId);
    if (usuario.rol === Rol.SISTEMA) {
      throw new BadRequestException('La cuenta del administrador del sistema siempre tiene acceso total: sus permisos no se ajustan.');
    }
    if (usuario.rol === Rol.VENDEDOR) {
      throw new BadRequestException('El vendedor usa su propia pantalla de pedidos: no tiene permisos que ajustar.');
    }

    await this.usuarioPermisoRepo.delete({ usuarioId });
    if (dto.permisos.length > 0) {
      const nuevos = dto.permisos.map((p) =>
        this.usuarioPermisoRepo.create({ usuarioId, permiso: p.permiso, concedido: p.concedido }),
      );
      await this.usuarioPermisoRepo.save(nuevos);
    }
    await this.bitacora.registrar({
      accion: 'permisos_cambiados',
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      objetivo: usuario.email,
      detalle: dto.permisos.length === 0 ? 'vuelve a los permisos de su perfil' : dto.permisos.map((p) => `${p.concedido ? '+' : '−'}${p.permiso}`).join(' '),
      ip,
    });
    return this.buscarPorIdConPermisos(usuarioId) as Promise<Usuario>;
  }

  async cambiarPassword(id: string, dto: CambiarPasswordDto): Promise<Usuario> {
    const usuario = await this.usuarioRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!usuario) {
      throw new NotFoundException('El usuario no existe.');
    }

    const valida = await bcrypt.compare(dto.passwordActual, usuario.passwordHash);
    if (!valida) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }
    if (dto.passwordNueva === dto.passwordActual) {
      throw new ConflictException('La contraseña nueva debe ser distinta de la actual.');
    }
    validarPoliticaPassword(dto.passwordNueva, { email: usuario.email, nombre: usuario.nombre }, await this.sistemaConfig.get<number>('seguridad.clave_largo_minimo'));

    usuario.passwordHash = await bcrypt.hash(dto.passwordNueva, SALT_ROUNDS);
    usuario.debeCambiarClave = false;
    usuario.claveTemporalVence = null;
    usuario.versionToken += 1;
    return this.usuarioRepo.save(usuario);
  }

  // Administración restablece una clave olvidada: genera una temporal, cierra
  // todas las sesiones de esa persona y la obliga a cambiarla al entrar. La
  // clave temporal se devuelve una sola vez, no se guarda en claro.
  async restablecerPassword(id: string, actor: { id: string; email: string }, ip?: string): Promise<{ passwordTemporal: string; venceEn: Date }> {
    const usuario = await this.buscarGestionable(id);
    this.exigirNoSistema(usuario, 'restablecer la clave desde acá; usá "Cambiar contraseña"');
    const passwordTemporal = generarPasswordTemporal(await this.sistemaConfig.get<number>('seguridad.clave_largo_minimo'));
    await this.usuarioRepo.update(
      { id },
      {
        passwordHash: await bcrypt.hash(passwordTemporal, SALT_ROUNDS),
        debeCambiarClave: true,
        claveTemporalVence: await this.vencimientoClaveTemporal(),
        versionToken: usuario.versionToken + 1,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
    );
    await this.bitacora.registrar({ accion: 'clave_restablecida', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: usuario.email, ip });
    return { passwordTemporal, venceEn: await this.vencimientoClaveTemporal() };
  }

  async desbloquear(id: string, actor: { id: string; email: string }, ip?: string): Promise<void> {
    const usuario = await this.buscarGestionable(id);
    await this.usuarioRepo.update({ id }, { intentosFallidos: 0, bloqueadoHasta: null });
    await this.bitacora.registrar({ accion: 'usuario_desbloqueado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: usuario.email, ip });
  }

  // Cierra todas las sesiones abiertas de la persona (tendrá que volver a entrar).
  async cerrarSesiones(id: string, actor: { id: string; email: string }, ip?: string): Promise<void> {
    const usuario = await this.buscarGestionable(id);
    await this.usuarioRepo.update({ id }, { versionToken: usuario.versionToken + 1 });
    await this.bitacora.registrar({ accion: 'sesiones_cerradas', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: usuario.email, ip });
  }

  async registrarAcceso(id: string): Promise<void> {
    await this.usuarioRepo.update({ id }, { ultimoAcceso: new Date() });
  }

  // ---- Verificación en dos pasos ----

  private llave(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  async totpDe(id: string): Promise<{ activo: boolean; secreto: string | null }> {
    const u = await this.usuarioRepo.createQueryBuilder('u').addSelect('u.totpSecreto').where('u.id = :id', { id }).getOne();
    return { activo: !!u?.totpActivo, secreto: u?.totpSecreto ? descifrarSecreto(u.totpSecreto, this.llave()) : null };
  }

  async guardarTotpPendiente(id: string, secreto: string): Promise<void> {
    await this.usuarioRepo.update({ id }, { totpSecreto: cifrarSecreto(secreto, this.llave()), totpActivo: false });
  }

  async activarTotp(id: string): Promise<Usuario> {
    const u = await this.buscarGestionable(id);
    u.totpActivo = true;
    u.versionToken += 1;
    return this.usuarioRepo.save(u);
  }

  async quitarTotp(id: string): Promise<void> {
    const u = await this.buscarGestionable(id);
    await this.usuarioRepo.update({ id }, { totpActivo: false, totpSecreto: null, versionToken: u.versionToken + 1 });
  }

  // El administrador del sistema le quita la verificación en dos pasos a quien perdió su teléfono.
  async reiniciarDosPasos(id: string, actor: { id: string; email: string }, ip?: string): Promise<void> {
    const u = await this.buscarGestionable(id);
    await this.quitarTotp(id);
    await this.bitacora.registrar({ accion: 'dos_pasos_reiniciado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: u.email, ip });
  }
}
