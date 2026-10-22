import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { Rol } from '../common/enums/rol.enum.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { PosService } from './pos.service.js';
import { OrdenesTiendaService } from './ordenes-tienda.service.js';
import { PruebasPosService } from './pruebas-pos.service.js';
import { PerfilesTiendaService } from './perfiles-tienda.service.js';
import { Req } from '@nestjs/common';
import type { Request } from 'express';
import { ActualizarPerfilTiendaDto, ActualizarPosConfigDto, AnularPosVentaDto, EstadoOrdenDto, NotaOrdenDto, RecibirTiendaDto, RevisarOrdenDto, SincronizarPosDto } from './dto/pos.dto.js';

@Modulo('pos')
@Controller('pos')
@UseGuards(JwtAuthGuard)
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly ordenes: OrdenesTiendaService,
    private readonly pruebas: PruebasPosService,
    private readonly perfiles: PerfilesTiendaService,
  ) {}

  // ---- Terminal de la tienda (cajero, gerencia y administrador del sistema)

  @Get('tiendas')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ENCARGADO_TIENDA, Rol.ADMINISTRACION)
  tiendas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.pos.tiendas(usuario);
  }

  @Get('catalogo/:ubicacionId')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ENCARGADO_TIENDA, Rol.ADMINISTRACION)
  catalogo(@Param('ubicacionId', ParseUUIDPipe) ubicacionId: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pos.catalogo(usuario, ubicacionId);
  }

  @Post('sincronizar')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ENCARGADO_TIENDA, Rol.ADMINISTRACION)
  sincronizar(@Body() dto: SincronizarPosDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pos.sincronizar(usuario, dto);
  }

  // ---- Administración (ventas, cajas, anulaciones y configuración)

  @Get('ventas')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  ventas(@Query() q: Record<string, string>) {
    return this.pos.listar({ desde: q.desde, hasta: q.hasta, ubicacionId: q.ubicacionId, estado: q.estado, pruebas: q.pruebas === '1' });
  }

  @Get('ventas/lineas')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  lineasVentas(@Query() q: Record<string, string>) {
    return this.pos.lineasParaInforme({ desde: q.desde, hasta: q.hasta, ubicacionId: q.ubicacionId, pruebas: q.pruebas === '1' });
  }

  @Get('ventas/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  venta(@Param('id', ParseUUIDPipe) id: string) {
    return this.pos.detalle(id);
  }

  @Post('ventas/:id/anular')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularPosVentaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pos.anular(id, dto.motivo, usuario.id);
  }

  @Get('resumen')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  resumen(@Query() q: Record<string, string>) {
    return this.pos.resumen({ desde: q.desde, hasta: q.hasta, ubicacionId: q.ubicacionId, pruebas: q.pruebas === '1' });
  }

  @Get('cajas')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  cajas(@Query() q: Record<string, string>) {
    return this.pos.cajas({ desde: q.desde, hasta: q.hasta, ubicacionId: q.ubicacionId });
  }

  @Get('configuracion')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  configuracion() {
    return this.pos.configuracionActual();
  }

  // Datos de cada tienda para su tiquete (cédula jurídica, razón social, teléfono…).
  @Get('tiendas-perfil')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  perfilesTienda() {
    return this.perfiles.listar();
  }

  @Patch('tiendas-perfil/:ubicacionId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  actualizarPerfilTienda(@Param('ubicacionId', ParseUUIDPipe) ubicacionId: string, @Body() dto: ActualizarPerfilTiendaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.perfiles.actualizar(ubicacionId, dto, usuario.id);
  }

  @Patch('configuracion')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  actualizarConfiguracion(@Body() dto: ActualizarPosConfigDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pos.actualizarConfiguracion(dto, usuario.rol === Rol.SISTEMA, usuario.id);
  }

  // ---- Pedidos de reposición de las tiendas (llegan desde el POS)

  @Get('ordenes/resumen')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  resumenOrdenes() {
    return this.ordenes.resumen();
  }

  @Get('ordenes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  listarOrdenes(@Query() q: Record<string, string>) {
    return this.ordenes.listar({ estado: q.estado, ubicacionId: q.ubicacionId });
  }

  @Get('ordenes/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  orden(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordenes.detalle(id);
  }

  // 1) La administración confirma que recibió el pedido.
  @Post('ordenes/:id/recibir')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  recibirOrden(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotaOrdenDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.recibir(id, dto.nota, usuario.id);
  }

  // 2) Revisa (aceptado o corregido), fija el costo especial de cada producto y arma el traspaso desde bodega.
  @Post('ordenes/:id/revisar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR, Permiso.TRASPASOS_GESTIONAR)
  revisarOrden(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisarOrdenDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.revisar(id, dto, usuario.id);
  }

  // 3) Bodega lo alista.
  @Post('ordenes/:id/alistar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  alistarOrden(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotaOrdenDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.alistar(id, dto.nota, usuario.id);
  }

  // 4) Sale hacia la tienda (despacha el traspaso).
  @Post('ordenes/:id/enviar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR, Permiso.TRASPASOS_GESTIONAR)
  enviarOrden(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.enviar(id, usuario.id);
  }

  @Post('ordenes/:id/estado')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_GESTIONAR)
  estadoOrden(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EstadoOrdenDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.cerrarSinEnviar(id, dto, usuario.id);
  }

  // 5) La tienda verifica lo que llegó contra lo que dice la orden y lo acepta (genera el asiento).
  @Post('ordenes/:id/recibir-tienda')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ENCARGADO_TIENDA, Rol.ADMINISTRACION)
  recibirEnTienda(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecibirTiendaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.ordenes.recibirEnTienda(usuario, id, dto);
  }

  // ---- Durante las pruebas: borrar los asientos de una venta o pedido y dejarlo como "de prueba" (solo el administrador del sistema)

  @Post('ventas/:id/convertir-prueba')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  convertirVentaEnPrueba(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.pruebas.convertirVenta(id, usuario, req.ip);
  }

  @Post('ordenes/:id/convertir-prueba')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  convertirOrdenEnPrueba(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.pruebas.convertirOrden(id, usuario, req.ip);
  }
}
