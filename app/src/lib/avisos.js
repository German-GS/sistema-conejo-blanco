import { reactive } from 'vue';

// Avisos breves en una esquina de la pantalla (éxito, error, información) que se ven estén donde estén y se quitan solos.
// Los errores duran más y se pueden cerrar; un aviso puede traer un botón de acción (por ejemplo «Reintentar» o «Deshacer»).
export const avisos = reactive({ lista: [] });
let siguiente = 1;

export function mostrarAviso({ tipo = 'info', texto, accion = null, duracion }) {
  const id = siguiente++;
  const ms = duracion ?? (tipo === 'error' ? 9000 : 4500);
  avisos.lista.push({ id, tipo, texto, accion });
  if (ms > 0) setTimeout(() => cerrarAviso(id), ms);
  return id;
}

export function cerrarAviso(id) {
  const i = avisos.lista.findIndex((a) => a.id === id);
  if (i >= 0) avisos.lista.splice(i, 1);
}

export const exito = (texto, opciones = {}) => mostrarAviso({ tipo: 'exito', texto, ...opciones });
export const fallo = (texto, opciones = {}) => mostrarAviso({ tipo: 'error', texto, ...opciones });
export const informar = (texto, opciones = {}) => mostrarAviso({ tipo: 'info', texto, ...opciones });
