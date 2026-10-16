import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { FacturacionService } from './facturacion.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';

// Vive bajo /pedidos a propósito, igual que /pedidos/:id/cliente —
// facturar es una acción sobre un pedido concreto, no un recurso aparte.
@Modulo('facturacion')
@Controller('pedidos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.FACTURACION_GESTIONAR)
export class FacturacionController {
  constructor(private readonly facturacionService: FacturacionService) {}

  @Post(':id/facturar')
  facturar(@Param('id') id: string) {
    return this.facturacionService.facturarPedido(id);
  }
}
