import { reactive } from 'vue';

// ¿Hay una versión nueva publicada? Se compara el archivo principal de la página que está abierta con el de la página publicada.
// Así la persona se entera y actualiza cuando le conviene, en lugar de tropezar con pantallas que ya no existen.
export const version = reactive({ nueva: false });

const actual = () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? '';

async function revisar() {
  if (!import.meta.env.PROD || version.nueva || !navigator.onLine) return;
  try {
    const html = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
    const publicada = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
    const abierta = actual();
    if (publicada && abierta && !abierta.endsWith(publicada)) version.nueva = true;
  } catch {
    /* sin internet o servidor ocupado: se vuelve a revisar luego */
  }
}

export function vigilarVersion() {
  setInterval(() => void revisar(), 5 * 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void revisar());
  setTimeout(() => void revisar(), 30_000);
}
