// Service worker del punto de venta: deja abrir la aplicación sin internet.
// - Navegación: primero la red (así siempre se ve la última versión); sin red, la copia guardada.
// - Archivos de /assets: se guardan al verlos (llevan huella en el nombre, nunca cambian).
// Los datos del negocio (API) NO pasan por aquí: el POS los guarda aparte en IndexedDB.
const CACHE = 'cb-pos-v4';
const BASE = new URL(self.registration.scope).pathname; // p. ej. /cb/app/
const INDEX = `${BASE}index.html`;

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
      await self.clients.claim();
    })(),
  );
});

// La página avisa qué archivos usa para que queden guardados desde la primera visita y limpia los de versiones viejas.
self.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'guardar') return;
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = [...new Set(e.data.urls)];
      await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)));
      // La página de inicio también debe poder abrirse desde cualquier ruta (la app resuelve las rutas por su cuenta).
      const raiz = (await cache.match(BASE, { ignoreVary: true })) ?? (await cache.match(INDEX, { ignoreVary: true }));
      if (raiz) await cache.put(INDEX, raiz.clone());
      const vigentes = new Set(urls.map((u) => new URL(u, self.location.origin).pathname));
      for (const req of await cache.keys()) {
        const ruta = new URL(req.url).pathname;
        if (ruta.startsWith(`${BASE}assets/`) && !vigentes.has(ruta)) await cache.delete(req);
      }
    })(),
  );
});

const conTiempo = (promesa, ms) => Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await conTiempo(fetch(req), 4000);
          if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) await cache.put(INDEX, res.clone());
          return res;
        } catch {
          return (await cache.match(INDEX, { ignoreVary: true })) ?? (await cache.match(BASE, { ignoreVary: true })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`) || url.pathname === `${BASE}manifest.webmanifest` || url.pathname === `${BASE}favicon.png`) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(req, { ignoreVary: true });
        if (guardado) return guardado;
        const res = await fetch(req);
        // Si el archivo ya no existe (versión vieja), el servidor responde con la página de inicio: eso NO se guarda como si fuera el archivo.
        if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) await cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
