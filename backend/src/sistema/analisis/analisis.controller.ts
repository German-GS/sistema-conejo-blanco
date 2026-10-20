import { BadRequestException, Controller, ForbiddenException, Delete, Get, Headers, Param, Post, Query, Res, StreamableFile, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { OcultarSiNoAutorizado, RequireRole } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../../auth/usuario-autenticado.interface.js';
import { Rol } from '../../common/enums/rol.enum.js';
import { BitacoraService } from '../../bitacora/bitacora.service.js';
import { AnalisisService, type TemaResumen } from './analisis.service.js';
import { SaludFinancieraService } from './salud-financiera.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEMAS: TemaResumen[] = ['ventas', 'cartera', 'inventario', 'planilla', 'contabilidad'];

const aBool = (v: string | undefined): boolean | undefined => (v === undefined ? undefined : !['0', 'false', 'no'].includes(v.toLowerCase()));

// Sección de análisis: EXCLUSIVA del administrador del sistema (igual que el resto de /sistema).
@OcultarSiNoAutorizado()
@Controller('sistema/analisis')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRole(Rol.SISTEMA)
export class AnalisisController {
  constructor(
    private readonly analisis: AnalisisService,
    private readonly bitacora: BitacoraService,
    private readonly saludFinanciera: SaludFinancieraService,
  ) {}

  // Indicadores financieros y verificaciones de cuadre, todo desde el libro mayor.
  @Get('salud-financiera')
  saludFin(@Query() q: Record<string, string>) {
    return this.saludFinanciera.reporte({ desde: q.desde, hasta: q.hasta });
  }

  @Get('catalogo')
  catalogo() {
    return this.analisis.catalogo();
  }

  @Get('resumen/:tema')
  resumen(@Param('tema') tema: string, @Query() q: Record<string, string>) {
    if (!TEMAS.includes(tema as TemaResumen)) throw new BadRequestException('Tema no válido.');
    return this.analisis.resumen(tema as TemaResumen, { desde: q.desde, hasta: q.hasta });
  }

  // Primeras filas, para ver el contenido antes de descargar.
  @Get('vista/:id')
  async vista(@Param('id') id: string, @Query() q: Record<string, string>) {
    const r = await this.analisis.filas(id, { desde: q.desde, hasta: q.hasta, anonimizar: aBool(q.anonimizar), limite: 50 });
    return { columnas: r.columnas, filas: r.filas };
  }

  // La ruta contiene "descargar": el registro de actividad la anota (quedan quién y qué se llevó).
  @Get('descargar/:id')
  async descargar(@Param('id') id: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = this.analisis.dataset(id);
    const formato = (q.formato ?? 'csv').toLowerCase();
    if (!['csv', 'xlsx', 'json'].includes(formato)) throw new BadRequestException('Formato no válido (csv, xlsx o json).');
    const { columnas, filas } = await this.analisis.filas(id, { desde: q.desde, hasta: q.hasta, anonimizar: aBool(q.anonimizar) });
    const nombre = `${d.id}-${new Date().toISOString().slice(0, 10)}`;
    if (formato === 'json') {
      res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}.json"` });
      return new StreamableFile(Buffer.from(JSON.stringify(filas)));
    }
    if (formato === 'xlsx') {
      res.set({ 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="${nombre}.xlsx"` });
      return new StreamableFile(await this.analisis.xlsx(d, columnas, filas));
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}.csv"` });
    return new StreamableFile(this.analisis.csv(columnas, filas));
  }

  @Get('enlace')
  enlace() {
    return this.analisis.estadoEnlace();
  }

  @Post('enlace')
  async generarEnlace(@CurrentUser() usuario: UsuarioAutenticado) {
    const r = await this.analisis.generarEnlace();
    await this.bitacora.registrar({ accion: 'analisis_enlace_generado', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: 'enlace de datos para Power BI' });
    return r;
  }

  @Delete('enlace')
  async revocarEnlace(@CurrentUser() usuario: UsuarioAutenticado) {
    await this.analisis.revocarEnlace();
    await this.bitacora.registrar({ accion: 'analisis_enlace_revocado', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: 'enlace de datos para Power BI' });
    return { ok: true };
  }
}

// Entrada para Power BI / Excel / Python con una clave de solo lectura (no es la sesión de nadie).
// Solo entrega datasets sin datos personales de empleados. La clave va en el encabezado
// "Authorization: Bearer <clave>" (o en ?token=, que nunca se guarda en el registro de actividad).
@Controller('feed')
export class AnalisisFeedController {
  constructor(private readonly analisis: AnalisisService) {}

  @Get(':id')
  async feed(@Param('id') id: string, @Query() q: Record<string, string>, @Headers('authorization') auth: string | undefined, @Res({ passthrough: true }) res: Response) {
    const token = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : q.token;
    if (!(await this.analisis.tokenValido(token))) throw new UnauthorizedException('Clave no válida.');
    const d = this.analisis.dataset(id);
    if (d.personal) throw new ForbiddenException('Ese conjunto de datos no se entrega por este enlace.');
    const { columnas, filas } = await this.analisis.filas(id, { desde: q.desde, hasta: q.hasta });
    res.set({ 'Cache-Control': 'no-store' });
    if ((q.formato ?? 'csv').toLowerCase() === 'json') {
      res.set({ 'Content-Type': 'application/json; charset=utf-8' });
      return new StreamableFile(Buffer.from(JSON.stringify(filas)));
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8' });
    return new StreamableFile(this.analisis.csv(columnas, filas));
  }
}
