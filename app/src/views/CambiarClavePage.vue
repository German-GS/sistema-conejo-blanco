<script setup>
import CampoClave from '../components/CampoClave.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { useAuthStore } from '../stores/auth.js';
import { api, ApiError } from '../lib/api.js';

const auth = useAuthStore();
const router = useRouter();

const debeCambiarClave = computed(() => Boolean(auth.usuario?.debeCambiarClave));
const exigeDosPasos = computed(() => Boolean(auth.usuario?.requiereDosPasos));
const obligatorio = computed(() => debeCambiarClave.value || exigeDosPasos.value);

// ---- Contraseña ----
const actual = ref('');
const nueva = ref('');
const repetir = ref('');
const error = ref('');
const cargando = ref(false);
const claveCambiada = ref(false);

// Largo mínimo definido por el administrador del sistema.
const minimo = computed(() => auth.config.claveLargoMinimo ?? 10);

const cumple = computed(() => ({
  largo: nueva.value.length >= minimo.value,
  mezcla: /[A-Za-z]/.test(nueva.value) && /\d/.test(nueva.value),
  distinta: nueva.value !== '' && nueva.value !== actual.value,
  coincide: nueva.value !== '' && nueva.value === repetir.value,
}));
const valido = computed(() => actual.value !== '' && Object.values(cumple.value).every(Boolean));

function destino() {
  return auth.usaPanelAdmin ? { name: 'admin-home' } : { name: 'vendedor-home' };
}
function salirSiTodoListo() {
  if (!auth.usuario?.debeCambiarClave && !auth.usuario?.requiereDosPasos) router.push(destino());
}

async function enviar() {
  error.value = '';
  cargando.value = true;
  try {
    await auth.cambiarPassword(actual.value, nueva.value);
    claveCambiada.value = true;
    actual.value = nueva.value = repetir.value = '';
    salirSiTodoListo();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.';
  } finally {
    cargando.value = false;
  }
}

// ---- Verificación en dos pasos ----
const paso = ref('inicio'); // inicio | escanear
const qr = ref('');
const secreto = ref('');
const codigo = ref('');
const errorDosPasos = ref('');
const passwordDesactivar = ref('');
const trabajando = ref(false);

async function iniciarDosPasos() {
  errorDosPasos.value = '';
  trabajando.value = true;
  try {
    const r = await api.post('/auth/dos-pasos/iniciar', {});
    secreto.value = r.secreto;
    qr.value = await QRCode.toDataURL(r.otpauthUrl, { width: 200, margin: 1 });
    codigo.value = '';
    paso.value = 'escanear';
  } catch (err) {
    errorDosPasos.value = err instanceof ApiError ? err.message : 'No se pudo iniciar.';
  } finally {
    trabajando.value = false;
  }
}
async function activarDosPasos() {
  errorDosPasos.value = '';
  trabajando.value = true;
  try {
    await auth.activarDosPasos(codigo.value);
    paso.value = 'inicio';
    salirSiTodoListo();
  } catch (err) {
    errorDosPasos.value = err instanceof ApiError ? err.message : 'No se pudo activar.';
  } finally {
    trabajando.value = false;
  }
}
async function desactivarDosPasos() {
  errorDosPasos.value = '';
  trabajando.value = true;
  try {
    await auth.desactivarDosPasos(passwordDesactivar.value, codigo.value);
    passwordDesactivar.value = codigo.value = '';
  } catch (err) {
    errorDosPasos.value = err instanceof ApiError ? err.message : 'No se pudo desactivar.';
  } finally {
    trabajando.value = false;
  }
}

