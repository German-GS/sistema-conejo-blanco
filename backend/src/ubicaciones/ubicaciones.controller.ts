import { Permiso } from '../common/enums/permiso.enum.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UbicacionesService } from './ubicaciones.service.js';
import { CrearUbicacionDto } from './dto/crear-ubicacion.dto.js';
import { ActualizarUbicacionDto } from './dto/actualizar-ubicacion.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';

@Controller('ubicaciones')
@UseGuards(JwtAuthGuard)
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  // Cualquier cuenta de personal puede consultar ubicaciones (el vendedor
  // las necesita para elegir de dónde sale el pedido). Crear/editar es
  // solo administración.
  @Get()
  listar() {
    return this.ubicacionesService.listar();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_GESTIONAR)
  crear(@Body() dto: CrearUbicacionDto) {
    return this.ubicacionesService.crear(dto);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.INVENTARIO_GESTIONAR)
  actualizar(@Param('id') id: string, @Body() dto: ActualizarUbicacionDto) {
    return this.ubicacionesService.actualizar(id, dto);
  }
}
