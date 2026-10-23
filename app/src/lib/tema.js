import { ref } from 'vue';

// Tema de la cuenta del administrador del sistema: oscuro (el de siempre para esa cuenta) o claro. Se recuerda en este navegador.
const CLAVE = 'cb-tema-sistema';

function leer() {
  try {
    return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

export const tema = ref(leer());

export function fijarTema(valor) {
  tema.value = valor === 'claro' ? 'claro' : 'oscuro';
  try {
    localStorage.setItem(CLAVE, tema.value);
  } catch {
    /* sin almacenamiento el cambio dura hasta recargar */
  }
}

export const alternarTema = () => fijarTema(tema.value === 'oscuro' ? 'claro' : 'oscuro');
