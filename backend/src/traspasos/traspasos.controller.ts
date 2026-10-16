import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TraspasosService } from './traspasos.service.js';
import { CrearTraspasoDto } from './dto/crear-traspaso.dto.js';
import { RecibirTraspasoDto } from './dto/recibir-traspaso.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

@Modulo('inventario')
@Controller('traspasos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.TRASPASOS_GESTIONAR)
export class TraspasosController {
  constructor(private readonly traspasosService: TraspasosService) {}

  @Get()
  listar() {
    return this.traspasosService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.traspasosService.buscarPorIdOFallar(id);
  }

  @Post()
  crear(@Body() dto: CrearTraspasoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.traspasosService.crear(dto, usuario.id);
  }

  @Patch(':id/despachar')
  despachar(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.traspasosService.despachar(id, usuario.id);
  }

  @Patch(':id/recibir')
  recibir(@Param('id') id: string, @Body() dto: RecibirTraspasoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.traspasosService.recibir(id, dto, usuario.id);
  }
}
