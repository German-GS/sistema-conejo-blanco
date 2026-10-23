import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PedidosService, type EstadoListadoPedido } from './pedidos.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { EditarPedidoLineasDto } from './dto/editar-pedido-lineas.dto.js';
import { CrearClienteDto } from '../clientes/dto/crear-cliente.dto.js';
import { VincularClienteDto } from './dto/vincular-cliente.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import type { Provincia } from '../common/enums/provincia.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

@Controller('pedidos')
@UseGuards(JwtAuthGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  // Quien tenga el permiso pedidos.ver (administración, contador,
  // asistente) ve TODOS los pedidos, filtrables por cliente/estado/fecha/
  // provincia (ver PedidosPage); un vendedor solo ve los suyos, con los
  // mismos filtros disponibles.
  @Get()
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: EstadoListadoPedido,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('provincia') provincia?: Provincia,
  ) {
    const filtros = { clienteId, estado, desde, hasta, provincia };
    if (usuario.permisos.has(Permiso.PEDIDOS_VER)) {
      return this.pedidosService.listar(filtros);
    }
    return this.pedidosService.listar({ ...filtros, vendedorId: usuario.id });
  }

  // Un vendedor solo puede abrir sus propios pedidos; ver los de otros
  // requiere pedidos.ver (mismo criterio que el listado).
  @Get(':id')
  async buscarPorId(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    const pedido = await this.pedidosService.buscarPorIdOFallar(id);
    if (!usuario.permisos.has(Permiso.PEDIDOS_VER) && pedido.vendedorId !== usuario.id) {
      throw new ForbiddenException('No tiene acceso a este pedido.');
    }
    return pedido;
  }

  // El vendedor autenticado queda como dueño del pedido — nunca se acepta
  // un vendedorId desde el body, para que nadie registre un pedido a
  // nombre de otro vendedor.
  @Post()
  crear(@Body() dto: CrearPedidoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pedidosService.crear(dto, usuario.id);
  }

  @Patch(':id/anular')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.PEDIDOS_GESTIONAR)
  anular(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pedidosService.anular(id, usuario.id);
  }

  // Corregir líneas por un faltante en bodega, un error de tipeo, etc.
  // Mismo permiso que anular: quien puede gestionar pedidos, puede editarlos.
  @Patch(':id/lineas')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.PEDIDOS_GESTIONAR)
  editarLineas(
    @Param('id') id: string,
    @Body() dto: EditarPedidoLineasDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pedidosService.editarLineas(id, dto, usuario.id);
  }

  @Get(':id/ediciones')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.PEDIDOS_GESTIONAR)
  listarEdiciones(@Param('id') id: string) {
    return this.pedidosService.listarEdiciones(id);
  }

  // Registrar/vincular un cliente real todavía queda exclusivo de
  // Administración: crea un registro permanente de Cliente, no es algo
  // que se delegue por ahora.
  @Post(':id/cliente')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CLIENTES_GESTIONAR)
  registrarCliente(@Param('id') id: string, @Body() dto: CrearClienteDto) {
    return this.pedidosService.registrarCliente(id, dto);
  }

  @Patch(':id/cliente')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CLIENTES_GESTIONAR)
  vincularClienteExistente(@Param('id') id: string, @Body() dto: VincularClienteDto) {
    return this.pedidosService.vincularClienteExistente(id, dto.clienteId);
  }
}
