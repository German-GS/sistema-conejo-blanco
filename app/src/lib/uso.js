import { getToken } from './api.js';

// Uso del sistema, sin contenido: qué pantallas se abren, qué búsquedas no encuentran nada y qué llamadas fallan. Se junta en memoria y se
// envía en tandas al servidor (el administrador del sistema lo ve en Estado del sistema → Uso). Nunca incluye lo escrito en formularios.
import { API_URL } from './api.js';

const cola = [];
const MAXIMO = 100;
let temporizador = null;

export function registrarUso(tipo, clave) {
  if (!clave || !getToken()) return;
  if (cola.length >= MAXIMO) cola.shift();
  cola.push({ tipo, clave: String(clave).slice(0, 160) });
  if (!temporizador) temporizador = setTimeout(enviar, 15_000);
}

export function enviar() {
  clearTimeout(temporizador);
  temporizador = null;
  const token = getToken();
  if (!cola.length || !token || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const eventos = cola.splice(0, 50);
  // keepalive deja terminar el envío aunque la pestaña se cierre; si falla, no se reintenta (es solo estadística).
  fetch(`${API_URL}/uso`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ eventos }) }).catch(() => undefined);
  if (cola.length) temporizador = setTimeout(enviar, 2_000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', enviar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && enviar());
}

// Para agrupar llamadas fallidas: «POST /pedidos/<id>/anular 400» en vez de una por cada id.
export const claveDeLlamada = (metodo, ruta, estado) => `${metodo} ${ruta.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/\d+/g, '/:n').split('?')[0]} ${estado}`;
