import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generarSecretoTotp(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decodificarBase32(texto: string): Buffer {
  let bits = '';
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) throw new Error('Secreto inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// RFC 6238 (TOTP, HMAC-SHA1, 30 s, 6 dígitos): compatible con Google Authenticator, Microsoft Authenticator, Authy…
export function codigoTotp(secreto: string, tiempoMs = Date.now(), paso = 30): string {
  const contador = Math.floor(tiempoMs / 1000 / paso);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const h = createHmac('sha1', decodificarBase32(secreto)).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const n = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Acepta el código del momento y el del paso anterior/siguiente (relojes algo desfasados).
export function verificarTotp(secreto: string, codigo: string, tiempoMs = Date.now()): boolean {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return false;
  for (const delta of [-1, 0, 1]) {
    const esperado = Buffer.from(codigoTotp(secreto, tiempoMs + delta * 30_000));
    if (timingSafeEqual(esperado, Buffer.from(limpio))) return true;
  }
  return false;
}

export function urlOtpauth(secreto: string, correo: string, emisor = 'Conejo Blanco'): string {
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(correo)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}

// El secreto se guarda cifrado (AES-256-GCM) con una llave derivada de JWT_SECRET: un volcado
// de la base de datos solo no basta para generar códigos.
const llave = (jwtSecret: string) => createHash('sha256').update(`totp|${jwtSecret}`).digest();

export function cifrarSecreto(secreto: string, jwtSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(jwtSecret), iv);
  const enc = Buffer.concat([c.update(secreto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function descifrarSecreto(guardado: string, jwtSecret: string): string {
  const [iv, tag, enc] = guardado.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', llave(jwtSecret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
