import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsuariosService } from './usuarios.service.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { ActualizarPermisosDto } from './dto/actualizar-permisos.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { OcultarSiNoAutorizado, RequireRole } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { Rol } from '../common/enums/rol.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

// Control de accesos: crear cuentas, perfiles, permisos, claves, bloqueos y la
// bitácora. Es EXCLUSIVO del administrador del sistema — ni la gerencia
// (rol administración) puede entrar acá, y no se delega por permisos.
@OcultarSiNoAutorizado()
@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRole(Rol.SISTEMA)
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly bitacora: BitacoraService,
  ) {}

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  // Empleados de planilla activos sin cuenta: de ahí se toman los datos para crear un acceso.
  @Get('empleados-disponibles')
  empleadosDisponibles() {
    return this.usuariosService.empleadosDisponibles();
  }

  @Get('bitacora')
  verBitacora(@Query('limite') limite?: string, @Query('accion') accion?: string, @Query('texto') texto?: string) {
    return this.bitacora.listar({ limite: limite ? Number(limite) || undefined : undefined, accion, texto });
  }

  @Get('bitacora/excel')
  async bitacoraExcel(@Query('accion') accion: string | undefined, @Query('texto') texto: string | undefined, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.bitacora.exportar({ accion, texto });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bitacora-accesos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() actor: UsuarioAutenticado, @Req() req: Request) {
    return this.usuariosService.crear(dto, actor, req.ip);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarUsuarioDto,
    @CurrentUser() actor: UsuarioAutenticado,
    @Req() req: Request,
  ) {
    return this.usuariosService.actualizar(id, dto, actor, req.ip);
  }

  @Patch(':id/permisos')
  actualizarPermisos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPermisosDto,
    @CurrentUser() actor: UsuarioAutenticado,
    @Req() req: Request,
  ) {
    return this.usuariosService.actualizarPermisos(id, dto, actor, req.ip);
  }

  @Post(':id/restablecer-clave')
  restablecerClave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado, @Req() req: Request) {
    return this.usuariosService.restablecerPassword(id, actor, req.ip);
  }

  @Post(':id/desbloquear')
  async desbloquear(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado, @Req() req: Request) {
    await this.usuariosService.desbloquear(id, actor, req.ip);
    return { ok: true };
  }

  @Post(':id/reiniciar-dos-pasos')
  async reiniciarDosPasos(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado, @Req() req: Request) {
    await this.usuariosService.reiniciarDosPasos(id, actor, req.ip);
    return { ok: true };
  }

  @Post(':id/cerrar-sesiones')
  async cerrarSesiones(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado, @Req() req: Request) {
    await this.usuariosService.cerrarSesiones(id, actor, req.ip);
    return { ok: true };
  }
}
