<script setup>
import CampoClave from '../components/CampoClave.vue';
import { onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { ApiError } from '../lib/api.js';
import logo from '../logo/logo-login.png';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const sinInternet = ref(typeof navigator !== 'undefined' && !navigator.onLine);
const marcarEstado = () => (sinInternet.value = !navigator.onLine);
window.addEventListener('online', marcarEstado);
window.addEventListener('offline', marcarEstado);
onBeforeUnmount(() => {
  window.removeEventListener('online', marcarEstado);
  window.removeEventListener('offline', marcarEstado);
});

const email = ref('');
const password = ref('');
const error = ref('');
const cargando = ref(false);
const ticket = ref('');
const codigo = ref('');

async function enviar() {
  error.value = '';
  cargando.value = true;
  try {
    if (ticket.value) {
      await auth.loginDosPasos(ticket.value, codigo.value);
    } else {
      const paso2 = await auth.login(email.value.trim(), password.value);
      if (paso2) {
        // La cuenta tiene verificación en dos pasos: falta el código de la app autenticadora.
        ticket.value = paso2.ticket;
        return;
      }
    }

    // El redirect guardado (a dónde intentaba entrar antes de loguearse)
    // solo se respeta si es del tipo de panel que le corresponde a su
    // rol — si no, aunque haya un redirect a mano, se manda a su propio
    // inicio. Sin este chequeo, un asistente o contador que primero
    // pisó "/" (la home del vendedor) terminaba viendo esa UI en vez de
    // su panel, aunque no tenga nada que ver con su rol.
    const destinoPorDefecto = auth.esEncargadoTienda ? { name: 'pos' } : auth.usaPanelAdmin ? { name: 'admin-home' } : { name: 'vendedor-home' };
    const redirect = route.query.redirect;
    const redirectValido = redirect && (auth.usaPanelAdmin ? redirect.startsWith('/admin') : !redirect.startsWith('/admin'));
    router.push(redirectValido ? redirect : destinoPorDefecto);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.';
    // Ticket vencido (5 minutos): se vuelve a pedir la clave.
    if (ticket.value && err instanceof ApiError && err.status === 401 && /venci|v[aá]lido|Ingres/i.test(err.message)) {
      ticket.value = '';
      codigo.value = '';
    }
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-8">
    <form class="card w-full max-w-sm" @submit.prevent="enviar">
      <img :src="logo" alt="Conejo Blanco" class="mx-auto mb-3 size-36 object-contain" />
      <h1 class="mb-1 text-center text-2xl font-bold text-slate-900">Conejo Blanco</h1>
      <p class="mb-6 text-center text-base text-slate-500">Ingresá con tu cuenta</p>

      <p v-if="route.query.expirada" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
        Tu sesión se cerró por inactividad. Volvé a ingresar para continuar.
      </p>

      <p v-if="sinInternet" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
        No hay internet. Si usted ya entró antes en esta computadora, puede entrar con su correo y contraseña de siempre y seguir trabajando; lo que haga se enviará cuando vuelva la conexión.
      </p>

      <template v-if="!ticket">
        <label class="label" for="email">Correo</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" class="input mb-4" />

        <label class="label" for="password">Contraseña</label>
        <CampoClave id="password" v-model="password" required autocomplete="current-password" class="mb-4" />
      </template>
      <template v-else>
        <p class="mb-3 text-sm text-slate-600">Abrí tu app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…) y escribí el código de 6 dígitos de Conejo Blanco.</p>
        <label class="label" for="codigo">Código de verificación</label>
        <input id="codigo" v-model="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required class="input mb-4 text-center text-xl tracking-widest" autofocus />
      </template>

      <p v-if="error" class="mb-4 text-base font-medium text-red-600">{{ error }}</p>

      <button type="submit" class="btn-primary w-full" :disabled="cargando">
        {{ cargando ? 'Entrando…' : ticket ? 'Verificar' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>
