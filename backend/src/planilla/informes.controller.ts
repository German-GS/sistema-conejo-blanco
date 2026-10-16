import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermisosMetodoGuard } from '../auth/guards/permisos-metodo.guard.js';
import { PermisosPorMetodo } from '../auth/decorators/permisos-metodo.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { InformesService } from './informes.service.js';

// Informes de planilla: salarios. Se consultan con planilla.ver.
@Modulo('planilla')
@Controller('planilla/informes')
@UseGuards(JwtAuthGuard, PermisosMetodoGuard)
@PermisosPorMetodo(Permiso.PLANILLA_VER, Permiso.PLANILLA_GESTIONAR)
export class InformesController {
  constructor(private readonly informes: InformesService) {}

  @Get(':tipo')
  generar(@Param('tipo') tipo: string, @Query('desde') desde = '', @Query('hasta') hasta = '') {
    return this.informes.generar(tipo, desde, hasta);
  }

  @Get(':tipo/excel')
  async excel(
    @Param('tipo') tipo: string,
    @Query('desde') desde = '',
    @Query('hasta') hasta = '',
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.informes.exportar(tipo, desde, hasta);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="informe-${tipo}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }
}
