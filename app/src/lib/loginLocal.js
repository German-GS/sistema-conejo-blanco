import { dbDelete, dbGet, dbPut } from './posDb.js';

// Entrar sin internet (solo el encargado de tienda, en la computadora donde ya entró antes con internet).
// Al entrar con internet se guarda una huella de su contraseña (PBKDF2 con sal, nunca la contraseña); sin internet se compara contra esa
// huella. No hay verificación en dos pasos para este perfil, así que no se salta ninguna protección. La huella dura 30 días sin volver
// a entrar con internet y se borra si el servidor rechaza esa contraseña.
const DIAS_VALIDA = 30;
const ITERACIONES = 210_000;
const MAX_INTENTOS = 5;
const ESPERA_MS = 5 * 60_000;
const clave = (email) => `credencial:${String(email).trim().toLowerCase()}`;
const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(password, sal, iteraciones) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, material, 256);
}

export const puedeLoginLocal = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';

export async function guardarCredencial(email, password, usuario) {
  if (!puedeLoginLocal()) return;
  try {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivar(password, sal, ITERACIONES);
    await dbPut('kv', { email: String(email).trim().toLowerCase(), sal: aB64(sal), hash: aB64(hash), iteraciones: ITERACIONES, usuario, guardadaEn: Date.now(), intentos: 0, bloqueadaHasta: 0 }, clave(email));
  } catch {
    /* sin almacenamiento no hay entrada sin internet, pero entrar con internet sigue funcionando */
  }
}

export async function borrarCredencial(email) {
  try {
    await dbDelete('kv', clave(email));
  } catch {
    /* nada que borrar */
  }
}

// Devuelve { usuario } si la contraseña coincide, o { error } con la explicación para la persona.
export async function verificarCredencial(email, password) {
  if (!puedeLoginLocal()) return { error: 'Este navegador no permite entrar sin internet.' };
  let c;
  try {
    c = await dbGet('kv', clave(email));
  } catch {
    c = null;
  }
  if (!c) return { error: 'Sin internet solo puede entrar quien ya entró antes en esta computadora con internet. Conéctese a internet para entrar.' };
  if (Date.now() - c.guardadaEn > DIAS_VALIDA * 86_400_000) return { error: `Hace más de ${DIAS_VALIDA} días que no entra con internet. Conéctese para entrar de nuevo.` };
  if (c.bloqueadaHasta > Date.now()) return { error: 'Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.' };
  const hash = await derivar(password, deB64(c.sal), c.iteraciones);
  if (aB64(hash) !== c.hash) {
    c.intentos = (c.intentos ?? 0) + 1;
    if (c.intentos >= MAX_INTENTOS) {
      c.intentos = 0;
      c.bloqueadaHasta = Date.now() + ESPERA_MS;
    }
    await dbPut('kv', c, clave(email));
    return { error: 'El correo o la contraseña no son correctos.' };
  }
  c.intentos = 0;
  c.bloqueadaHasta = 0;
  await dbPut('kv', c, clave(email));
  return { usuario: c.usuario };
}
