import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntegridadService } from '../contabilidad/integridad.service.js';
import { SistemaConfigService } from './sistema-config.service.js';
import { ActividadService } from './actividad.service.js';

export interface IntegridadGuardada {
  verificadoEn: string;
  ok: boolean;
  total: number;
  fallas: Array<{ codigo: string; titulo: string; cantidadProblemas: number }>;
  origen: 'automatica' | 'manual';
}

function versionDelPaquete(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

@Injectable()
export class SaludService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SaludService.name);
  private temporizador?: NodeJS.Timeout;
  private readonly iniciado = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    private readonly integridad: IntegridadService,
    private readonly config: SistemaConfigService,
    private readonly actividad: ActividadService,
  ) {}

  // Cada hora revisa si toca la verificación nocturna de cálculos (después de las 2 a. m. hora de Costa Rica,
  // una vez al día) y guarda el resultado para el panel de salud.
  onModuleInit() {
    this.temporizador = setInterval(() => void this.revisarNocturna(), 3_600_000);
    setTimeout(() => void this.revisarNocturna(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
  }

  private async revisarNocturna(): Promise<void> {
    try {
      const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica', hour: '2-digit', hour12: false }));
      const ultima = await this.config.get<IntegridadGuardada | null>('integridad.ultima');
      const hace = ultima ? Date.now() - Date.parse(ultima.verificadoEn) : Infinity;
      if (hora >= 2 && hace > 20 * 3_600_000) await this.verificarIntegridad('automatica');
    } catch (err) {
      this.logger.error(`Verificación nocturna: ${err instanceof Error ? err.message : err}`);
    }
  }

  async verificarIntegridad(origen: 'automatica' | 'manual'): Promise<IntegridadGuardada> {
    const r = await this.integridad.verificar();
    const guardada: IntegridadGuardada = {
      verificadoEn: r.verificadoEn,
      ok: r.ok,
      total: r.resultados.length,
      fallas: r.resultados.filter((x) => !x.ok).map((x) => ({ codigo: x.codigo, titulo: x.titulo, cantidadProblemas: x.cantidadProblemas })),
      origen,
    };
    await this.config.guardar('integridad.ultima', guardada);
    if (!guardada.ok) this.logger.warn(`La verificación de cálculos encontró ${guardada.fallas.length} regla(s) con diferencias.`);
    return guardada;
  }

  async estado() {
    const t0 = Date.now();
    let baseDatos: { ok: boolean; latenciaMs: number; version?: string; error?: string };
    try {
      const [{ version }] = await this.dataSource.query('SELECT version()');
      baseDatos = { ok: true, latenciaMs: Date.now() - t0, version: String(version).split(' ').slice(0, 2).join(' ') };
    } catch (err) {
      baseDatos = { ok: false, latenciaMs: Date.now() - t0, error: err instanceof Error ? err.message : 'sin conexión' };
    }
    const [cuentas] = await this.dataSource.query(
      `SELECT (SELECT COUNT(*)::int FROM usuarios WHERE activo) AS usuarios_activos,
              (SELECT COUNT(*)::int FROM usuarios WHERE bloqueado_hasta > now()) AS bloqueados,
              (SELECT COUNT(*)::int FROM asientos_contables) AS asientos,
              (SELECT COUNT(*)::int FROM planilla_empleados WHERE activo) AS empleados_activos,
              (SELECT COUNT(*)::int FROM periodos_contables_cerrados) AS meses_cerrados`,
    );
    const mem = process.memoryUsage();
    return {
      version: versionDelPaquete(),
      revision: process.env.K_REVISION ?? 'local',
      node: process.version,
      entorno: process.env.K_SERVICE ? 'producción (Cloud Run)' : 'local',
      iniciadoHace: Math.round((Date.now() - this.iniciado) / 1000),
      memoriaMB: Math.round(mem.rss / 1_048_576),
      baseDatos,
      cuentas,
      actividad24h: await this.actividad.resumen(24),
      integridad: await this.config.get<IntegridadGuardada | null>('integridad.ultima'),
      mantenimiento: await this.config.enMantenimiento(),
    };
  }
}
