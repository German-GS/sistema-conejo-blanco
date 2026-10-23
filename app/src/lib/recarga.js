import { avisarErrorDeRed } from './red.js';

// Después de publicar una versión nueva, una pestaña que quedó abierta puede pedir un archivo que ya no existe. En ese caso la aplicación
// se recarga sola (una vez cada 30 segundos, para no entrar en un ciclo) y toma la versión nueva.
export function recargarPorArchivoNuevo(destino) {
  const clave = 'cb-recarga-pantalla';
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(clave) ?? 0);
  } catch {
    ultima = Date.now(); // sin almacenamiento no se puede evitar el ciclo: no se recarga
  }
  if (Date.now() - ultima > 30_000) {
    try {
      sessionStorage.setItem(clave, String(Date.now()));
    } catch {
      /* nada */
    }
    window.location.assign(destino ?? window.location.href);
    return true;
  }
  avisarErrorDeRed('No se pudo abrir esa pantalla. Recargue la página (Ctrl o Cmd + Shift + R) para tomar la versión nueva.');
  return false;
}

export const esErrorDeArchivoNuevo = (err) => /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch|MIME type|module script/i.test(String(err?.message ?? err));
