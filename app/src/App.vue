<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AppFooter from './components/AppFooter.vue';
import { iniciarControlInactividad, fijarMinutosInactividad } from './lib/inactividad.js';
import { tema } from './lib/tema.js';

const auth = useAuthStore();
const router = useRouter();

let detener = null;

// La cuenta del administrador del sistema usa tema oscuro (negro en lugar de blanco); el resto, el claro de siempre.
watch(
  [() => auth.esSistema, tema],
  ([esSistema, elegido]) => document.documentElement.classList.toggle('tema-oscuro', Boolean(esSistema) && elegido === 'oscuro'),
  { immediate: true },
);
const mantenimiento = ref('');

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
  <div v-if="mantenimiento" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4">
    <div class="card w-full max-w-sm text-center">
      <p class="mb-2 text-xl font-bold text-slate-900">Sistema en mantenimiento</p>
      <p class="mb-4 text-base text-slate-600">{{ mantenimiento }}</p>
      <button type="button" class="btn-primary w-full" @click="reintentar">Reintentar</button>
      <button type="button" class="mt-2 w-full text-sm text-slate-500 underline" @click="auth.logout(); mantenimiento = ''; router.push({ name: 'login' })">Salir</button>
    </div>
  </div>
</template>
