import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { FacturacionService } from './facturacion.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';

// Recurso propio aparte de /facturas — la acción de anular vive en
// POST /facturas/:id/anular (ver FacturasController), esto es solo el
// listado de las notas de crédito ya generadas.
@Modulo('facturacion')
@Controller('notas-credito')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.FACTURACION_GESTIONAR)
export class NotasCreditoController {
  constructor(private readonly facturacionService: FacturacionService) {}

  @Get()
  listar() {
    return this.facturacionService.listarNotasCredito();
  }
}
