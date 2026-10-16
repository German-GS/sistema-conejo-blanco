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
