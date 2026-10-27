import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Reglas puras de la marca desde el celular (sin base de datos, para poder probarlas solas).

// El QR de la pantalla cambia cada 30 s; se acepta el vigente y el anterior, así que desde que se escanea
// hay entre 30 y 60 s para escribir el PIN y enviar. Una foto del QR no sirve pasado ese tiempo.
export const QR_SEGUNDOS = 30;
export const RADIO_METROS_POR_DEFECTO = 100;
// Una lectura de ubicación peor que esto no prueba nada: la marca se guarda, pero queda «por revisar».
export const PRECISION_MAXIMA_METROS = 150;
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

// Distancia en metros entre dos coordenadas (fórmula de haversine).
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export interface EvaluacionUbicacion {
  verificada: boolean;
  distanciaM: number | null;
  motivo: string | null;
}

// La ubicación no bloquea la marca (nadie pierde pago por un GPS flojo): solo decide si queda «verificada» o «por revisar».
export function evaluarUbicacion(
  punto: { latitud: number | null; longitud: number | null; radioMetros: number },
  lectura: { latitud?: number | null; longitud?: number | null; precision?: number | null },
): EvaluacionUbicacion {
  if (lectura.latitud == null || lectura.longitud == null) return { verificada: false, distanciaM: null, motivo: 'Sin ubicación (el celular no dio permiso o no pudo leerla).' };
  if (punto.latitud == null || punto.longitud == null) return { verificada: false, distanciaM: null, motivo: 'El punto de marca aún no tiene coordenadas.' };
  const distanciaM = distanciaMetros(punto.latitud, punto.longitud, lectura.latitud, lectura.longitud);
  if (lectura.precision != null && lectura.precision > PRECISION_MAXIMA_METROS) return { verificada: false, distanciaM, motivo: `Ubicación poco precisa (±${Math.round(lectura.precision)} m).` };
  if (distanciaM > punto.radioMetros) return { verificada: false, distanciaM, motivo: `Fuera del punto de marca (${distanciaM} m; el radio es ${punto.radioMetros} m).` };
  return { verificada: true, distanciaM, motivo: null };
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
