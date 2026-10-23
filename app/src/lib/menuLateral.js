import { ref, watch } from 'vue';

// Estado compartido del menú lateral del panel (lo usan el menú y el layout):
// `fijado` = el menú se queda abierto (si no, es una barra de íconos que se expande al pasar el mouse).
const CLAVE = 'conejo-blanco-menu-fijado';

// Sin elección guardada, en pantallas grandes el menú arranca abierto (con nombres) para que nadie tenga que adivinar qué es cada ícono.
function leer() {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* sin almacenamiento: se usa el valor por defecto */
  }
  return typeof window !== 'undefined' && window.innerWidth >= 1280;
}

export const menuFijado = ref(leer());

watch(menuFijado, (v) => {
  try {
    localStorage.setItem(CLAVE, v ? '1' : '0');
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
});
