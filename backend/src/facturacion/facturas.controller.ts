import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { FacturacionService } from './facturacion.service.js';
import { AnularFacturaDto } from './dto/anular-factura.dto.js';
import { CrearFacturaManualDto } from './dto/crear-factura-manual.dto.js';
import { FacturaManualService } from './factura-manual.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { Provincia } from '../common/enums/provincia.enum.js';
import { CategoriaFactura } from '../common/enums/categoria-factura.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

type Vencimiento = 'vencidas' | 'proximos_7' | 'proximos_30';

// Aparte de FacturacionController (que vive bajo /pedidos porque
// "facturar" es una acción sobre un pedido) — esto es consultar el
// listado de facturas ya emitidas, un recurso propio.
@Modulo('facturacion')
@Controller('facturas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.FACTURACION_GESTIONAR)
export class FacturasController {
  constructor(
    private readonly facturacionService: FacturacionService,
    private readonly facturaManualService: FacturaManualService,
  ) {}

  // Todas las facturas, con categoría de cobro calculada (cancelada =
  // pagada / pendiente / anulada) — filtrable por esa categoría, cliente,
  // provincia y (dentro de pendientes) por qué tan cerca está de vencer.
  // Ver FacturacionService.listarFacturas.
  @Get()
  listar(
    @Query('estado') estado?: CategoriaFactura,
    @Query('clienteId') clienteId?: string,
    @Query('provincia') provincia?: Provincia,
    @Query('vencimiento') vencimiento?: Vencimiento,
  ) {
    return this.facturacionService.listarFacturas({ estado, clienteId, provincia, vencimiento });
  }

  // Ventas facturadas por mes (últimos `meses`, contado vs crédito) —
  // para el gráfico de rendimiento del dashboard.
  @Get('resumen-mensual')
  resumenMensual(@Query('meses') meses?: string) {
    const n = Number(meses);
    const cantidad = Number.isInteger(n) && n >= 1 && n <= 24 ? n : 6;
    return this.facturacionService.resumenMensual(cantidad);
  }

  // Factura hecha a mano (sin pedido) — ver FacturaManualService.
  @Post('manual')
  crearManual(@Body() dto: CrearFacturaManualDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.facturaManualService.crear(dto, usuario.id);
  }

  // Para ver/imprimir cualquier factura con el mismo formato.
  @Get(':id/documento')
  documento(@Param('id') id: string) {
    return this.facturaManualService.documento(id);
  }

  // Anula una factura ya emitida generando su Nota de Crédito — ver
  // FacturacionService.anularFactura. Requiere motivo.
  @Post(':id/anular')
  anular(@Param('id') id: string, @Body() dto: AnularFacturaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.facturacionService.anularFactura(id, dto.motivo, usuario.id);
  }

  // Mismo listado filtrado, como .xlsx descargable.
  @Get('exportar')
  async exportar(
    @Res() res: Response,
    @Query('estado') estado?: CategoriaFactura,
    @Query('clienteId') clienteId?: string,
    @Query('provincia') provincia?: Provincia,
    @Query('vencimiento') vencimiento?: Vencimiento,
  ) {
    const buffer = await this.facturacionService.generarExcelFacturas({ estado, clienteId, provincia, vencimiento });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="facturas.xlsx"',
    });
    res.send(buffer);
  }
}
