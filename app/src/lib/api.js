export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3101';
const TOKEN_KEY = 'conejo-blanco-token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Si el backend rechaza el token (venció, o se cambió la clave / desactivaron
// la cuenta desde otro lado) se avisa a la app para que cierre la sesión.
// Login y cambio de clave devuelven 401 por claves incorrectas: no cuentan.
function avisarSiSesionInvalida(res) {
  if (res.status !== 401 || !getToken()) return;
  const ruta = new URL(res.url).pathname;
  if (ruta.endsWith('/auth/login') || ruta.endsWith('/auth/password')) return;
  window.dispatchEvent(new Event('sesion-invalida'));
}

async function manejarRespuesta(res) {
  avisarSiSesionInvalida(res);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 503 && data?.code === 'MANTENIMIENTO') window.dispatchEvent(new CustomEvent('mantenimiento', { detail: data.message }));
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : (data?.message ?? `Error ${res.status}`);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch rechaza con un TypeError cuando no hay red o el servidor no
    // responde (no hay res.status en ese caso) — lo normalizamos a ApiError
    // para que las páginas solo tengan que manejar un tipo de error.
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 0);
  }

  return manejarRespuesta(res);
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// Para subir archivos (ej. fotos de producto) — a diferencia de request(),
// NO fija Content-Type: el navegador le pone el boundary multipart
// correcto solo si se lo deja decidir a él.
export async function subirArchivo(path, formData) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 0);
  }
  return manejarRespuesta(res);
}

// Abre en otra pestaña un archivo que solo se puede leer con sesión (ej. el
// comprobante de una justificación): no se puede poner directo en un <a> o
// <img> porque el navegador no manda el token.
export async function abrirArchivoProtegido(path) {
  const ventana = window.open('', '_blank'); // se abre ya, antes del await, para que no la bloquee el navegador
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(`No se pudo abrir el archivo (${res.status}).`, res.status);
    const url = URL.createObjectURL(await res.blob());
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
  } catch (err) {
    ventana?.close();
    throw err;
  }
}

// Para endpoints que devuelven un archivo (ej. un reporte en Excel) en
// vez de JSON — dispara la descarga del navegador con el nombre que
// mande el backend en Content-Disposition.
export async function descargarArchivo(path, nombrePorDefecto) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message ?? `Error ${res.status}`, res.status);
  }

  const disposicion = res.headers.get('Content-Disposition') ?? '';
  const nombre = /filename="?([^"]+)"?/.exec(disposicion)?.[1] ?? nombrePorDefecto;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// Baja un archivo protegido (PDF, etc.) sin descargarlo: lo devuelve como File
// para poder compartirlo (ej. por WhatsApp con la hoja de compartir del celular).
export async function obtenerArchivo(path, nombrePorDefecto) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message ?? `Error ${res.status}`, res.status);
  }
  const disposicion = res.headers.get('Content-Disposition') ?? '';
  const nombre = /filename="?([^"]+)"?/.exec(disposicion)?.[1] ?? nombrePorDefecto;
  const blob = await res.blob();
  return new File([blob], nombre, { type: blob.type || 'application/pdf' });
}
