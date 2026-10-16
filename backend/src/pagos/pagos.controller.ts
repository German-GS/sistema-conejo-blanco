import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { Rol } from '../common/enums/rol.enum.js';
import { PagosService } from './pagos.service.js';
import { CuentasBancariasService } from './cuentas-bancarias.service.js';
import { ActualizarCuentaBancariaDto, AnularPagoDto, CrearCuentaBancariaDto, CrearPagoDto } from './dto/pagos.dto.js';

@Modulo('pagos')
@Controller('pagos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.CUENTAS_POR_COBRAR_GESTIONAR)
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Get()
  listar(
    @Query('estado') estado?: string,
    @Query('clienteId') clienteId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.pagos.listar({ estado, clienteId, desde, hasta });
  }

  // Facturas a crédito con saldo de un cliente (para elegir a cuáles se aplica el pago).
  @Get('por-cobrar/:clienteId')
  porCobrar(@Param('clienteId', ParseUUIDPipe) clienteId: string) {
    return this.pagos.facturasPorCobrar(clienteId);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagos.detalle(id);
  }

  @Post()
  crear(@Body() dto: CrearPagoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.pagos.crear(dto, usuario.id);
  }

  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularPagoDto) {
    return this.pagos.anular(id, dto);
  }
}

// Las cuentas bancarias las lee quien registra pagos o factura; las
// edita solo Administración.
@Controller('cuentas-bancarias')
@UseGuards(JwtAuthGuard)
export class CuentasBancariasController {
  constructor(private readonly cuentas: CuentasBancariasService) {}

  @Get()
  listar(@Query('activas') activas?: string) {
    return this.cuentas.listar(activas === 'true');
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  crear(@Body() dto: CrearCuentaBancariaDto) {
    return this.cuentas.crear(dto);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCuentaBancariaDto) {
    return this.cuentas.actualizar(id, dto);
  }
}
