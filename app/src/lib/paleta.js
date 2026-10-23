import { reactive } from 'vue';

// Estado de la búsqueda rápida (Ctrl/Cmd + K): la abre el atajo de teclado o el botón del encabezado.
export const paleta = reactive({ abierta: false });
export const abrirPaleta = () => (paleta.abierta = true);
export const cerrarPaleta = () => (paleta.abierta = false);
