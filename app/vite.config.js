import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Fecha de la compilación (hora de Costa Rica) para mostrarla junto a la versión.
const compilado = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

// Producción vive en conejo-motors.web.app/cb/app/ (subcarpeta dentro del
// hosting de Conejo Motors — /ac quedó para Aquatics) — en dev sigue
// sirviendo desde la raíz, así que esto solo se activa con `vite build`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cb/app/' : '/',
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMPILADO__: JSON.stringify(compilado),
  },
  server: {
    port: 5175,
  },
}));
