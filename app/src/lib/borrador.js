import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';

// Borrador automático de formularios largos: lo que la persona va escribiendo se guarda en este navegador y, si la sesión se cierra o la
// ventana se pierde, al volver se ofrece «Recuperar». Es por persona y dura 7 días. Uso:
//   const borrador = usarBorrador({ clave: 'factura', obtener: () => ({...}), aplicar: (d) => {...}, tieneDatos: (d) => ... });
//   ...al guardar bien:  borrador.limpiar();   ...en la pantalla: <BorradorAviso :borrador="borrador" />
const DIAS = 7;

export function usarBorrador({ clave, obtener, aplicar, tieneDatos = () => true }) {
  const auth = useAuthStore();
  const llave = () => `cb-borrador:${auth.usuario?.id ?? 'anonimo'}:${clave}`;
  const pendiente = ref(null); // { guardadoEn, datos }
  let temporizador = null;
  let activo = false;

  function leer() {
    try {
      const raw = JSON.parse(localStorage.getItem(llave()) ?? 'null');
      if (!raw?.datos || Date.now() - raw.guardadoEn > DIAS * 86_400_000) return null;
      return raw;
    } catch {
      return null;
    }
  }

  function guardar() {
    if (!activo) return;
    try {
      const datos = obtener();
      if (!tieneDatos(datos)) localStorage.removeItem(llave());
      else localStorage.setItem(llave(), JSON.stringify({ guardadoEn: Date.now(), datos }));
    } catch {
      /* sin almacenamiento o sin espacio: no se guarda borrador, pero nada se interrumpe */
    }
  }

  const limpiar = () => {
    activo = false;
    clearTimeout(temporizador);
    pendiente.value = null;
    try {
      localStorage.removeItem(llave());
    } catch {
      /* nada */
    }
  };

  onMounted(() => {
    const b = leer();
    if (b && tieneDatos(b.datos)) pendiente.value = b;
    else activo = true;
    watch(
      obtener,
      () => {
        // Mientras se ofrece recuperar, lo guardado no se pisa con el formulario vacío.
        if (pendiente.value) return;
        clearTimeout(temporizador);
        temporizador = setTimeout(guardar, 700);
      },
      { deep: true },
    );
  });
  onBeforeUnmount(() => {
    clearTimeout(temporizador);
    if (activo) guardar();
  });

  return {
    pendiente,
    restaurar() {
      const b = pendiente.value;
      pendiente.value = null;
      activo = true;
      if (b) aplicar(b.datos);
    },
    descartar() {
      limpiar();
      activo = true;
    },
    limpiar,
  };
}
