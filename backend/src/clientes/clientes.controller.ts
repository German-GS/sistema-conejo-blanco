import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClientesService } from './clientes.service.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';

// Cualquier cuenta de personal autenticada puede CONSULTAR clientes (el
// vendedor los busca al armar un pedido). Crear/editar es exclusivo de
// quien tenga clientes.gestionar — el vendedor no da de alta clientes
// directamente (ver flujo de clientePendiente en PedidosService), y
// desde acá también se asigna el descuento por cliente, que solo
// administración debe poder tocar.
@Controller('clientes')
@UseGuards(JwtAuthGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  listar(@Query('buscar') buscar?: string) {
    if (buscar && buscar.trim().length > 0) {
      return this.clientesService.buscar(buscar.trim());
    }
    return this.clientesService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.clientesService.buscarPorIdOFallar(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CLIENTES_GESTIONAR)
  crear(@Body() dto: CrearClienteDto) {
    return this.clientesService.crear(dto);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CLIENTES_GESTIONAR)
  actualizar(@Param('id') id: string, @Body() dto: ActualizarClienteDto) {
    return this.clientesService.actualizar(id, dto);
  }

  // Eliminar un cliente (solo si nunca tuvo movimientos): gerencia y administrador del sistema.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ADMINISTRACION)
  async eliminar(@Param('id', ParseUUIDPipe) id: string) {
    await this.clientesService.eliminar(id);
    return { eliminado: true };
  }
}
