import { reactive } from 'vue';

// Tema (oscuro o claro) de los perfiles de gerencia: administrador del sistema, gerente general y administración. Se recuerda por persona
// en este navegador. Sin elección guardada, el administrador del sistema ve el oscuro (como siempre) y los demás el claro.
const guardadas = reactive({});
const clave = (id) => `cb-tema-${id}`;

function leer(usuario) {
  try {
    const v = localStorage.getItem(clave(usuario.id)) ?? (usuario.rol === 'sistema' ? localStorage.getItem('cb-tema-sistema') : null);
    return v === 'claro' || v === 'oscuro' ? v : null;
  } catch {
    return null;
  }
}

export function temaDe(usuario) {
  if (!usuario) return 'claro';
  if (!(usuario.id in guardadas)) guardadas[usuario.id] = leer(usuario);
  return guardadas[usuario.id] ?? (usuario.rol === 'sistema' ? 'oscuro' : 'claro');
}

export function fijarTema(usuario, valor) {
  if (!usuario) return;
  guardadas[usuario.id] = valor === 'oscuro' ? 'oscuro' : 'claro';
  try {
    localStorage.setItem(clave(usuario.id), guardadas[usuario.id]);
  } catch {
    /* sin almacenamiento el cambio dura hasta recargar */
  }
}

export const alternarTema = (usuario) => fijarTema(usuario, temaDe(usuario) === 'oscuro' ? 'claro' : 'oscuro');
