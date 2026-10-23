import { reactive } from 'vue';

// Estado de espera de la aplicación: cuántas operaciones están esperando respuesta y cuántas ya tardan más de lo normal.
// Lo usan el indicador de carga de arriba y el aviso «Está tardando más de lo normal» (App.vue).
export const red = reactive({ activas: 0, lentas: 0, error: '' });

export const LENTO_MS = 8000;

// Empieza a contar una espera; devuelve la función que la termina.
export function empezarEspera() {
  red.activas += 1;
  let lenta = false;
  const temporizador = setTimeout(() => {
    lenta = true;
    red.lentas += 1;
  }, LENTO_MS);
  let terminada = false;
  return () => {
    if (terminada) return;
    terminada = true;
    clearTimeout(temporizador);
    red.activas = Math.max(0, red.activas - 1);
    if (lenta) red.lentas = Math.max(0, red.lentas - 1);
  };
}

let temporizadorError = null;
export function avisarErrorDeRed(mensaje) {
  red.error = mensaje;
  clearTimeout(temporizadorError);
  temporizadorError = setTimeout(() => (red.error = ''), 10_000);
}
