import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index.js';
import './index.css';

const app = createApp(App);

// Red de seguridad: un error no capturado en un componente (ej. un bug al
// renderizar) no debe dejar al usuario viendo una pantalla en blanco sin
// ninguna pista de qué pasó — al menos queda registrado en consola.
app.config.errorHandler = (err, instance, info) => {
  console.error('Error no capturado en la aplicación:', err, info);
};

app.use(createPinia());
app.use(router);
app.mount('#app');

// Punto de venta sin internet: el service worker guarda la aplicación en la computadora de la tienda.
// Solo en la versión publicada (en desarrollo no se usa para no confundir los cambios).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      const listo = await navigator.serviceWorker.ready;
      const urls = [
        ...document.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="manifest"][href], link[rel="icon"][href]'),
      ].map((el) => el.src || el.href);
      for (const r of performance.getEntriesByType('resource')) if (r.name.includes(`${import.meta.env.BASE_URL}assets/`)) urls.push(r.name);
      (listo.active ?? reg.active)?.postMessage({ tipo: 'guardar', urls: [...urls, `${location.origin}${import.meta.env.BASE_URL}`] });
    } catch (err) {
      console.warn('No se pudo preparar el modo sin conexión:', err);
    }
  });
}
