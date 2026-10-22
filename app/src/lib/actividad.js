import { dbGet, dbPut } from './posDb.js';

// Registro de actividad de la caja: cada hecho importante (abrir/cerrar caja, quitar un producto del tiquete, reimprimir, entrar sin
// internet, aceptar mercadería, contar inventario…) se anota aquí con la HORA REAL en que ocurrió, aunque no haya internet, y se envía al
// servidor con el resto de lo pendiente para verse en el panel de administración (Tienda → Actividad). Anotar nunca debe estorbar:
// si algo falla, simplemente no se anota.
const CLAVE = 'actividad';
const MAXIMO = 2000;
let cola = null;

async function leerCola() {
  if (!cola) cola = (await dbGet('kv', CLAVE)) ?? [];
  return cola;
}

function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem('conejo-blanco-sesion') ?? 'null');
  } catch {
    return null;
  }
}

export async function registrarActividad(tipo, detalle) {
  try {
    const [c, tienda] = await Promise.all([leerCola(), dbGet('kv', 'tienda')]);
    const u = usuarioActual();
    c.push({ id: crypto.randomUUID(), ubicacionId: tienda?.id ?? null, usuarioId: u?.id, usuarioNombre: u?.nombre, tipo, detalle: String(detalle ?? '').slice(0, 500), fecha: new Date().toISOString(), sinConexion: typeof navigator !== 'undefined' && !navigator.onLine });
    if (c.length > MAXIMO) c.splice(0, c.length - MAXIMO);
    await dbPut('kv', JSON.parse(JSON.stringify(c)), CLAVE);
  } catch {
    /* no se pudo anotar: no se interrumpe lo que la persona estaba haciendo */
  }
}

export async function actividadPorEnviar(maximo = 300) {
  try {
    return (await leerCola()).slice(0, maximo);
  } catch {
    return [];
  }
}

export async function quitarActividad(ids) {
  try {
    const c = await leerCola();
    const fuera = new Set(ids);
    for (let i = c.length - 1; i >= 0; i -= 1) if (fuera.has(c[i].id)) c.splice(i, 1);
    await dbPut('kv', JSON.parse(JSON.stringify(c)), CLAVE);
  } catch {
    /* se vuelve a intentar en el próximo envío */
  }
}

export async function cantidadActividadPendiente() {
  return (await actividadPorEnviar(100000)).length;
}
