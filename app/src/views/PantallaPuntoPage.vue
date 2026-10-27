<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { ApiError } from '../lib/api.js';
import { llamar } from '../lib/dispositivoMarca.js';

// Pantalla fija de un punto de marca (una tablet o monitor en la empresa): muestra un QR que cambia cada 30 segundos.
// El empleado lo escanea con la cámara de su celular, que abre /marcar con el código vigente. Una foto del QR deja de
// servir a los pocos segundos. La tablet se autoriza una vez con el enlace que genera el administrador del sistema.
const CLAVE = 'cb-pantalla-punto';
const route = useRoute();
const router = useRouter();
const nombre = ref('');
const qr = ref('');
const segundos = ref(0);
const error = ref('');
const reloj = ref('');
let temporizador = null;
let consulta = null;
let bloqueoPantalla = null;
let vence = 0;

// Modo quiosco: pantalla completa + pantalla encendida + toques ignorados. Se sale manteniendo presionada la hora 3 segundos (o con Esc).
const bloqueada = ref(false);
const progresoSalida = ref(0);
const SOSTENER_MS = 3000;
let sosteniendo = null;
const fullscreenSoportado = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const enFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

const credencial = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
  } catch {
    return null;
  }
};

async function actualizar() {
  const c = credencial();
  if (!c) {
    error.value = 'Esta pantalla no está autorizada. Abra el enlace que le dio el administrador del sistema.';
    return;
  }
  try {
    const r = await llamar('/marca/pantalla/qr', { puntoId: c.puntoId, token: c.token });
    error.value = '';
    nombre.value = r.nombre;
    const enlace = new URL(router.resolve({ name: 'marcar', query: { p: c.puntoId, k: r.codigo } }).href, window.location.origin).href;
    qr.value = await QRCode.toDataURL(enlace, { width: 560, margin: 2, errorCorrectionLevel: 'M' });
    vence = Date.now() + r.segundosRestantes * 1000;
    // Se pide el siguiente un segundo después de que cambie, para no mostrar uno ya vencido.
    clearTimeout(consulta);
    consulta = setTimeout(actualizar, r.segundosRestantes * 1000 + 800);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      error.value = err.message;
      localStorage.removeItem(CLAVE);
      qr.value = '';
      return;
    }
    // Sin conexión: se reintenta pronto y se oculta el QR vencido.
    if (Date.now() > vence) qr.value = '';
    error.value = 'Sin conexión con el servidor… reintentando.';
    clearTimeout(consulta);
    consulta = setTimeout(actualizar, 4000);
  }
}

const latido = () => {
  segundos.value = Math.max(0, Math.ceil((vence - Date.now()) / 1000));
  reloj.value = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const porcentaje = computed(() => Math.min(100, (segundos.value / 30) * 100));

async function mantenerEncendida() {
  try {
    bloqueoPantalla = await navigator.wakeLock?.request('screen');
  } catch {
    /* no todos los navegadores lo permiten */
  }
}

async function bloquear() {
  bloqueada.value = true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    /* sin pantalla completa igual queda el bloqueo de toques */
  }
  mantenerEncendida();
}

function desbloquear() {
  bloqueada.value = false;
  progresoSalida.value = 0;
  if (enFullscreen()) (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
}

// Si la persona sale de pantalla completa por su cuenta (Esc, gesto del sistema), se quita también el bloqueo.
function alCambiarFullscreen() {
  if (bloqueada.value && fullscreenSoportado && !enFullscreen()) desbloquear();
}

function empezarSalida() {
  const inicio = Date.now();
  clearInterval(sosteniendo);
  sosteniendo = setInterval(() => {
    progresoSalida.value = Math.min(100, ((Date.now() - inicio) / SOSTENER_MS) * 100);
    if (progresoSalida.value >= 100) {
      clearInterval(sosteniendo);
      desbloquear();
    }
  }, 50);
}
function cancelarSalida() {
  clearInterval(sosteniendo);
  progresoSalida.value = 0;
}

onMounted(() => {
  document.addEventListener('fullscreenchange', alCambiarFullscreen);
  document.addEventListener('webkitfullscreenchange', alCambiarFullscreen);
  // El token llega en el enlace una sola vez: se guarda en esta tablet y se quita de la barra de direcciones.
  if (route.query.p && route.query.t) {
    localStorage.setItem(CLAVE, JSON.stringify({ puntoId: String(route.query.p), token: String(route.query.t) }));
    router.replace({ name: 'punto-pantalla' });
  }
  actualizar();
  latido();
  temporizador = setInterval(latido, 500);
  mantenerEncendida();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && mantenerEncendida());
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', alCambiarFullscreen);
  document.removeEventListener('webkitfullscreenchange', alCambiarFullscreen);
  clearInterval(sosteniendo);
  clearInterval(temporizador);
  clearTimeout(consulta);
  bloqueoPantalla?.release?.();
});
</script>

<template>
  <!-- Cubre toda la ventana (también el pie de página del sistema) y, con el bloqueo, ignora los toques. -->
  <main class="fixed inset-0 z-[60] flex select-none flex-col items-center justify-center gap-4 overflow-hidden bg-white p-4 text-slate-900" :class="bloqueada ? 'touch-none overscroll-none' : ''" @contextmenu.prevent>
    <p class="text-sm font-semibold uppercase tracking-widest text-slate-500">{{ nombre || 'Conejo Blanco' }}</p>
    <h1 class="text-center text-2xl font-bold sm:text-4xl">Escanee para marcar</h1>
    <div v-if="qr" class="flex flex-col items-center gap-3">
      <img :src="qr" alt="Código QR para marcar asistencia" class="aspect-square w-[min(80vw,70vh)] max-w-xl" />
      <div class="h-2 w-[min(80vw,70vh)] max-w-xl overflow-hidden rounded-full bg-slate-200" role="progressbar" :aria-valuenow="segundos" aria-valuemin="0" aria-valuemax="30" aria-label="Segundos para que cambie el código">
        <div class="h-full bg-blue-600 transition-all duration-500" :style="{ width: porcentaje + '%' }"></div>
      </div>
    </div>
    <p v-if="error" class="max-w-md rounded-xl border border-red-300 bg-red-50 p-3 text-center text-sm font-medium text-red-700">{{ error }}</p>
    <div class="flex flex-col items-center gap-1" :title="bloqueada ? 'Mantenga presionada la hora para salir' : ''">
      <p
        class="text-3xl font-bold tabular-nums"
        @pointerdown="bloqueada && empezarSalida()"
        @pointerup="cancelarSalida"
        @pointerleave="cancelarSalida"
        @pointercancel="cancelarSalida"
      >{{ reloj }}</p>
      <div v-if="progresoSalida > 0" class="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200"><div class="h-full bg-red-600" :style="{ width: progresoSalida + '%' }"></div></div>
    </div>
    <p class="max-w-md text-center text-xs text-slate-500">Abra la cámara de su celular, apunte al código y escriba su PIN. El código cambia solo cada 30 segundos.</p>
    <template v-if="!bloqueada">
      <button type="button" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" @click="bloquear">Pantalla completa y bloqueo</button>
      <p v-if="!fullscreenSoportado" class="max-w-md text-center text-xs text-slate-500">Este navegador no tiene pantalla completa: bloquea los toques, pero para ocultar las barras use «Compartir → Añadir a pantalla de inicio» y abra el sistema desde ese ícono.</p>
    </template>
    <p v-else class="text-xs text-slate-400">Pantalla bloqueada · para salir mantenga presionada la hora durante 3 segundos</p>
  </main>
</template>
