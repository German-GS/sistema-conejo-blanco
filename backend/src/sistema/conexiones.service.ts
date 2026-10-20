import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const EN_LINEA_MS = 5 * 60_000;

// "Chrome en Mac", "Safari en iPhone"… a partir del texto que manda el navegador.
export function describirDispositivo(agente: string | null): string {
  if (!agente) return '';
  const navegador = /Edg\//.test(agente) ? 'Edge' : /OPR\/|Opera/.test(agente) ? 'Opera' : /Firefox\//.test(agente) ? 'Firefox' : /Chrome\/|CriOS/.test(agente) ? 'Chrome' : /Safari\//.test(agente) ? 'Safari' : 'Navegador';
  const sistema = /iPhone/.test(agente) ? 'iPhone' : /iPad/.test(agente) ? 'iPad' : /Android/.test(agente) ? 'Android' : /Windows/.test(agente) ? 'Windows' : /Mac OS X|Macintosh/.test(agente) ? 'Mac' : /Linux/.test(agente) ? 'Linux' : '';
  return sistema ? `${navegador} en ${sistema}` : navegador;
}

@Injectable()
export class ConexionesService {
  constructor(private readonly dataSource: DataSource) {}

  // Quién está conectado ahora (actividad en los últimos 5 minutos) y la última conexión de cada cuenta.
  async listar() {
    const filas: Array<{ id: string; nombre: string; email: string; rol: string; activo: boolean; ultimo_acceso: Date | null; ultima_actividad: Date | null; ultima_ip: string | null; ultimo_dispositivo: string | null }> = await this.dataSource.query(
      `SELECT id, nombre, email, rol::text AS rol, activo, ultimo_acceso, ultima_actividad, ultima_ip, ultimo_dispositivo FROM usuarios`,
    );
    const ahora = Date.now();
    const cuentas = filas
      .map((u) => {
        const actividad = u.ultima_actividad ? u.ultima_actividad.getTime() : null;
        return {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          activo: u.activo,
          enLinea: u.activo && actividad !== null && ahora - actividad <= EN_LINEA_MS,
          ultimaActividad: u.ultima_actividad?.toISOString() ?? null,
          ultimoAcceso: u.ultimo_acceso?.toISOString() ?? null,
          ip: u.ultima_ip,
          dispositivo: describirDispositivo(u.ultimo_dispositivo),
        };
      })
      .sort((a, b) => Number(b.enLinea) - Number(a.enLinea) || Number(b.activo) - Number(a.activo) || (b.ultimaActividad ?? b.ultimoAcceso ?? '').localeCompare(a.ultimaActividad ?? a.ultimoAcceso ?? ''));
    return { enLinea: cuentas.filter((c) => c.enLinea).length, total: cuentas.filter((c) => c.activo).length, cuentas };
  }
}
