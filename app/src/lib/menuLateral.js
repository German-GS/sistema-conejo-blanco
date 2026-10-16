import { ref, watch } from 'vue';

// Estado compartido del menú lateral del panel (lo usan el menú y el layout):
// `fijado` = el menú se queda abierto (si no, es una barra de íconos que se expande al pasar el mouse).
const CLAVE = 'conejo-blanco-menu-fijado';

function leer() {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export const menuFijado = ref(leer());

watch(menuFijado, (v) => {
  try {
    localStorage.setItem(CLAVE, v ? '1' : '0');
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
});