function cancelar() {
  router.back();
}
function salir() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="flex flex-1 items-start justify-center px-4 py-8">
    <div class="flex w-full max-w-sm flex-col gap-4">
      <form class="card" @submit.prevent="enviar">
        <h1 class="mb-1 text-2xl font-bold text-slate-900">Mi cuenta</h1>
        <p v-if="debeCambiarClave" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">Entraste con una clave temporal. Elegí tu propia contraseña (fácil para vos de recordar, pero no tan fácil de adivinar: por ejemplo, tres palabras y un número) para continuar.</p>
        <p v-else-if="exigeDosPasos" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">Tu perfil exige verificación en dos pasos. Activala abajo para continuar.</p>
        <p v-else class="mb-4 text-base text-slate-500">Cambiá tu contraseña. Se mantiene tu sesión en este equipo.</p>

        <p class="mb-2 text-base font-semibold text-slate-900">Contraseña</p>
        <label class="label" for="actual">Contraseña actual</label>
        <CampoClave id="actual" v-model="actual" required autocomplete="current-password" class="mb-4" />

        <label class="label" for="nueva">Contraseña nueva</label>
        <CampoClave id="nueva" v-model="nueva" required autocomplete="new-password" class="mb-2" />
        <ul class="mb-4 space-y-0.5 text-sm">
          <li :class="cumple.largo ? 'text-green-700' : 'text-slate-500'">{{ cumple.largo ? '✓' : '•' }} Al menos {{ minimo }} caracteres</li>
          <li :class="cumple.mezcla ? 'text-green-700' : 'text-slate-500'">{{ cumple.mezcla ? '✓' : '•' }} Letras y números</li>
          <li :class="cumple.distinta ? 'text-green-700' : 'text-slate-500'">{{ cumple.distinta ? '✓' : '•' }} Distinta de la actual</li>
        </ul>

        <label class="label" for="repetir">Repetir contraseña nueva</label>
        <CampoClave id="repetir" v-model="repetir" required autocomplete="new-password" class="mb-1" />
        <p v-if="repetir && !cumple.coincide" class="mb-3 text-sm text-red-600">No coinciden.</p>
        <div v-else class="mb-3" />

        <p v-if="error" class="mb-4 text-base font-medium text-red-600">{{ error }}</p>
        <p v-if="claveCambiada && !error" class="mb-3 text-sm font-medium text-green-700">Contraseña cambiada.</p>

        <button type="submit" class="btn-primary w-full" :disabled="!valido || cargando">{{ cargando ? 'Guardando…' : 'Guardar contraseña' }}</button>
      </form>

      <section class="card">
        <p class="mb-1 text-base font-semibold text-slate-900">Verificación en dos pasos</p>
        <p class="mb-3 text-sm text-slate-500">Además de la contraseña, el ingreso pide un código de 6 dígitos de una app autenticadora en tu teléfono.</p>

        <template v-if="auth.usuario?.totpActivo">
          <p class="mb-3 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">Activada: tu cuenta pide el código al ingresar.</p>
          <details class="text-sm">
            <summary class="cursor-pointer font-semibold text-slate-700">Desactivarla</summary>
            <div class="mt-3 flex flex-col gap-2">
              <CampoClave v-model="passwordDesactivar" placeholder="Tu contraseña" autocomplete="current-password" />
              <input v-model="codigo" inputmode="numeric" class="input" placeholder="Código actual de la app" maxlength="7" />
              <button type="button" class="btn-secondary" :disabled="trabajando || !passwordDesactivar || codigo.length < 6" @click="desactivarDosPasos">Desactivar verificación en dos pasos</button>
            </div>
          </details>
        </template>

        <template v-else-if="paso === 'inicio'">
          <button type="button" class="btn-primary w-full" :disabled="trabajando" @click="iniciarDosPasos">Activar verificación en dos pasos</button>
        </template>

        <template v-else>
          <ol class="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Instalá una app autenticadora (Google Authenticator, Microsoft Authenticator o Authy).</li>
            <li>Escaneá este código QR con la app (o escribí la clave a mano).</li>
            <li>Escribí abajo el código de 6 dígitos que muestra la app.</li>
          </ol>
          <img v-if="qr" :src="qr" alt="Código QR para la app autenticadora" class="mx-auto mb-2 size-48 rounded-lg border border-slate-200" />
          <p class="mb-3 select-all break-all text-center font-mono text-xs text-slate-600">{{ secreto }}</p>
          <input v-model="codigo" inputmode="numeric" class="input mb-3 text-center text-xl tracking-widest" placeholder="000000" maxlength="7" autocomplete="one-time-code" />
          <div class="flex gap-2">
            <button type="button" class="btn-secondary flex-1" @click="paso = 'inicio'">Cancelar</button>
            <button type="button" class="btn-primary flex-1" :disabled="trabajando || codigo.replace(/\s/g, '').length !== 6" @click="activarDosPasos">Activar</button>
          </div>
        </template>

        <p v-if="errorDosPasos" class="mt-3 text-sm font-medium text-red-600">{{ errorDosPasos }}</p>
      </section>

      <button v-if="!obligatorio" type="button" class="btn-secondary w-full" @click="cancelar">Volver</button>
      <button v-else type="button" class="text-sm text-slate-500 underline" @click="salir">Salir</button>
    </div>
  </div>
</template>
