// El celular del empleado como «llave»: genera un par de llaves (ECDSA P-256) y guarda la privada en el
// navegador SIN poder exportarla; al servidor solo viaja la pública. Cada marca se firma con ella, así que
// el PIN o un enlace copiado no sirven desde otro aparato. Solo el administrador del sistema puede registrar otro celular.
import { API_URL, ApiError } from './api.js';

const NOMBRE = 'cb-marca';
const ALMACEN = 'acceso';
const CLAVE = 'celular';
let abierta = null;

function abrir() {
  if (abierta) return abierta;
  abierta = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no permite guardar la llave de seguridad.'));
    const r = indexedDB.open(NOMBRE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return abierta;
}

const pedir = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export const soportaLlaves = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';

// { accesoId, nombre, llavePrivada (CryptoKey no exportable) } o null si este celular no está registrado.
export async function leerCelular() {
  const db = await abrir();
  return (await pedir(db.transaction(ALMACEN).objectStore(ALMACEN).get(CLAVE))) ?? null;
}

async function guardarCelular(valor) {
  const db = await abrir();
  await pedir(db.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).put(valor, CLAVE));
}

export async function olvidarCelular() {
  const db = await abrir();
  await pedir(db.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).delete(CLAVE));
}

const aBase64Url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Texto corto para que el administrador reconozca el aparato (no es una huella única: eso no se puede en la web).
export function etiquetaDelAparato() {
  const ua = navigator.userAgent;
  const aparato = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Aparato';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${aparato} · ${navegador}`;
}

export async function llamar(ruta, cuerpo) {
  // Sin la sesión del sistema: esta pantalla no usa cuentas, y un 401 por PIN malo no debe cerrar otra sesión.
  let res;
  try {
    res = await fetch(`${API_URL}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? `Error ${res.status}`), res.status);
  return data;
}

// Registra este celular con el código que dio el administrador y el PIN que elige la persona.
export async function registrarCelular(codigo, pin) {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const llavePublica = await crypto.subtle.exportKey('jwk', par.publicKey);
  const r = await llamar('/marca/enrolar', { codigo, pin, llavePublica: { kty: llavePublica.kty, crv: llavePublica.crv, x: llavePublica.x, y: llavePublica.y }, etiqueta: etiquetaDelAparato() });
  await guardarCelular({ accesoId: r.accesoId, nombre: r.empleado.nombre, llavePrivada: par.privateKey });
  return r.empleado;
}

// Pide un reto, firma (reto|datos) con la llave del celular y lo manda con el PIN a la ruta indicada.
export async function accionFirmada(ruta, datos, pin) {
  const celular = await leerCelular();
  if (!celular) throw new ApiError('Este celular no está registrado.', 401);
  const { reto } = await llamar('/marca/reto', { accesoId: celular.accesoId });
  const texto = JSON.stringify(datos);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, celular.llavePrivada, new TextEncoder().encode(`${reto}|${texto}`));
  return llamar(ruta, { accesoId: celular.accesoId, reto, firma: aBase64Url(firma), pin, datos: texto });
}
