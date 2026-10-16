import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import os from 'node:os';

interface Muestra {
  t: number;
  cpu: number;
  ram: number;
  lag: number;
}

interface Cubo {
  req: number;
  e4: number;
  e5: number;
  sumaMs: number;
  duraciones: number[];
}

const MB = 1_048_576;
const MUESTREO_MS = 15_000;
const RETENCION_MIN = 24 * 60;

function leer(ruta: string): string | null {
  try {
    return readFileSync(ruta, 'utf8').trim();
  } catch {
    return null;
  }
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
}

// Métricas de la instancia del servidor en la que corre el sistema: CPU, memoria, swap, disco, latencia
// y errores HTTP por minuto (últimas 24 horas). Se guardan en memoria: si Cloud Run reinicia o cambia de
// instancia, las series empiezan de nuevo (se avisa en pantalla con "desde").
@Injectable()
export class MetricasService implements OnModuleInit, OnModuleDestroy {
  private muestras: Muestra[] = [];
  private cubos = new Map<number, Cubo>();
  private temporizador?: NodeJS.Timeout;
  private cpuAnterior = process.cpuUsage();
  private tiempoAnterior = process.hrtime.bigint();
  private esperado = Date.now() + MUESTREO_MS;
  readonly desde = Date.now();
  private ultimoLag = 0;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.temporizador = setInterval(() => this.muestrear(), MUESTREO_MS);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
  }

  // ---- Peticiones HTTP (las cuenta el middleware de actividad) ----
  registrarPeticion(duracionMs: number, estado: number): void {
    const minuto = Math.floor(Date.now() / 60_000);
    let c = this.cubos.get(minuto);
    if (!c) {
      c = { req: 0, e4: 0, e5: 0, sumaMs: 0, duraciones: [] };
      this.cubos.set(minuto, c);
      for (const k of this.cubos.keys()) if (k < minuto - RETENCION_MIN) this.cubos.delete(k);
    }
    c.req += 1;
    c.sumaMs += duracionMs;
    if (estado >= 500) c.e5 += 1;
    else if (estado >= 400) c.e4 += 1;
    if (c.duraciones.length < 300) c.duraciones.push(duracionMs);
  }

  // ---- Lectura del hardware ----

  private cpuPorcentaje(): number {
    const ahora = process.hrtime.bigint();
    const uso = process.cpuUsage(this.cpuAnterior);
    const transcurridoUs = Number(ahora - this.tiempoAnterior) / 1000;
    this.cpuAnterior = process.cpuUsage();
    this.tiempoAnterior = ahora;
    // Si el contenedor tiene un límite de CPU (cgroup) se mide contra ese límite; si no, contra los núcleos.
    const max = leer('/sys/fs/cgroup/cpu.max');
    let nucleos = Number(process.env.LIMITE_CPUS) || os.cpus().length || 1;
    if (!process.env.LIMITE_CPUS && max && !max.startsWith('max')) {
      const [cuota, periodo] = max.split(' ').map(Number);
      if (cuota > 0 && periodo > 0) nucleos = cuota / periodo;
    }
    return Math.min(100, Math.max(0, ((uso.user + uso.system) / (transcurridoUs * nucleos)) * 100));
  }

  private memoria(): { usadoMB: number; totalMB: number; pct: number; fuente: string } {
    const actual = leer('/sys/fs/cgroup/memory.current');
    const limite = leer('/sys/fs/cgroup/memory.max');
    if (actual) {
      const usado = Number(actual);
      const total = limite && limite !== 'max' ? Number(limite) : os.totalmem();
      return { usadoMB: Math.round(usado / MB), totalMB: Math.round(total / MB), pct: (usado / total) * 100, fuente: 'contenedor' };
    }
    // Sin cgroup legible (Cloud Run gen2, equipo de desarrollo): lo que usa este proceso frente al límite del
    // servicio (variable LIMITE_MEMORIA_MB, o el que informe Node) o, si no hay, la memoria total.
    const usado = process.memoryUsage().rss;
    const limiteEnv = Number(process.env.LIMITE_MEMORIA_MB) * MB;
    const restringida = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0;
    const total = limiteEnv > 0 ? limiteEnv : restringida > 0 ? restringida : os.totalmem();
    return { usadoMB: Math.round(usado / MB), totalMB: Math.round(total / MB), pct: (usado / total) * 100, fuente: 'proceso' };
  }

  private swap(): { usadoMB: number; totalMB: number; pct: number } | null {
    const info = leer('/proc/meminfo');
    if (!info) return null;
    const kb = (clave: string) => Number(new RegExp(`${clave}:\\s+(\\d+)`).exec(info)?.[1] ?? 0);
    const total = kb('SwapTotal');
    if (total === 0) return { usadoMB: 0, totalMB: 0, pct: 0 };
    const usado = total - kb('SwapFree');
    return { usadoMB: Math.round(usado / 1024), totalMB: Math.round(total / 1024), pct: (usado / total) * 100 };
  }

  private async disco(): Promise<{ usadoGB: number; totalGB: number; pct: number } | null> {
    try {
      const s = await statfs(process.cwd());
      const total = s.blocks * s.bsize;
      const usado = total - s.bavail * s.bsize;
      return { usadoGB: +(usado / 1024 ** 3).toFixed(2), totalGB: +(total / 1024 ** 3).toFixed(2), pct: total > 0 ? (usado / total) * 100 : 0 };
    } catch {
      return null;
    }
  }

  private muestrear(): void {
    const ahora = Date.now();
    this.ultimoLag = Math.max(0, ahora - this.esperado);
    this.esperado = ahora + MUESTREO_MS;
    this.muestras.push({ t: ahora, cpu: this.cpuPorcentaje(), ram: this.memoria().pct, lag: this.ultimoLag });
    const corte = ahora - RETENCION_MIN * 60_000;
    while (this.muestras.length > 0 && this.muestras[0].t < corte) this.muestras.shift();
  }

  // ---- Lo que ve el panel ----
  async instantanea(minutos: number) {
    const ventana = Math.min(Math.max(minutos, 5), RETENCION_MIN);
    const paso = ventana <= 60 ? 1 : ventana <= 360 ? 5 : 15;
    const ahoraMin = Math.floor(Date.now() / 60_000);
    const inicioMin = ahoraMin - ventana + 1;

    const serie: Array<{ t: number; cpu: number | null; ram: number | null; req: number; e4: number; e5: number; rtt: number | null; p95: number | null }> = [];
    for (let m = inicioMin; m <= ahoraMin; m += paso) {
      const ms = m * 60_000;
      const fin = ms + paso * 60_000;
      const mu = this.muestras.filter((x) => x.t >= ms && x.t < fin);
      let req = 0, e4 = 0, e5 = 0, suma = 0;
      const dur: number[] = [];
      for (let k = m; k < m + paso; k++) {
        const c = this.cubos.get(k);
        if (!c) continue;
        req += c.req; e4 += c.e4; e5 += c.e5; suma += c.sumaMs; dur.push(...c.duraciones);
      }
      serie.push({
        t: ms,
        cpu: mu.length ? mu.reduce((a, x) => a + x.cpu, 0) / mu.length : null,
        ram: mu.length ? mu.reduce((a, x) => a + x.ram, 0) / mu.length : null,
        req,
        e4,
        e5,
        rtt: req > 0 ? suma / req : null,
        p95: dur.length ? percentil(dur, 95) : null,
      });
    }

    let req = 0, e4 = 0, e5 = 0, suma = 0;
    const dur: number[] = [];
    for (let k = inicioMin; k <= ahoraMin; k++) {
      const c = this.cubos.get(k);
      if (!c) continue;
      req += c.req; e4 += c.e4; e5 += c.e5; suma += c.sumaMs; dur.push(...c.duraciones);
    }
    const t0 = Date.now();
    await this.dataSource.query('SELECT 1');
    const rttBd = Date.now() - t0;
    const mem = this.memoria();

    return {
      generadoEn: new Date().toISOString(),
      desde: new Date(this.desde).toISOString(),
      ventanaMin: ventana,
      pasoMin: paso,
      ahora: {
        cpu: this.muestras.length ? this.muestras[this.muestras.length - 1].cpu : 0,
        cpus: Number(process.env.LIMITE_CPUS) || os.cpus().length,
        ram: mem,
        swap: this.swap(),
        disco: await this.disco(),
        loopLagMs: this.ultimoLag,
        cargaPromedio: os.loadavg()[0],
        rttBdMs: rttBd,
      },
      http: {
        peticiones: req,
        rttPromedioMs: req > 0 ? suma / req : 0,
        rttP95Ms: percentil(dur, 95),
        tasaError4xx: req > 0 ? (e4 / req) * 100 : 0,
        tasaError5xx: req > 0 ? (e5 / req) * 100 : 0,
        errores4xx: e4,
        errores5xx: e5,
      },
      serie,
      ...(await this.accesosYPrivilegios()),
    };
  }

  // Intentos de inicio de sesión y uso de privilegios (últimas 24 h).
  private async accesosYPrivilegios() {
    const logins: Array<{ accion: string; n: number }> = await this.dataSource.query(
      `SELECT accion, COUNT(*)::int AS n FROM bitacora_accesos WHERE creado_en > now() - interval '24 hours' GROUP BY accion`,
    );
    const l = Object.fromEntries(logins.map((x) => [x.accion, x.n]));
    const porRol: Array<{ rol: string; escrituras: number; lecturas_sensibles: number; errores: number }> = await this.dataSource.query(
      `SELECT COALESCE(NULLIF(rol, ''), 'sin sesión') AS rol,
              COUNT(*) FILTER (WHERE metodo <> 'GET' AND estado < 400)::int AS escrituras,
              COUNT(*) FILTER (WHERE metodo = 'GET' AND estado < 400)::int AS lecturas_sensibles,
              COUNT(*) FILTER (WHERE estado >= 400)::int AS errores
       FROM registro_actividad WHERE creado_en > now() - interval '24 hours' GROUP BY 1 ORDER BY escrituras DESC`,
    );
    const [den]: Array<{ denegados: number; area_restringida: number }> = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE estado IN (401, 403))::int AS denegados,
              COUNT(*) FILTER (WHERE estado = 404 AND area IN ('sistema', 'accesos') AND rol NOT IN ('sistema', ''))::int AS area_restringida
       FROM registro_actividad WHERE creado_en > now() - interval '24 hours'`,
    );
    return {
      inicios: {
        correctos: l.login_ok ?? 0,
        fallidos: l.login_fallido ?? 0,
        bloqueos: (l.cuenta_bloqueada ?? 0) + (l.login_bloqueado ?? 0),
        dosPasosFallidos: l.dos_pasos_fallido ?? 0,
        ipNoPermitida: l.ip_no_permitida ?? 0,
      },
      privilegios: { porRol, denegados: den?.denegados ?? 0, intentosAreaRestringida: den?.area_restringida ?? 0 },
    };
  }
}
