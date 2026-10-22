import { dbAll, dbGet, dbPut } from './posDb.js';
import { fechaArchivo } from './csv.js';

// Respaldo de seguridad de lo que está en esta computadora. Si se borran los datos del navegador, lo que todavía no se envió al
// servidor se pierde; este archivo permite recuperarlo. Restaurar es seguro: cada venta, caja, pedido, recepción y conteo lleva su
// propio id y el servidor ignora lo que ya recibió.
const VERSION = 1;

export async function armarRespaldo(tienda) {
  const [ventas, cajas, ordenes, recepciones, ajustes] = await Promise.all([dbAll('ventas'), dbAll('cajas'), dbAll('ordenes'), dbGet('kv', 'recepciones'), dbGet('kv', 'ajustes')]);
  return { tipo: 'respaldo-pos-conejo-blanco', version: VERSION, generadoEn: new Date().toISOString(), tienda: tienda ? { id: tienda.id, nombre: tienda.nombre, codigo: tienda.codigo } : null, ventas, cajas, ordenes, recepciones: recepciones ?? [], ajustes: ajustes ?? [] };
}

export async function descargarRespaldo(tienda) {
  const datos = await armarRespaldo(tienda);
  const blob = new Blob([JSON.stringify(datos)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo-pos-${tienda?.codigo ?? 'tienda'}-${fechaArchivo()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try {
    localStorage.setItem('cb-ultimo-respaldo', String(Date.now()));
  } catch {
    /* el aviso de respaldo simplemente se repite */
  }
  return { ventas: datos.ventas.length, cajas: datos.cajas.length, ordenes: datos.ordenes.length, recepciones: datos.recepciones.length, ajustes: datos.ajustes.length };
}

// Mezcla el respaldo con lo que ya hay: solo agrega lo que falta (por id). Devuelve cuántos registros nuevos entraron.
export async function restaurarRespaldo(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un respaldo válido.');
  }
  if (datos?.tipo !== 'respaldo-pos-conejo-blanco' || !Array.isArray(datos.ventas) || !Array.isArray(datos.cajas)) throw new Error('El archivo no es un respaldo de la caja.');
  const [ventas, cajas, ordenes, recepciones, ajustes] = await Promise.all([dbAll('ventas'), dbAll('cajas'), dbAll('ordenes'), dbGet('kv', 'recepciones'), dbGet('kv', 'ajustes')]);
  const tiene = (lista, id) => lista.some((x) => x.id === id);
  let nuevos = 0;
  for (const v of datos.ventas) if (v?.id && Array.isArray(v.lineas) && !tiene(ventas, v.id)) { await dbPut('ventas', v); nuevos += 1; }
  for (const c of datos.cajas) if (c?.id && !tiene(cajas, c.id)) { await dbPut('cajas', c); nuevos += 1; }
  for (const o of datos.ordenes ?? []) if (o?.id && Array.isArray(o.lineas) && !tiene(ordenes, o.id)) { await dbPut('ordenes', o); nuevos += 1; }
  const recs = [...(recepciones ?? [])];
  for (const r of datos.recepciones ?? []) if (r?.ordenId && Array.isArray(r.lineas) && !recs.some((x) => x.ordenId === r.ordenId)) { recs.push({ ...r, rechazada: false, error: '' }); nuevos += 1; }
  const ajs = [...(ajustes ?? [])];
  for (const a of datos.ajustes ?? []) if (a?.id && Array.isArray(a.lineas) && !ajs.some((x) => x.id === a.id)) { ajs.push({ ...a, rechazada: false, error: '' }); nuevos += 1; }
  await dbPut('kv', recs, 'recepciones');
  await dbPut('kv', ajs, 'ajustes');
  return nuevos;
}

export const hacerCuantoDesdeRespaldo = () => {
  try {
    return Date.now() - Number(localStorage.getItem('cb-ultimo-respaldo') ?? 0);
  } catch {
    return Infinity;
  }
};
