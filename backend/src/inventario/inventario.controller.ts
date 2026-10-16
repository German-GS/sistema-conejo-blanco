import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InventarioService } from './inventario.service.js';
import { IngresoInventarioDto } from './dto/ingreso-inventario.dto.js';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

@Modulo('inventario')
@Controller('inventario')
@UseGuards(JwtAuthGuard)
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get('stock')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_VER)
  listarStock(@Query('ubicacionId') ubicacionId?: string, @Query('varianteId') varianteId?: string) {
    return this.inventarioService.listarStock({ ubicacionId, varianteId });
  }

  @Get('kardex')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_VER)
  listarKardex(@Query('ubicacionId') ubicacionId?: string, @Query('varianteId') varianteId?: string) {
    return this.inventarioService.listarKardex({ ubicacionId, varianteId });
  }

  @Post('ingreso')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_GESTIONAR)
  ingreso(@Body() dto: IngresoInventarioDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.inventarioService.ingresoManual(dto.ubicacionId, dto.varianteId, dto.cantidad, usuario.id);
  }

  @Post('ajuste')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_GESTIONAR)
  ajuste(@Body() dto: AjusteInventarioDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.inventarioService.ajuste(dto.ubicacionId, dto.varianteId, dto.cantidad, dto.tipo, usuario.id);
  }
}
