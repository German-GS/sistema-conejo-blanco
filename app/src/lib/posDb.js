// Almacenamiento local del POS (IndexedDB): el catálogo, las ventas que aún no se enviaron y los turnos de caja.
// Es lo que permite cobrar sin internet y no perder nada si se cierra la ventana o se apaga la computadora.
const NOMBRE = 'cb-pos';
const VERSION = 2;
let abierta = null;

function abrir() {
  if (abierta) return abierta;
  abierta = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no permite guardar datos para trabajar sin conexión.'));
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('ventas')) db.createObjectStore('ventas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cajas')) db.createObjectStore('cajas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ordenes')) db.createObjectStore('ordenes', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return abierta;
}

const pedir = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export async function dbGet(almacen, clave) {
  const db = await abrir();
  return pedir(db.transaction(almacen).objectStore(almacen).get(clave));
}

export async function dbAll(almacen) {
  const db = await abrir();
  return pedir(db.transaction(almacen).objectStore(almacen).getAll());
}

export async function dbPut(almacen, valor, clave) {
  const db = await abrir();
  const t = db.transaction(almacen, 'readwrite');
  const s = t.objectStore(almacen);
  if (clave === undefined) s.put(valor);
  else s.put(valor, clave);
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function dbDelete(almacen, clave) {
  const db = await abrir();
  const t = db.transaction(almacen, 'readwrite');
  t.objectStore(almacen).delete(clave);
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
