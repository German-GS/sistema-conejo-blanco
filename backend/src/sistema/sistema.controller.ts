import { Body, Controller, Get, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { OcultarSiNoAutorizado, RequireRole } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import { ActividadService, type FiltroActividad } from './actividad.service.js';
import { ConexionesService } from './conexiones.service.js';
import { ExportacionService } from './exportacion.service.js';
import { SaludService } from './salud.service.js';
import { MetricasService } from './metricas.service.js';
import { ETIQUETA_MODULO, MODULOS, SistemaConfigService } from './sistema-config.service.js';
import { ActualizarAjusteDto } from './dto/ajuste.dto.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Todo lo de acá es EXCLUSIVO del administrador del sistema (registros de actividad, salud,
// políticas, módulos, mantenimiento, exportación). Ningún otro perfil lo ve ni sabe que existe.
@OcultarSiNoAutorizado()
@Controller('sistema')
@UseGuards(JwtAuthGuard)
export class SistemaController {
  constructor(
    private readonly config: SistemaConfigService,
    private readonly actividad: ActividadService,
    private readonly salud: SaludService,
    private readonly metricas: MetricasService,
    private readonly exportacion: ExportacionService,
    private readonly bitacora: BitacoraService,
    private readonly conexiones: ConexionesService,
  ) {}

  // Lo único que ve cualquier cuenta: qué módulos están habilitados y el tiempo de inactividad.
  @Get('publico')
  async publico() {
    return {
      modulos: Object.fromEntries(await Promise.all(MODULOS.map(async (m) => [m, await this.config.moduloActivo(m)]))),
      inactividadMinutos: await this.config.get<number>('seguridad.inactividad_minutos'),
      claveLargoMinimo: await this.config.get<number>('seguridad.clave_largo_minimo'),
      mantenimiento: await this.config.enMantenimiento(),
    };
  }

  @Get('salud')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  estado() {
    return this.salud.estado();
  }

  // Hardware (CPU, memoria, swap, disco), latencia, errores HTTP, inicios de sesión y uso de privilegios.
  @Get('metricas')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  instantanea(@Query('minutos') minutos?: string) {
    return this.metricas.instantanea(Number(minutos) || 60);
  }

  @Get('conexiones')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  verConexiones() {
    return this.conexiones.listar();
  }

  @Post('integridad/ejecutar')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  ejecutarIntegridad() {
    return this.salud.verificarIntegridad('manual');
  }

  @Get('actividad')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  listarActividad(@Query() q: Record<string, string>) {
    return this.actividad.listar(this.filtro(q));
  }

  @Get('actividad/excel')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async actividadExcel(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.actividad.exportar(this.filtro(q));
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="actividad-${q.area ?? 'todo'}-${new Date().toISOString().slice(0, 10)}.xlsx"` });
    return new StreamableFile(buffer);
  }

  @Get('configuracion')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async configuracion() {
    return { ajustes: await this.config.todos(), modulos: MODULOS.map((m) => ({ clave: m, etiqueta: ETIQUETA_MODULO[m] })) };
  }

  @Patch('configuracion')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async actualizarConfiguracion(@Body() dto: ActualizarAjusteDto, @CurrentUser() usuario: UsuarioAutenticado) {
    const antes = await this.config.get(dto.clave);
    await this.config.set(dto.clave, dto.valor);
    await this.bitacora.registrar({ accion: 'usuario_editado', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: `ajuste ${dto.clave}`, detalle: `${JSON.stringify(antes)} → ${JSON.stringify(dto.valor)}` });
    return { ok: true };
  }

  @Get('exportar')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async exportar(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.exportacion.exportarTodo();
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="datos-conejo-blanco-${new Date().toISOString().slice(0, 10)}.xlsx"` });
    return new StreamableFile(buffer);
  }

  private filtro(q: Record<string, string>): FiltroActividad {
    return { desde: q.desde, hasta: q.hasta, area: q.area, metodo: q.metodo, estado: q.estado, texto: q.texto, pagina: q.pagina ? Number(q.pagina) : undefined, limite: q.limite ? Number(q.limite) : undefined };
  }
}
