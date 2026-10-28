import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Reglas puras de la marca desde el celular (sin base de datos, para poder probarlas solas).

// El QR de la pantalla cambia cada 30 s; se acepta el vigente y el anterior, así que desde que se escanea
// hay entre 30 y 60 s para escribir el PIN y enviar. Una foto del QR no sirve pasado ese tiempo.
export const QR_SEGUNDOS = 30;
// Dos marcas del mismo empleado con menos de esto de diferencia son el mismo toque (doble clic).
export const MINUTOS_ENTRE_MARCAS = 2;

export const nuevoSecreto = (): string => randomBytes(32).toString('hex');
export const nuevoTokenPantalla = (): string => randomBytes(32).toString('base64url');

export const ventanaDe = (ahoraMs: number): number => Math.floor(ahoraMs / (QR_SEGUNDOS * 1000));
export const segundosRestantes = (ahoraMs: number): number => QR_SEGUNDOS - Math.floor((ahoraMs % (QR_SEGUNDOS * 1000)) / 1000);

export function codigoQr(secreto: string, puntoId: string, ventana: number): string {
  return createHmac('sha256', secreto).update(`${puntoId}|${ventana}`).digest('base64url').slice(0, 12);
}

export function codigoQrValido(secreto: string, puntoId: string, codigo: string, ahoraMs = Date.now()): boolean {
  const actual = ventanaDe(ahoraMs);
  const recibido = Buffer.from(String(codigo));
  return [actual, actual - 1].some((v) => {
    const esperado = Buffer.from(codigoQr(secreto, puntoId, v));
    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  });
}

const FORMATO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Fecha y hora en Costa Rica (UTC−6, sin horario de verano) de un instante: el servidor corre en UTC.
export function fechaHoraCostaRica(instante: Date): { fecha: string; hora: string } {
  const p = Object.fromEntries(FORMATO.formatToParts(instante).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const aMinutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Junta las marcas que ya tiene el día con las nuevas, en orden y sin duplicar (marcas a menos de
// MINUTOS_ENTRE_MARCAS se toman como una sola: queda la primera).
export function unirMarcas(actuales: string[], nuevas: string[]): string[] {
  const resultado: string[] = [];
  for (const m of [...actuales, ...nuevas].sort()) {
    const anterior = resultado[resultado.length - 1];
    if (anterior !== undefined && aMinutos(m) - aMinutos(anterior) < MINUTOS_ENTRE_MARCAS) continue;
    resultado.push(m);
  }
  return resultado;
}

export interface ResumenDiaMarcas {
  entrada: string | null;
  salida: string | null;
  entradaEstado: 'a_tiempo' | 'tarde' | null;
  entradaMinutos: number;
  salidaEstado: 'a_tiempo' | 'antes' | null;
  salidaMinutos: number;
  nota: string | null;
}

// Lo que el empleado ve de un día en su historial: la primera marca es la entrada y la última la salida (igual que en el cálculo
// de asistencia) y, si se pide, si fueron a tiempo según la tolerancia. Solo se mira: no cambia nada del pago.
export function resumenDeDia(
  marcas: string[],
  op: { tramo: { entrada: string; salida: string } | null; tipoDia: string; esHoy: boolean; toleranciaEntrada: number; toleranciaSalida: number; puntualidad: boolean; ahora?: string },
): ResumenDiaMarcas {
  const r: ResumenDiaMarcas = { entrada: null, salida: null, entradaEstado: null, entradaMinutos: 0, salidaEstado: null, salidaMinutos: 0, nota: null };
  const m = [...marcas].sort();
  if (m.length === 0) {
    r.nota = op.tipoDia === 'feriado' ? 'Feriado' : op.tipoDia === 'domingo' || !op.tramo ? 'Día libre' : op.esHoy ? 'Todavía sin marcas' : 'Sin marcas';
    return r;
  }
  if (m.length === 1) {
    const esEntrada = op.tramo ? aMinutos(m[0]) < (aMinutos(op.tramo.entrada) + aMinutos(op.tramo.salida)) / 2 : true;
    if (esEntrada) {
      r.entrada = m[0];
      r.nota = op.esHoy ? 'En el trabajo' : 'Falta la marca de salida';
    } else {
      r.salida = m[0];
      r.nota = 'Falta la marca de entrada';
    }
  } else if (op.esHoy && op.tramo && op.ahora && aMinutos(op.ahora) < aMinutos(op.tramo.salida)) {
    // Hoy y todavía dentro de su horario: las marcas de después de la entrada son del almuerzo, no la salida del día.
    r.entrada = m[0];
    r.nota = 'En el trabajo';
  } else {
    r.entrada = m[0];
    r.salida = m[m.length - 1];
  }
  if (op.puntualidad && op.tramo && op.tipoDia === 'ordinario') {
    if (r.entrada) {
      const tarde = aMinutos(r.entrada) - aMinutos(op.tramo.entrada);
      r.entradaEstado = tarde > op.toleranciaEntrada ? 'tarde' : 'a_tiempo';
      r.entradaMinutos = Math.max(0, tarde);
    }
    if (r.salida) {
      const antes = aMinutos(op.tramo.salida) - aMinutos(r.salida);
      r.salidaEstado = antes > op.toleranciaSalida ? 'antes' : 'a_tiempo';
      r.salidaMinutos = Math.max(0, antes);
    }
  }
  return r;
}
