import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsoEvento } from './uso-evento.entity.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

export const TIPOS_USO = ['pantalla', 'busqueda_sin_resultado', 'error_api'] as const;
const RETENCION_DIAS = 180;

@Injectable()
export class UsoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsoService.name);
  private limpieza: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(UsoEvento) private readonly repo: Repository<UsoEvento>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    // Una vez al día se borra lo de más de 180 días.
    this.limpieza = setInterval(() => void this.depurar(), 24 * 3_600_000);
    this.limpieza.unref?.();
  }
  onModuleDestroy(): void {
    if (this.limpieza) clearInterval(this.limpieza);
  }
  private async depurar(): Promise<void> {
    try {
      await this.dataSource.query(`DELETE FROM uso_eventos WHERE fecha < now() - interval '${RETENCION_DIAS} days'`);
    } catch (err) {
      this.logger.warn(`No se pudo depurar el uso: ${err instanceof Error ? err.message : err}`);
    }
  }

  async registrar(usuario: UsuarioAutenticado, eventos: Array<{ tipo: string; clave: string }>): Promise<number> {
    const filas = eventos
      .filter((e) => (TIPOS_USO as readonly string[]).includes(e.tipo) && e.clave?.trim())
      .slice(0, 50)
      .map((e) => this.repo.create({ usuarioId: usuario.id, rol: usuario.rol, tipo: e.tipo, clave: e.clave.trim().slice(0, 160) }));
    if (filas.length) await this.repo.insert(filas);
    return filas.length;
  }

  async resumen(dias: number) {
    const d = Math.min(Math.max(Math.round(dias) || 30, 1), 180);
    const [pantallas, porRol, busquedas, errores, totales] = await Promise.all([
      this.dataSource.query(`SELECT clave, COUNT(*)::int AS visitas, COUNT(DISTINCT usuario_id)::int AS personas FROM uso_eventos WHERE tipo = 'pantalla' AND fecha > now() - ($1 || ' days')::interval GROUP BY clave ORDER BY visitas DESC LIMIT 40`, [String(d)]),
      this.dataSource.query(`SELECT rol, COUNT(*)::int AS eventos, COUNT(DISTINCT usuario_id)::int AS personas FROM uso_eventos WHERE tipo = 'pantalla' AND fecha > now() - ($1 || ' days')::interval GROUP BY rol ORDER BY eventos DESC`, [String(d)]),
      this.dataSource.query(`SELECT lower(clave) AS clave, COUNT(*)::int AS veces FROM uso_eventos WHERE tipo = 'busqueda_sin_resultado' AND fecha > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY veces DESC LIMIT 20`, [String(d)]),
      this.dataSource.query(`SELECT clave, COUNT(*)::int AS veces, COUNT(DISTINCT usuario_id)::int AS personas FROM uso_eventos WHERE tipo = 'error_api' AND fecha > now() - ($1 || ' days')::interval GROUP BY clave ORDER BY veces DESC LIMIT 20`, [String(d)]),
      this.dataSource.query(`SELECT COUNT(*)::int AS eventos, MIN(fecha) AS desde FROM uso_eventos WHERE fecha > now() - ($1 || ' days')::interval`, [String(d)]),
    ]);
    return { dias: d, eventos: totales[0]?.eventos ?? 0, desde: totales[0]?.desde ?? null, pantallas, porRol, busquedas, errores };
  }
}
