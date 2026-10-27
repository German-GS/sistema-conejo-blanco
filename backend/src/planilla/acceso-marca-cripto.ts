import { createHash, createHmac, createPublicKey, randomBytes, randomInt, timingSafeEqual, verify } from 'node:crypto';

// Piezas de seguridad de la marca desde el celular, sin base de datos para poder probarlas solas.
// Cada celular genera un par de llaves (ECDSA P-256) que nunca sale de él; el servidor solo guarda la
// llave pública. Cada marca se firma sobre un reto de un solo uso: copiar el PIN o el enlace no sirve
// sin ese mismo celular.

// Sin 0/O ni 1/I/L para que se pueda dictar o leer sin errores.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 10;
export const HORAS_VIGENCIA_CODIGO = 24;
export const SEGUNDOS_VIGENCIA_RETO = 60;
export const LARGO_PIN = 6;

export function generarCodigoEnrolamiento(): string {
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO; i += 1) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

// Se normaliza lo que escribe la persona (minúsculas, espacios, guiones) antes de comparar.
export const normalizarCodigo = (texto: string): string => texto.toUpperCase().replace(/[^A-Z0-9]/g, '');

// El código nunca se guarda: solo su huella.
export const huellaCodigo = (codigo: string): string => createHash('sha256').update(normalizarCodigo(codigo)).digest('hex');

// PIN de 6 dígitos que no sea evidente (111111, 123456, 000000…).
export function pinDebil(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const secuencia = '01234567890123456789';
  return secuencia.includes(pin) || [...secuencia].reverse().join('').includes(pin);
}

// Reto sin estado: "marca de tiempo.aleatorio.firma". Vence rápido y la firma impide inventarlos.
export function crearReto(secreto: string, ahoraMs = Date.now()): string {
  const base = `${ahoraMs}.${randomBytes(12).toString('base64url')}`;
  return `${base}.${createHmac('sha256', secreto).update(base).digest('base64url')}`;
}

// Devuelve la marca de tiempo del reto si es auténtico y no venció; si no, null.
export function validarReto(secreto: string, reto: string, ahoraMs = Date.now()): number | null {
  const partes = reto.split('.');
  if (partes.length !== 3) return null;
  const [ts, aleatorio, firma] = partes;
  const esperada = createHmac('sha256', secreto).update(`${ts}.${aleatorio}`).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const marca = Number(ts);
  if (!Number.isFinite(marca) || ahoraMs - marca > SEGUNDOS_VIGENCIA_RETO * 1000 || marca - ahoraMs > 5000) return null;
  return marca;
}

export interface LlavePublicaJwk extends Record<string, unknown> {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

// Acepta solo una llave pública P-256 (sin la parte privada) y devuelve una copia limpia.
export function validarLlavePublica(valor: unknown): LlavePublicaJwk | null {
  if (!valor || typeof valor !== 'object') return null;
  const j = valor as Record<string, unknown>;
  if (j.kty !== 'EC' || j.crv !== 'P-256' || typeof j.x !== 'string' || typeof j.y !== 'string' || 'd' in j) return null;
  const limpia: LlavePublicaJwk = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y };
  try {
    createPublicKey({ key: limpia, format: 'jwk' });
  } catch {
    return null;
  }
  return limpia;
}

// La firma del navegador (WebCrypto) viene en formato crudo r||s, en base64url.
export function firmaValida(llave: LlavePublicaJwk, mensaje: string, firmaBase64Url: string): boolean {
  try {
    return verify('sha256', Buffer.from(mensaje), { key: createPublicKey({ key: llave, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(firmaBase64Url, 'base64url'));
  } catch {
    return false;
  }
}
