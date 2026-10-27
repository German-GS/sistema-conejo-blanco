import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { EXTENSION_POR_MIME, verificarArchivoSubido } from '../common/utils/subida.util.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage, memoryStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { Rol } from '../common/enums/rol.enum.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { PermisosMetodoGuard } from '../auth/guards/permisos-metodo.guard.js';
import { PermisosPorMetodo } from '../auth/decorators/permisos-metodo.decorator.js';
import { AnomaliasService } from './anomalias.service.js';
import { ColillaService } from './colilla.service.js';
import { ParametrosService } from './parametros.service.js';
import { EmpleadosService } from './empleados.service.js';
import { AsistenciaService } from './asistencia.service.js';
import { PlanillasService } from './planillas.service.js';
import { CARPETA_JUSTIFICANTES } from './asistencia.service.js';
import { BancoPopularService } from './banco-popular.service.js';
import { PuestosService } from './puestos.service.js';
import { ActualizarBancoPopularDto } from './dto/banco-popular.dto.js';
import { GuardarPuestoDto } from './dto/puesto.dto.js';
import { RegistrarHorasManualesDto, RegistrarMarcasManualesDto } from './dto/horas-manuales.dto.js';
import { CrearEmpleadoDto, ActualizarEmpleadoDto, CesarEmpleadoDto, CrearDeudaDto } from './dto/empleado.dto.js';
import { CambiarEstadoAnomaliaDto, CrearAnomaliaDto, ViaticosDto, ActualizarParametroDto, CrearFeriadoDto, ResolverDiaDto, CrearPlanillaDto, AprobarPlanillaDto, PagarPlanillaDto, MotivoPlanillaDto } from './dto/otros.dto.js';
import type { Mapeo } from './lector-excel.js';
import { TipoParametroPlanilla, type EstadoDia } from './planilla.enums.js';

const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024;

if (!existsSync(CARPETA_JUSTIFICANTES)) mkdirSync(CARPETA_JUSTIFICANTES, { recursive: true });
const TIPOS_JUSTIFICANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const NOMBRE_JUSTIFICANTE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/;

const opcionesArchivo = {
  storage: memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_ARCHIVO },
  fileFilter: (_req: unknown, archivo: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!/\.xlsx?$/i.test(archivo.originalname)) {
      cb(new BadRequestException('Solo se aceptan archivos de Excel (.xls o .xlsx).'), false);
      return;
    }
    cb(null, true);
  },
};

// Planilla maneja salarios: consultar pide planilla.ver y cambiar pide planilla.gestionar (el
// administrador del sistema asigna estos permisos por cuenta).
@Modulo('planilla')
@Controller('planilla')
@UseGuards(JwtAuthGuard, PermisosMetodoGuard)
@PermisosPorMetodo(Permiso.PLANILLA_VER, Permiso.PLANILLA_GESTIONAR)
export class PlanillaController {
  constructor(
    private readonly parametros: ParametrosService,
    private readonly empleados: EmpleadosService,
    private readonly asistencia: AsistenciaService,
    private readonly planillas: PlanillasService,
    private readonly bancoPopular: BancoPopularService,
    private readonly puestos: PuestosService,
    private readonly colillas: ColillaService,
    private readonly anomalias: AnomaliasService,
  ) {}

  // ---- Parámetros y feriados ----
  @Get('parametros')
  listarParametros() {
    return this.parametros.listar();
  }

  @Patch('parametros/:id')
  async actualizarParametro(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarParametroDto, @CurrentUser() usuario: UsuarioAutenticado) {
    const parametro = await this.parametros.actualizar(id, dto.valor, usuario.rol === Rol.GERENTE_GENERAL || usuario.rol === Rol.SISTEMA);
    // Las reglas de jornada cambian cómo se leen las marcas: los días que nadie resolvió se vuelven a calcular.
    if (parametro.tipo === TipoParametroPlanilla.JORNADA) await this.asistencia.recalcularTodos();
    return parametro;
  }

  @Get('feriados')
  listarFeriados() {
    return this.parametros.listarFeriados();
  }

  @Post('feriados')
  crearFeriado(@Body() dto: CrearFeriadoDto) {
    return this.parametros.crearFeriado(dto);
  }

  @Delete('feriados/:id')
  async eliminarFeriado(@Param('id', ParseUUIDPipe) id: string) {
    await this.parametros.eliminarFeriado(id);
    return { ok: true };
  }

