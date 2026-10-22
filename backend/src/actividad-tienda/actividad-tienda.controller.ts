import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { ActividadTiendaService } from './actividad-tienda.service.js';

@Modulo('pos')
@Controller('pos/actividad')
@UseGuards(JwtAuthGuard)
export class ActividadTiendaController {
  constructor(private readonly actividad: ActividadTiendaService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.POS_VER)
  listar(@Query() q: Record<string, string>) {
    return this.actividad.listar({ desde: q.desde, hasta: q.hasta, ubicacionId: q.ubicacionId, tipo: q.tipo, texto: q.texto, origen: q.origen, limite: q.limite ? Number(q.limite) || undefined : undefined });
  }
}
