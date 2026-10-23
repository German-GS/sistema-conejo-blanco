import { computed, reactive } from 'vue';
import { api } from './api.js';

// «Para hacer hoy»: lo pendiente de la persona, calculado por el servidor según sus permisos. Lo usan el inicio (bandeja) y el menú (contadores).
export const pendientes = reactive({ lista: [], cargado: false, error: false });
let temporizador = null;
let cargando = false;
let usuarios = 0; // cuántas pantallas lo están usando (el menú y la bandeja del inicio)

export async function cargarPendientes() {
  if (cargando) return;
  cargando = true;
  try {
    pendientes.lista = await api.get('/pendientes');
    pendientes.error = false;
  } catch {
    pendientes.error = true;
  } finally {
    pendientes.cargado = true;
    cargando = false;
  }
}

// Mientras el panel está abierto se refresca cada 2 minutos y al volver a la pestaña.
const alVolver = () => document.visibilityState === 'visible' && void cargarPendientes();
export function vigilarPendientes() {
  void cargarPendientes();
  if (usuarios === 0) {
    temporizador = setInterval(() => void cargarPendientes(), 120_000);
    document.addEventListener('visibilitychange', alVolver);
  }
  usuarios += 1;
  let activo = true;
  return () => {
    if (!activo) return;
    activo = false;
    usuarios -= 1;
    if (usuarios === 0) {
      clearInterval(temporizador);
      document.removeEventListener('visibilitychange', alVolver);
    }
  };
}

export const totalPendientes = computed(() => pendientes.lista.reduce((a, p) => a + p.cantidad, 0));
// Cuánto hay pendiente que se resuelve en una pantalla (para el contador del menú); solo cuenta lo urgente o que requiere atención.
export const contadorDeRuta = (nombreRuta) => pendientes.lista.filter((p) => p.ruta === nombreRuta && p.gravedad !== 'info').reduce((a, p) => a + p.cantidad, 0);