  // ---- Horario de la fábrica (por día) ----
  @Get('horario-base')
  horarioBase() {
    return this.parametros.horarioBase();
  }

  @Patch('horario-base')
  async actualizarHorarioBase(@Body() cuerpo: Record<string, unknown>) {
    const horario = await this.parametros.actualizarHorarioBase(cuerpo);
    // Los días ya importados que nadie resolvió a mano se vuelven a calcular con el horario nuevo.
    const recalculados = await this.asistencia.recalcularTodos();
    return { horario, recalculados };
  }

  // ---- Puestos de trabajo ----
  @Get('puestos')
  listarPuestos() {
    return this.puestos.listar();
  }

  @Post('puestos')
  crearPuesto(@Body() dto: GuardarPuestoDto) {
    return this.puestos.crear(dto.nombre ?? '', dto.esConfianza ?? false, dto.sector);
  }

  @Patch('puestos/:id')
  actualizarPuesto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarPuestoDto) {
    return this.puestos.actualizar(id, dto);
  }

  // ---- Banco Popular (planilla web) ----
  @Get('banco-popular/config')
  configBancoPopular() {
    return this.bancoPopular.obtenerConfig();
  }

  @Patch('banco-popular/config')
  actualizarConfigBancoPopular(@Body() dto: ActualizarBancoPopularDto) {
    return this.bancoPopular.actualizarConfig(dto);
  }

  // ---- Empleados y deudas ----
  @Get('empleados')
  listarEmpleados() {
    return this.empleados.listar();
  }

  // Importar empleados desde un Excel. Con aplicar=true se guardan los cambios; sin él solo se muestra
  // la vista previa (qué se crearía, qué cambiaría y qué está mal).
  @Post('empleados/importar')
  @UseInterceptors(FileInterceptor('archivo', opcionesArchivo))
  importarEmpleados(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('aplicar') aplicar?: string,
    @Body('decisiones') decisionesJson?: string,
  ) {
    if (!archivo) throw new BadRequestException('No se recibió ningún archivo.');
    let decisiones = {};
    try {
      decisiones = decisionesJson ? JSON.parse(decisionesJson) : {};
    } catch {
      throw new BadRequestException('Las decisiones no son válidas.');
    }
    return this.empleados.importarDesdeExcel(archivo.buffer, aplicar === 'true', usuario, decisiones);
  }

  @Post('empleados')
  crearEmpleado(@Body() dto: CrearEmpleadoDto) {
    return this.empleados.crear(dto);
  }

  // Solo el administrador del sistema: borra al empleado con todo su historial (datos de prueba).
  @Delete('empleados/:id')
  eliminarEmpleado(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.empleados.eliminarConHistorial(id, usuario);
  }

  @Patch('empleados/:id')
  actualizarEmpleado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarEmpleadoDto) {
    return this.empleados.actualizar(id, dto);
  }

  @Post('empleados/:id/cesar')
  cesarEmpleado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CesarEmpleadoDto) {
    return this.empleados.cesar(id, dto);
  }

  @Post('empleados/:id/reactivar')
  reactivarEmpleado(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.reactivar(id);
  }

  @Get('empleados/:id/liquidacion')
  liquidacionEmpleado(@Param('id', ParseUUIDPipe) id: string, @Query('vacacionesTomadasDias') vacaciones?: string) {
    const dias = Number(vacaciones);
    return this.empleados.liquidacion(id, Number.isFinite(dias) && dias >= 0 ? dias : 0);
  }

  @Get('empleados/:id/deudas')
  listarDeudas(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.listarDeudas(id);
  }

  @Post('empleados/:id/deudas')
  crearDeuda(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CrearDeudaDto) {
    return this.empleados.crearDeuda(id, dto);
  }

  @Patch('deudas/:id/desactivar')
  desactivarDeuda(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.desactivarDeuda(id);
  }

  // ---- Importación de marcas del reloj ----
  // Paso 1: sube el archivo, devuelve filas de muestra y el mapeo sugerido.
  @Post('asistencia/previsualizar')
  @UseInterceptors(FileInterceptor('archivo', opcionesArchivo))
  previsualizar(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('No se recibió ningún archivo.');
    return this.asistencia.previsualizar(archivo.buffer);
  }

  // Paso 2: el mismo archivo + el mapeo (confirmado o corregido) como JSON.
  @Post('asistencia/importar')
  @UseInterceptors(FileInterceptor('archivo', opcionesArchivo))
  importar(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('mapeo') mapeoJson: string | undefined,
    @Body('vinculos') vinculosJson: string | undefined,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    if (!archivo) throw new BadRequestException('No se recibió ningún archivo.');
    // El .xls del reloj no lleva mapeo de columnas; los .xlsx sí.
    let mapeo: Mapeo | null = null;
    if (mapeoJson) {
      try {
        mapeo = JSON.parse(mapeoJson) as Mapeo;
      } catch {
        throw new BadRequestException('El mapeo de columnas no es válido.');
      }
    }
    let vinculos: Record<string, string> = {};
    if (vinculosJson) {
      try {
        vinculos = JSON.parse(vinculosJson) as Record<string, string>;
      } catch {
        throw new BadRequestException('Los vínculos de empleados no son válidos.');
      }
    }
    return this.asistencia.importar(archivo.buffer, archivo.originalname, mapeo, usuario.id, vinculos);
  }

  // Horas de tienda: se meten a mano por día (no marcan en el reloj de la fábrica).
  // Marcas anotadas a mano mientras el reloj no funciona. Solo administrador del sistema y gerente general (se revisa en el servicio).
  @Post('asistencia/marcas-manuales')
  registrarMarcasManuales(@Body() dto: RegistrarMarcasManualesDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.asistencia.registrarMarcasManuales(dto, usuario);
  }

  @Post('asistencia/horas-manuales')
  registrarHorasManuales(@Body() dto: RegistrarHorasManualesDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.asistencia.registrarHorasManuales(dto, usuario.id);
  }

  @Get('asistencia/importaciones')
  listarImportaciones() {
    return this.asistencia.listarImportaciones();
  }

  @Get('asistencia/dias')
  listarDias(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('empleadoId') empleadoId?: string,
    @Query('estado') estado?: EstadoDia | 'revisar',
  ) {
    return this.asistencia.listarDias({ desde, hasta, empleadoId, estado });
  }

  @Post('asistencia/dias/:id/resolver')
  resolverDia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverDiaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.asistencia.resolver(id, dto, usuario.id);
  }

  // Comprobantes de justificación (foto o PDF). Se guardan con nombre
  // aleatorio y solo se leen con sesión de Administración.
  @Post('asistencia/justificantes')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: CARPETA_JUSTIFICANTES,
        filename: (_req, archivo, cb) => cb(null, `${randomUUID()}${EXTENSION_POR_MIME[archivo.mimetype] ?? ''}`),
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, archivo, cb) => {
        if (!TIPOS_JUSTIFICANTE.includes(archivo.mimetype)) {
          cb(new BadRequestException('El comprobante debe ser una foto JPG, PNG o WEBP, o un PDF.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirJustificante(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('No se recibió ningún archivo.');
    verificarArchivoSubido(archivo);
    return { archivo: archivo.filename };
  }

  @Get('asistencia/justificantes/:archivo')
  verJustificante(@Param('archivo') archivo: string, @Res() res: Response) {
    if (!NOMBRE_JUSTIFICANTE.test(archivo)) throw new NotFoundException('El comprobante no existe.');
    const ruta = resolve(CARPETA_JUSTIFICANTES, archivo);
    if (!existsSync(ruta)) throw new NotFoundException('El comprobante no existe.');
    res.sendFile(ruta);
  }

  @Get('asistencia/resumen')
  resumenAsistencia(@Query('desde') desde = '', @Query('hasta') hasta = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new BadRequestException('Indique las fechas desde y hasta (YYYY-MM-DD).');
    }
    return this.asistencia.resumenPeriodo(desde, hasta);
  }

  @Get('asistencia/bitacora')
  bitacora(@Query('desde') desde = '', @Query('hasta') hasta = '', @Query('empleadoId') empleadoId = '') {
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    if ((desde && !fecha.test(desde)) || (hasta && !fecha.test(hasta))) throw new BadRequestException('Las fechas deben ser YYYY-MM-DD.');
    if (empleadoId && !/^[0-9a-f-]{36}$/i.test(empleadoId)) throw new BadRequestException('El empleado no es válido.');
    return this.asistencia.bitacora({ desde: desde || undefined, hasta: hasta || undefined, empleadoId: empleadoId || undefined });
  }

  @Get('asistencia/dias/:id/resoluciones')
  listarResoluciones(@Param('id', ParseUUIDPipe) id: string) {
    return this.asistencia.listarResoluciones(id);
  }

  // ---- Planillas ----
  @Get('planillas')
  listarPlanillas() {
    return this.planillas.listar();
  }

  @Post('planillas')
  crearPlanilla(@Body() dto: CrearPlanillaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.planillas.crear(dto, usuario.id);
  }

  @Get('planillas/:id')
  detallePlanilla(@Param('id', ParseUUIDPipe) id: string) {
    return this.planillas.detalle(id);
  }

  // Viáticos de un empleado en una planilla en borrador (0 = quitarlos). Van fuera de los cálculos de planilla.
  @Patch('planillas/:id/viaticos')
  fijarViaticos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ViaticosDto) {
    return this.planillas.fijarViaticos(id, dto.empleadoId, dto.monto, dto.justificante);
  }

  @Post('planillas/:id/recalcular')
  recalcular(@Param('id', ParseUUIDPipe) id: string) {
    return this.planillas.recalcular(id);
  }

  @Post('planillas/:id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AprobarPlanillaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.planillas.aprobar(id, dto, usuario.id);
  }

  @Post('planillas/:id/pagar')
  pagar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarPlanillaDto) {
    return this.planillas.pagar(id, dto);
  }

  @Post('planillas/:id/reversar-pago')
  reversarPago(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoPlanillaDto) {
    return this.planillas.reversarPago(id, dto.motivo);
  }

  @Post('planillas/:id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoPlanillaDto) {
    return this.planillas.anular(id, dto.motivo);
  }

  @Delete('planillas/:id')
  async eliminar(@Param('id', ParseUUIDPipe) id: string) {
    await this.planillas.eliminarBorrador(id);
    return { ok: true };
  }

  // Revisión previa: qué se mandaría al banco y qué falta.
  @Get('planillas/:id/banco-popular')
  prepararBancoPopular(@Param('id', ParseUUIDPipe) id: string, @Query('descripcion') descripcion?: string) {
    return this.bancoPopular.preparar(id, descripcion);
  }

  // El TXT para subir a la planilla web del banco.
  @Get('planillas/:id/banco-popular/txt')
  async txtBancoPopular(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @Query('descripcion') descripcion?: string,
  ) {
    const { nombre, contenido } = await this.bancoPopular.generarTxt(id, descripcion);
    res.set({
      'Content-Type': 'text/plain; charset=us-ascii',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    });
    return new StreamableFile(Buffer.from(contenido, 'latin1'));
  }

  @Get('planillas/:id/libro')
  async libro(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.planillas.exportar(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="libro-salarios-${id.slice(0, 8)}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  // ---- Anomalías de los empleados (almuerzos fuera de lo normal, tardanzas…) y carta de amonestación ----
  @Get('anomalias')
  listarAnomalias(@Query('empleadoId') empleadoId?: string, @Query('estado') estado?: string) {
    const estados = ['pendiente', 'carta_emitida', 'descartada'];
    if (empleadoId && !/^[0-9a-f-]{36}$/i.test(empleadoId)) throw new BadRequestException('El empleado no es válido.');
    if (estado && !estados.includes(estado)) throw new BadRequestException('El estado no es válido.');
    return this.anomalias.listar({ empleadoId: empleadoId || undefined, estado: (estado as 'pendiente') || undefined });
  }

  @Get('anomalias/pendientes-por-empleado')
  anomaliasPendientes() {
    return this.anomalias.pendientesPorEmpleado();
  }

  @Post('anomalias')
  crearAnomalia(@Body() dto: CrearAnomaliaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.anomalias.crear(dto, usuario.id);
  }

  @Patch('anomalias/:id')
  cambiarEstadoAnomalia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarEstadoAnomaliaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.anomalias.cambiarEstado(id, dto.estado, dto.nota, usuario.id);
  }

  // Borrador de carta de amonestación (PDF) con las anomalías elegidas (ids separados por coma); las marca como «carta emitida».
  @Get('anomalias/carta/:empleadoId')
  async cartaAmonestacion(
    @Param('empleadoId', ParseUUIDPipe) empleadoId: string,
    @Query('ids') ids = '',
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lista = ids.split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    const { nombre, buffer } = await this.anomalias.generarCarta(empleadoId, lista, true, usuario.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  // Colillas de pago en media carta (PDF): todas las de la planilla, o la de un empleado.
  @Get('planillas/:id/colillas/pdf')
  async colillasPdf(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { nombre, buffer } = await this.colillas.generar(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  @Get('planillas/:id/colillas/:empleadoId/pdf')
  async colillaPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('empleadoId', ParseUUIDPipe) empleadoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { nombre, buffer } = await this.colillas.generar(id, empleadoId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }
}
