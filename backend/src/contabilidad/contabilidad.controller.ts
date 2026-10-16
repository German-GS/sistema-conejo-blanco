import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ContabilidadService } from './contabilidad.service.js';
import { ReportesContablesService } from './reportes-contables.service.js';
import { CierreFiscalService } from './cierre-fiscal.service.js';
import { CierreMensualService } from './cierre-mensual.service.js';
import { LibroMayorService } from './libro-mayor.service.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole, RequireRoleStrict } from '../auth/decorators/roles.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import { IntegridadService } from './integridad.service.js';
import { ActualizarCuentaContableDto, ActualizarParametroFiscalDto, CerrarAnioFiscalDto, CerrarPeriodoDto, CrearAsientoManualDto, CrearCuentaContableDto, ReversarAsientoDto } from './dto/contabilidad.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { Permiso } from '../common/enums/permiso.enum.js';

// Ver: contabilidad.ver. Crear cuentas y asientos manuales:
// contabilidad.gestionar. Los asientos automáticos (ventas, pagos,
// planilla) los generan los demás módulos, no se crean desde acá.
@Modulo('contabilidad')
@Controller('contabilidad')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.CONTABILIDAD_VER)
export class ContabilidadController {
  constructor(
    private readonly contabilidadService: ContabilidadService,
    private readonly reportes: ReportesContablesService,
    private readonly integridad: IntegridadService,
    private readonly mayor: LibroMayorService,
    private readonly cierre: CierreMensualService,
    private readonly fiscal: CierreFiscalService,
  ) {}

  // Revisa que los datos guardados cumplan las reglas de cálculo (asientos
  // cuadrados, totales de pedidos/facturas, saldos, inventario, planilla).
  @Get('integridad')
  verificarIntegridad() {
    return this.integridad.verificar();
  }

  @Get('cuentas')
  listarCuentas() {
    return this.contabilidadService.listarCuentas();
  }

  @Post('cuentas')
  @RequirePermissions(Permiso.CONTABILIDAD_GESTIONAR)
  crearCuenta(@Body() dto: CrearCuentaContableDto) {
    return this.contabilidadService.crearCuenta(dto);
  }

  @Patch('cuentas/:id')
  @RequirePermissions(Permiso.CONTABILIDAD_GESTIONAR)
  actualizarCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCuentaContableDto) {
    return this.contabilidadService.actualizarCuenta(id, dto);
  }

  @Get('asientos')
  listarAsientos(@Query('limite') limite?: string) {
    return this.contabilidadService.listarAsientos(limite ? Number(limite) : undefined);
  }

  @Post('asientos')
  @RequirePermissions(Permiso.CONTABILIDAD_GESTIONAR)
  crearAsiento(@Body() dto: CrearAsientoManualDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.contabilidadService.crearAsientoManual(dto, usuario.id);
  }

  @Post('asientos/:id/reversar')
  @RequirePermissions(Permiso.CONTABILIDAD_GESTIONAR)
  reversar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReversarAsientoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.contabilidadService.reversarAsiento(id, dto.motivo, usuario.id);
  }

  // Libro mayor: una cuenta (cuentaId) o todas las que tengan movimiento.
  @Get('mayor')
  libroMayor(@Query('desde') desde = '', @Query('hasta') hasta = '', @Query('cuentaId') cuentaId?: string) {
    return this.mayor.generar(desde, hasta, cuentaId || undefined);
  }

  @Get('mayor/excel')
  async libroMayorExcel(
    @Query('desde') desde = '',
    @Query('hasta') hasta = '',
    @Query('cuentaId') cuentaId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.mayor.exportar(desde, hasta, cuentaId || undefined);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="libro-mayor-${desde}-a-${hasta}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  // Cierre de meses: bloquea registrar asientos en un mes ya cerrado. Solo Administración.
  @Get('periodos')
  periodos() {
    return this.contabilidadService.listarPeriodosCerrados();
  }

  // Vista previa del cierre: lo que se pagaría a CCSS, INS y Hacienda con los asientos del mes.
  @Get('periodos/:periodo/vista-previa')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  vistaPreviaCierre(@Param('periodo') periodo: string) {
    return this.cierre.vistaPrevia(periodo);
  }

  // Cierre mensual (manual, normalmente al pagar la D-150): genera los asientos de pago y bloquea el mes.
  @Post('periodos/:periodo/cerrar')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  cerrarPeriodo(@Param('periodo') periodo: string, @Body() dto: CerrarPeriodoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.cierre.cerrar(periodo, usuario.id, dto);
  }

  // Reabrir un mes ya cerrado es lo más delicado de la contabilidad: solo el administrador del sistema.
  @Post('periodos/:periodo/reabrir')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async reabrirPeriodo(@Param('periodo') periodo: string) {
    await this.cierre.reabrir(periodo);
    return { ok: true };
  }

  // ---- Cierre fiscal (año enero–diciembre): provisión de renta + saldo de resultados ----
  @Get('cierre-fiscal')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  cierresFiscales() {
    return this.fiscal.listarCierres();
  }

  @Get('cierre-fiscal/parametros')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  parametrosFiscales() {
    return this.fiscal.listarParametros();
  }

  // Parámetros de ley (tarifas y tramos de renta): solo el gerente general o el administrador del sistema.
  @Patch('cierre-fiscal/parametros/:clave')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.GERENTE_GENERAL)
  actualizarParametroFiscal(@Param('clave') clave: string, @Body() dto: ActualizarParametroFiscalDto) {
    return this.fiscal.actualizarParametro(clave, dto.valor);
  }

  @Get('cierre-fiscal/:anio/vista-previa')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  vistaPreviaFiscal(@Param('anio', ParseIntPipe) anio: number, @Query('ajusteFiscal') ajuste?: string) {
    return this.fiscal.vistaPrevia(anio, ajuste ? Number(ajuste) || 0 : 0);
  }

  @Post('cierre-fiscal/:anio/cerrar')
  @RequirePermissions(Permiso.CIERRES_GESTIONAR)
  cerrarAnioFiscal(@Param('anio', ParseIntPipe) anio: number, @Body() dto: CerrarAnioFiscalDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.fiscal.cerrar(anio, usuario.id, dto);
  }

  @Post('cierre-fiscal/:anio/reabrir')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  async reabrirAnioFiscal(@Param('anio', ParseIntPipe) anio: number) {
    await this.fiscal.reabrir(anio);
    return { ok: true };
  }

  @Get('diario')
  diario(@Query('desde') desde = '', @Query('hasta') hasta = '') {
    return this.reportes.diario(desde, hasta);
  }

  // tipo: balance-comprobacion | estado-resultados | balance-general | mayor
  @Get('reportes/:tipo')
  reporte(@Param('tipo') tipo: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('cuentaId') cuentaId?: string) {
    return this.reportes.generar(tipo, { desde, hasta, cuentaId });
  }

  @Get('reportes/:tipo/excel')
  async reporteExcel(
    @Param('tipo') tipo: string,
    @Res({ passthrough: true }) res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('cuentaId') cuentaId?: string,
  ) {
    const buffer = await this.reportes.exportar(tipo, { desde, hasta, cuentaId });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contabilidad-${tipo}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }
}
