<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../lib/api.js';
import { confirmar } from '../lib/confirmar.js';
import { accionFirmada, leerCelular, olvidarCelular, registrarCelular, soportaLlaves } from '../lib/dispositivoMarca.js';
import logo from '../logo/logo-login.png';

// Pantalla del empleado en su celular, sin cuenta del sistema: se activa una vez con un código del administrador
// (elige su PIN y el celular queda registrado) y de ahí en adelante todo se prueba con ese celular + el PIN.
const route = useRoute();
const router = useRouter();
const cargando = ref(true);
const celular = ref(null);
const soportado = soportaLlaves();
const codigo = ref(String(route.query.c ?? ''));
// Con un código de activación en el enlace siempre se muestra la activación, aunque este celular tuviera un registro viejo (se reemplaza).
const activando = ref(Boolean(route.query.c));
const pin = ref('');
const pin2 = ref('');
const error = ref('');
const ocupado = ref(false);
// QR de la pantalla de la empresa: llega en el enlace al escanear con la cámara.
const puntoQr = ref(String(route.query.p ?? ''));
const codigoQr = ref(String(route.query.k ?? ''));
const marca = ref(null);
const ubicacion = ref(null);
const estadoUbicacion = ref('');

// Se pide la ubicación apenas se abre la página (mientras la persona escribe el PIN) para no perder segundos con el QR.
function leerUbicacion() {
  if (!navigator.geolocation) return (estadoUbicacion.value = 'Este celular no permite leer la ubicación.');
  estadoUbicacion.value = 'Buscando su ubicación…';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      ubicacion.value = { latitud: p.coords.latitude, longitud: p.coords.longitude, precision: p.coords.accuracy };
      estadoUbicacion.value = `Ubicación lista (±${Math.round(p.coords.accuracy)} m).`;
    },
    () => (estadoUbicacion.value = 'Sin ubicación: la marca se guarda, pero queda por revisar. Active el permiso de ubicación.'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  );
}

onMounted(async () => {
  try {
    celular.value = soportado ? await leerCelular() : null;
    if (celular.value && !activando.value) leerUbicacion();
  } catch {
    celular.value = null;
  } finally {
    cargando.value = false;
  }
});

const soloNumeros = (v) => v.replace(/\D/g, '').slice(0, 6);

async function activar() {
  error.value = '';
  if (pin.value !== pin2.value) return (error.value = 'Los dos PIN no son iguales.');
  if (!/^\d{6}$/.test(pin.value)) return (error.value = 'El PIN debe tener 6 números.');
  ocupado.value = true;
  try {
    const e = await registrarCelular(codigo.value, pin.value);
    celular.value = { nombre: e.nombre };
    activando.value = false;
    leerUbicacion();
    // Se quita el código de la barra de direcciones: ya no sirve y no debe quedar a la vista.
    router.replace({ name: 'marcar' });
    pin.value = pin2.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo activar este celular.';
  } finally {
    ocupado.value = false;
  }
}

async function marcar() {
  error.value = '';
  marca.value = null;
  if (!/^\d{6}$/.test(pin.value)) return (error.value = 'El PIN tiene 6 números.');
  ocupado.value = true;
  try {
    const datos = { accion: 'marcar', ...(codigoQr.value ? { puntoId: puntoQr.value, codigo: codigoQr.value } : {}), ...(ubicacion.value ?? {}) };
    marca.value = await accionFirmada('/marca/marcar', datos, pin.value);
    // El QR se usa una sola vez: se quita de la dirección para que un «recargar» no marque otra vez.
    codigoQr.value = puntoQr.value = '';
    router.replace({ name: 'marcar' });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo marcar.';
  } finally {
    pin.value = '';
    ocupado.value = false;
  }
}

// Solo borra la llave de ESTE celular; para volver a usarlo hace falta un código nuevo del administrador.
async function olvidar() {
  if (!(await confirmar('¿Quitar el registro de este celular? Para volver a usarlo el administrador del sistema debe darle un código nuevo.'))) return;
  await olvidarCelular();
  celular.value = null;
}
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 py-8">
    <img :src="logo" alt="Conejo Blanco" class="mx-auto h-16 w-auto" />
    <h1 class="text-center text-xl font-bold text-slate-900">Marcar asistencia</h1>

    <p v-if="cargando" class="text-center text-sm text-slate-500">Cargando…</p>
    <p v-else-if="!soportado" class="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      Este navegador no permite registrar el celular de forma segura. Abra el enlace en Chrome (Android) o Safari (iPhone) actualizados, con la página completa y sin modo privado.
    </p>

    <!-- Celular ya registrado -->
    <form v-else-if="celular && !activando" class="card flex flex-col gap-3" @submit.prevent="marcar">
      <p class="text-center text-sm text-slate-600">Hola, <strong>{{ celular.nombre }}</strong></p>

      <div v-if="marca" class="rounded-xl border border-green-300 bg-green-50 p-3 text-center">
        <p class="text-lg font-bold text-green-800">Marca registrada {{ marca.hora }}</p>
        <p class="text-xs text-green-800">{{ marca.punto }}</p>
        <p v-if="marca.aviso" class="mt-1 text-xs font-medium text-amber-800">{{ marca.aviso }}</p>
        <p v-if="marca.marcasDelDia?.length" class="mt-1 text-xs text-slate-700">Hoy: {{ marca.marcasDelDia.join(' · ') }}</p>
      </div>

      <template v-else>
        <p v-if="!codigoQr" class="rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-900">Para marcar en la empresa, escanee el código QR de la pantalla con la cámara de este celular.</p>
        <div>
          <label class="label" for="pin">Su PIN</label>
          <input id="pin" :value="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" class="input text-center text-2xl tracking-[0.5em]" @input="pin = soloNumeros($event.target.value)" />
        </div>
        <button type="submit" class="btn-primary" :disabled="ocupado || pin.length !== 6">{{ ocupado ? 'Marcando…' : 'Marcar' }}</button>
        <p class="text-center text-xs text-slate-500">{{ estadoUbicacion }}</p>
      </template>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      <button v-if="marca" type="button" class="btn-secondary" @click="marca = null">Listo</button>
      <button type="button" class="text-center text-xs text-slate-500 underline" @click="olvidar">Quitar el registro de este celular</button>
    </form>

    <!-- Celular nuevo: se activa con el código del administrador -->
    <form v-else class="card flex flex-col gap-3" @submit.prevent="activar">
      <p class="text-sm text-slate-600">Para usar este celular escriba el código que le dio el administrador del sistema y elija un PIN de 6 números que solo usted conozca. <strong>Este será el único celular con el que podrá marcar.</strong></p>
      <div>
        <label class="label" for="codigo">Código de activación</label>
        <input id="codigo" v-model="codigo" type="text" autocapitalize="characters" autocomplete="off" class="input text-center font-mono tracking-widest" placeholder="XXXXXXXXXX" />
      </div>
      <div>
        <label class="label" for="pin-nuevo">Elija su PIN (6 números)</label>
        <input id="pin-nuevo" :value="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" class="input text-center text-2xl tracking-[0.5em]" @input="pin = soloNumeros($event.target.value)" />
      </div>
      <div>
        <label class="label" for="pin-repetir">Repita su PIN</label>
        <input id="pin-repetir" :value="pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" class="input text-center text-2xl tracking-[0.5em]" @input="pin2 = soloNumeros($event.target.value)" />
      </div>
      <button type="submit" class="btn-primary" :disabled="ocupado || !codigo || pin.length !== 6 || pin2.length !== 6">{{ ocupado ? 'Activando…' : 'Activar este celular' }}</button>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </main>
</template>
