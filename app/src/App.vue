<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AppFooter from './components/AppFooter.vue';
import { iniciarControlInactividad, fijarMinutosInactividad } from './lib/inactividad.js';
import { temaDe } from './lib/tema.js';
import { red } from './lib/red.js';
import AvisosGlobales from './components/AvisosGlobales.vue';
import ConfirmarDialogo from './components/ConfirmarDialogo.vue';
import AvisoInactividad from './components/AvisoInactividad.vue';

const auth = useAuthStore();
const router = useRouter();

let detener = null;

// Los perfiles de gerencia eligen tema oscuro o claro (el administrador del sistema parte en oscuro; los demás, en claro).
watch(
  () => (auth.esAdministracion ? temaDe(auth.usuario) : 'claro'),
  (elegido) => document.documentElement.classList.toggle('tema-oscuro', elegido === 'oscuro'),
  { immediate: true },
);
const mantenimiento = ref('');
const recargar = () => window.location.reload();

function alMantenimiento(e) {
  if (auth.esSistema) return;
  mantenimiento.value = e.detail || 'El sistema está en mantenimiento.';
}
window.addEventListener('mantenimiento', alMantenimiento);

async function reintentar() {
  await auth.cargarConfig();
  if (!auth.config.mantenimiento?.activo) {
    mantenimiento.value = '';
    window.location.reload();
  }
}

// El control solo corre mientras hay sesión: arranca al iniciar sesión y se
// apaga al salir (a mano o por inactividad).
watch(
  () => auth.autenticado,
  (autenticado) => {
    detener?.();
    detener = null;
    if (!autenticado) return;
    auth.refrescarPerfil();
    auth.cargarConfig().then(() => {
      fijarMinutosInactividad(auth.config.inactividadMinutos);
      if (auth.config.mantenimiento?.activo && !auth.esSistema) mantenimiento.value = auth.config.mantenimiento.mensaje;
    });
    // El encargado de tienda no se desconecta por inactividad: la caja queda abierta durante su turno.
    if (auth.esEncargadoTienda) return;
    detener = iniciarControlInactividad(() => {
      auth.logout();
      router.push({ name: 'login', query: { expirada: '1' } });
    });
  },
  { immediate: true },
);

function alSesionInvalida() {
  if (!auth.autenticado) return;
  // El encargado de tienda sigue en su caja (con la venta que tenga a medias); solo se le pide confirmar la contraseña.
  if (auth.esEncargadoTienda) return auth.pasarASesionLocal();
  auth.logout();
  router.push({ name: 'login', query: { expirada: '1' } });
}
window.addEventListener('sesion-invalida', alSesionInvalida);

onBeforeUnmount(() => {
  detener?.();
  window.removeEventListener('sesion-invalida', alSesionInvalida);
  window.removeEventListener('mantenimiento', alMantenimiento);
});
</script>

<template>
  <!-- Las páginas crecen (flex-1) para que el pie quede siempre abajo, aunque haya poco contenido. -->
  <div class="flex min-h-screen flex-col">
    <router-view />
    <AppFooter />
  </div>
  <AvisosGlobales />
  <ConfirmarDialogo />
  <AvisoInactividad />
  <!-- Indicador de carga: barra fina arriba mientras algo espera respuesta y, si tarda, un aviso con salida. -->
  <div v-if="red.activas > 0" class="barra-carga" role="progressbar" aria-label="Cargando" />
  <div v-if="red.lentas > 0" class="fixed inset-x-3 bottom-4 z-[90] mx-auto flex max-w-md items-center justify-center gap-3 rounded-2xl border border-amber-600 bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg" role="status">
    <span class="cargando-anillo size-5 shrink-0" aria-hidden="true" />
    <span>Está tardando más de lo normal. Revise su conexión a internet.</span>
    <button type="button" class="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-black" @click="recargar">Recargar</button>
  </div>
  <div v-else-if="red.error" class="fixed inset-x-3 bottom-4 z-[90] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-red-800 bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-lg" role="alert">
    <span>{{ red.error }}</span>
    <button type="button" class="rounded-lg px-2 py-1 font-semibold underline" @click="red.error = ''">Cerrar</button>
  </div>
  <div v-if="mantenimiento" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4">
    <div class="card w-full max-w-sm text-center">
      <p class="mb-2 text-xl font-bold text-slate-900">Sistema en mantenimiento</p>
      <p class="mb-4 text-base text-slate-600">{{ mantenimiento }}</p>
      <button type="button" class="btn-primary w-full" @click="reintentar">Reintentar</button>
      <button type="button" class="mt-2 w-full text-sm text-slate-500 underline" @click="auth.logout(); mantenimiento = ''; router.push({ name: 'login' })">Salir</button>
    </div>
  </div>
</template>
