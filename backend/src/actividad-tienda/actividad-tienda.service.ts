import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { PosActividad } from './pos-actividad.entity.js';

export interface EventoTerminal {
  id: string;
  tipo: string;
  detalle: string;
  fecha: string;
  sinConexion?: boolean;
  usuarioId?: string;
  usuarioNombre?: string;
}

const ZONA = 'America/Costa_Rica';

@Injectable()
export class ActividadTiendaService {
  private readonly logger = new Logger(ActividadTiendaService.name);

  constructor(
    @InjectRepository(PosActividad) private readonly repo: Repository<PosActividad>,
    private readonly dataSource: DataSource,
  ) {}

  // Cambios hechos desde el panel o por el servidor. Nunca debe romper lo que se está haciendo: si falla, solo se anota en el log técnico.
  async registrarPanel(e: { ubicacionId?: string | null; usuarioId?: string | null; usuarioNombre?: string; tipo: string; detalle: string }): Promise<void> {
    try {
      let nombre = e.usuarioNombre ?? '';
      if (!nombre && e.usuarioId) {
        const [u] = await this.dataSource.query('SELECT nombre FROM usuarios WHERE id = $1', [e.usuarioId]);
        nombre = u?.nombre ?? '';
      }
      await this.repo.insert({ id: randomUUID(), ubicacionId: e.ubicacionId ?? null, usuarioId: e.usuarioId ?? null, usuarioNombre: nombre.slice(0, 160), tipo: e.tipo.slice(0, 40), detalle: e.detalle.slice(0, 500), fecha: new Date(), sinConexion: false, origen: 'panel' });
    } catch (err) {
      this.logger.error(`No se pudo registrar la actividad (${e.tipo}): ${err instanceof Error ? err.message : err}`);
    }
  }

  // Lo que la caja guardó (con o sin internet). Reenviar es seguro: cada evento trae su id.
  async guardarDeTerminal(ubicacionId: string, usuarioId: string, eventos: EventoTerminal[]): Promise<number> {
    if (!eventos.length) return 0;
    const [yo] = await this.dataSource.query('SELECT nombre FROM usuarios WHERE id = $1', [usuarioId]);
    const filas = eventos.map((e) => {
      const fecha = new Date(e.fecha);
      const ahora = Date.now();
      return {
        id: e.id,
        ubicacionId,
        usuarioId: e.usuarioId ?? usuarioId,
        usuarioNombre: (e.usuarioNombre || yo?.nombre || '').slice(0, 160),
        tipo: e.tipo.slice(0, 40),
        detalle: e.detalle.slice(0, 500),
        // Una hora imposible (reloj mal puesto) no se acepta tal cual: se usa la de recibido.
        fecha: Number.isNaN(fecha.getTime()) || fecha.getTime() > ahora + 5 * 60_000 ? new Date() : fecha,
        sinConexion: Boolean(e.sinConexion),
        origen: 'caja',
      };
    });
    const r = await this.repo.createQueryBuilder().insert().values(filas).orIgnore().execute();
    return r.raw?.length ?? filas.length;
  }

  async listar(f: { desde?: string; hasta?: string; ubicacionId?: string; tipo?: string; texto?: string; origen?: string; limite?: number }) {
    const dia = (c: string): string => `to_char(a.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD')`;
    const filas: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT a.id, a.ubicacion_id AS "ubicacionId", COALESCE(u.nombre, 'Todas las tiendas') AS tienda, a.usuario_nombre AS usuario, a.tipo, a.detalle, a.fecha, a.recibido_en AS "recibidoEn",
              a.sin_conexion AS "sinConexion", a.origen
       FROM pos_actividad a LEFT JOIN ubicaciones u ON u.id = a.ubicacion_id
       WHERE ($1::text IS NULL OR ${dia('')} >= $1) AND ($2::text IS NULL OR ${dia('')} <= $2)
         AND ($3::uuid IS NULL OR a.ubicacion_id = $3::uuid OR a.ubicacion_id IS NULL) AND ($4::text IS NULL OR a.tipo = $4)
         AND ($5::text IS NULL OR a.detalle ILIKE '%' || $5 || '%' OR a.usuario_nombre ILIKE '%' || $5 || '%')
         AND ($6::text IS NULL OR a.origen = $6)
       ORDER BY a.fecha DESC LIMIT $7`,
      [f.desde || null, f.hasta || null, f.ubicacionId || null, f.tipo || null, f.texto?.trim() || null, f.origen || null, Math.min(Math.max(f.limite ?? 500, 1), 2000)],
    );
    return filas;
  }
}
