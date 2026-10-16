import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';
import { RegistroActividad } from './registro-actividad.entity.js';
import { MetricasService } from './metricas.service.js';
import { areaDeRuta, esLecturaSensible, resumirCuerpo } from './actividad.util.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

export interface FiltroActividad {
  desde?: string;
  hasta?: string;
  area?: string;
  metodo?: string;
  // 'ok' (2xx/3xx), 'error' (4xx/5xx), '4xx', '5xx' o un código exacto.
  estado?: string;
  texto?: string;
  pagina?: number;
  limite?: number;
}

const RETENCION_DIAS = 540;

@Injectable()
export class ActividadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActividadService.name);
  private cola: Array<Partial<RegistroActividad>> = [];
  private temporizador?: NodeJS.Timeout;
  private depuracion?: NodeJS.Timeout;

  constructor(
    @InjectRepository(RegistroActividad)
    private readonly repo: Repository<RegistroActividad>,
    private readonly metricas: MetricasService,
  ) {}

  onModuleInit() {
    this.temporizador = setInterval(() => void this.vaciar(), 2_000);
    void this.depurar();
    this.depuracion = setInterval(() => void this.depurar(), 24 * 3_600_000);
  }

  async onModuleDestroy() {
    clearInterval(this.temporizador);
    clearInterval(this.depuracion);
    await this.vaciar();
  }

  private async vaciar(): Promise<void> {
    if (this.cola.length === 0) return;
    const lote = this.cola.splice(0, this.cola.length);
    try {
      await this.repo.insert(lote as never);
    } catch (err) {
      this.logger.error(`No se pudo guardar el registro de actividad (${lote.length}): ${err instanceof Error ? err.message : err}`);
    }
  }

  private async depurar(): Promise<void> {
    try {
      await this.repo.createQueryBuilder().delete().where(`creado_en < now() - interval '${RETENCION_DIAS} days'`).execute();
    } catch (err) {
      this.logger.error(`No se pudo depurar el registro de actividad: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Middleware de Express: se engancha al final de cada respuesta, así queda registrado también lo que
  // rechazan los guards (401/403) y los errores. Nunca interrumpe la petición.
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const inicio = Date.now();
      let mensaje = '';
      const jsonOriginal = res.json.bind(res);
      res.json = (cuerpo: unknown) => {
        if (res.statusCode >= 400 && cuerpo && typeof cuerpo === 'object') {
          const m = (cuerpo as { message?: unknown }).message;
          mensaje = (Array.isArray(m) ? m.join('; ') : String(m ?? '')).slice(0, 400);
        }
        return jsonOriginal(cuerpo);
      };
      res.once('finish', () => {
        try {
          const ruta = (req.originalUrl ?? req.url).slice(0, 300);
          const rutaSinQuery = ruta.split('?')[0];
          const metodo = req.method.toUpperCase();
          if (metodo === 'OPTIONS' || rutaSinQuery.startsWith('/uploads') || rutaSinQuery === '/' || rutaSinQuery === '/health') return;
          // Todas las peticiones cuentan para las métricas (latencia y errores), menos las del propio panel que se actualiza solo.
          if (!/^\/sistema\/(metricas|salud)/.test(rutaSinQuery)) this.metricas.registrarPeticion(Date.now() - inicio, res.statusCode);
          const area = areaDeRuta(rutaSinQuery);
          const esEscritura = metodo !== 'GET' && metodo !== 'HEAD';
          const fallo = res.statusCode >= 400;
          // Las consultas del propio administrador del sistema a sus registros no se registran (llenarían la bitácora de sí misma).
          if (!esEscritura && !fallo && (area === 'sistema' ? !/\/(exportar|excel)/.test(rutaSinQuery) : !esLecturaSensible(rutaSinQuery))) return;
          const usuario = (req as Request & { user?: UsuarioAutenticado }).user;
          const cuerpo = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0 ? resumirCuerpo(req.body) : null;
          this.cola.push({
            usuarioId: usuario?.id ?? null,
            usuarioEmail: usuario?.email ?? (typeof (req.body as { email?: unknown })?.email === 'string' ? String((req.body as { email: string }).email).slice(0, 160) : ''),
            rol: usuario?.rol ?? '',
            area,
            metodo,
            ruta,
            estado: res.statusCode,
            duracionMs: Date.now() - inicio,
            ip: (req.ip ?? '').slice(0, 64) || null,
            agente: String(req.headers['user-agent'] ?? '').slice(0, 200),
            detalle: cuerpo as Record<string, unknown> | null,
            mensaje,
          });
          if (this.cola.length >= 100) void this.vaciar();
        } catch {
          /* registrar nunca debe romper una respuesta */
        }
      });
      next();
    };
  }

  private filtrar(qb: SelectQueryBuilder<RegistroActividad>, f: FiltroActividad): SelectQueryBuilder<RegistroActividad> {
    if (f.desde) qb.andWhere("a.creado_en >= (:desde::date AT TIME ZONE 'America/Costa_Rica')", { desde: f.desde });
    if (f.hasta) qb.andWhere("a.creado_en < ((:hasta::date + 1) AT TIME ZONE 'America/Costa_Rica')", { hasta: f.hasta });
    if (f.area) qb.andWhere('a.area = :area', { area: f.area });
    if (f.metodo) qb.andWhere('a.metodo = :metodo', { metodo: f.metodo.toUpperCase() });
    if (f.estado) {
      if (f.estado === 'ok') qb.andWhere('a.estado < 400');
      else if (f.estado === 'error') qb.andWhere('a.estado >= 400');
      else if (f.estado === '4xx') qb.andWhere('a.estado BETWEEN 400 AND 499');
      else if (f.estado === '5xx') qb.andWhere('a.estado >= 500');
      else if (/^\d{3}$/.test(f.estado)) qb.andWhere('a.estado = :est', { est: Number(f.estado) });
    }
    if (f.texto?.trim()) {
      qb.andWhere('(LOWER(a.usuario_email) LIKE :t OR LOWER(a.ruta) LIKE :t OR LOWER(a.mensaje) LIKE :t OR a.detalle::text ILIKE :t)', {
        t: `%${f.texto.trim().toLowerCase().replace(/[%_\\]/g, '')}%`,
      });
    }
    return qb;
  }

  async listar(f: FiltroActividad): Promise<{ total: number; pagina: number; limite: number; filas: RegistroActividad[] }> {
    await this.vaciar();
    const limite = Math.min(Math.max(f.limite ?? 100, 1), 500);
    const pagina = Math.max(f.pagina ?? 1, 1);
    const qb = this.filtrar(this.repo.createQueryBuilder('a'), f);
    const total = await qb.getCount();
    const filas = await qb.orderBy('a.creado_en', 'DESC').skip((pagina - 1) * limite).take(limite).getMany();
    return { total, pagina, limite, filas };
  }

  async resumen(horas = 24) {
    await this.vaciar();
    const [fila]: Array<Record<string, string>> = await this.repo.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estado >= 500 AND estado <> 503)::int AS errores_5xx,
              COUNT(*) FILTER (WHERE estado BETWEEN 400 AND 499)::int AS errores_4xx,
              COUNT(*) FILTER (WHERE estado IN (401, 403))::int AS denegados,
              COUNT(*) FILTER (WHERE metodo <> 'GET')::int AS escrituras,
              COUNT(DISTINCT usuario_id)::int AS usuarios
       FROM registro_actividad WHERE creado_en > now() - ($1 || ' hours')::interval`,
      [String(horas)],
    );
    const porArea: Array<{ area: string; total: number }> = await this.repo.query(
      `SELECT area, COUNT(*)::int AS total FROM registro_actividad WHERE creado_en > now() - ($1 || ' hours')::interval GROUP BY area ORDER BY total DESC`,
      [String(horas)],
    );
    return { horas, ...fila, porArea };
  }

  async exportar(f: FiltroActividad): Promise<Buffer> {
    await this.vaciar();
    const filas = await this.filtrar(this.repo.createQueryBuilder('a'), f).orderBy('a.creado_en', 'DESC').take(50_000).getMany();
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet('Actividad');
    hoja.addRow([`REGISTRO DE ACTIVIDAD${f.area ? ` — área ${f.area}` : ''}${f.desde ? ` — desde ${f.desde}` : ''}${f.hasta ? ` hasta ${f.hasta}` : ''}`]).font = { bold: true, size: 13 };
    hoja.addRow([]);
    hoja.addRow(['Fecha y hora', 'Usuario', 'Perfil', 'Área', 'Método', 'Ruta', 'Estado', 'Mensaje de error', 'Detalle enviado', 'IP', 'Ms', 'Navegador']).font = { bold: true };
    for (const a of filas) {
      hoja.addRow([
        a.creadoEn.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }),
        a.usuarioEmail,
        a.rol,
        a.area,
        a.metodo,
        a.ruta,
        a.estado,
        a.mensaje,
        a.detalle ? JSON.stringify(a.detalle) : '',
        a.ip ?? '',
        a.duracionMs,
        a.agente,
      ]);
    }
    [20, 30, 16, 14, 8, 60, 8, 40, 60, 16, 8, 40].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
    hoja.views = [{ state: 'frozen', ySplit: 3 }];
    hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 12 } };
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
