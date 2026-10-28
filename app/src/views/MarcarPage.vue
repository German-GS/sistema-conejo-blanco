<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { API_URL, ApiError } from '../lib/api.js';
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
// Lo que ve la persona después de tocar «Marcar»: ok (quedó registrada), error (NO quedó), dudoso (la señal falló justo al
// enviar: puede o no haber quedado) o aviso (ya tenía una marca reciente).
const resultado = ref(null);
const progreso = ref('');
const historial = ref(null);
const enLinea = ref(navigator.onLine);
// Envío del que no se sabe si llegó: se guarda (solo en memoria) para reintentarlo igual, con el mismo identificador de intento.
let pendiente = null;
const alConectar = () => (enLinea.value = true);
const alDesconectar = () => (enLinea.value = false);

onMounted(async () => {
  window.addEventListener('online', alConectar);
  window.addEventListener('offline', alDesconectar);
  // Despierta el servidor mientras la persona escribe su PIN: si estaba en reposo tarda varios segundos y el QR dura poco.
  fetch(`${API_URL}/sistema/publico`).catch(() => {});
  try {
    celular.value = soportado ? await leerCelular() : null;
  } catch {
    celular.value = null;
  } finally {
    cargando.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('online', alConectar);
  window.removeEventListener('offline', alDesconectar);
  pendiente = null;
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
    // Se quita el código de la barra de direcciones: ya no sirve y no debe quedar a la vista.
    router.replace({ name: 'marcar' });
    pin.value = pin2.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo activar este celular.';
  } finally {
    ocupado.value = false;
  }
}

const nuevoIntento = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Convierte lo que falló en algo que la persona entienda: qué pasó y, sobre todo, si su marca quedó o no.
function describirFallo(err) {
  const noQuedo = 'No se registró su marca';
  if (!(err instanceof ApiError)) return { tipo: 'error', titulo: noQuedo, detalle: 'Ocurrió un error inesperado. Intente de nuevo.' };
  if (err.status === 0 && err.enviada) {
    return { tipo: 'dudoso', titulo: 'No sabemos si su marca quedó registrada', detalle: 'La señal falló justo cuando se enviaba. Toque «Reintentar»: si ya estaba guardada el sistema se lo confirma, sin duplicarla.' };
  }
  if (err.status === 0) {
    return { tipo: 'error', titulo: noQuedo, detalle: err.tiempoAgotado ? 'El servidor tardó demasiado en responder. No se guardó nada: intente de nuevo.' : 'No hay conexión a internet. No se guardó nada: cuando tenga señal, intente de nuevo.' };
  }
  if (err.status >= 500 || err.status === 408) {
    return { tipo: 'dudoso', titulo: 'No sabemos si su marca quedó registrada', detalle: 'El servidor tuvo un problema al responder. Toque «Reintentar»: si ya estaba guardada el sistema se lo confirma, sin duplicarla.' };
  }
  if (err.status === 409) return { tipo: 'aviso', titulo: 'Ya tiene una marca reciente', detalle: err.message };
  return { tipo: 'error', titulo: noQuedo, detalle: err.message };
}

async function enviarMarca(datos, pinUsado) {
  ocupado.value = true;
  resultado.value = null;
  error.value = '';
  progreso.value = 'Enviando su marca…';
  const lento = setTimeout(() => (progreso.value = 'Sigue conectando… si el servidor estaba en reposo puede tardar unos segundos.'), 8000);
  let ultimo = null;
  try {
    // Si el envío salió pero no llegó respuesta se reintenta solo, con el mismo identificador: el servidor no la duplica.
    for (let vez = 0; vez < 3; vez++) {
      try {
        const r = await accionFirmada('/marca/marcar', datos, pinUsado, { tiempoMs: 30_000 });
        resultado.value = { tipo: 'ok', marca: r };
        pendiente = null;
        // El QR se usa una sola vez: se quita de la dirección para que un «recargar» no marque otra vez.
        codigoQr.value = puntoQr.value = '';
        router.replace({ name: 'marcar' });
        navigator.vibrate?.(200);
        // Con el PIN que acaba de escribir se actualiza el historial, sin pedírselo otra vez.
        cargarHistorial(pinUsado, { silencioso: true });
        return;
      } catch (err) {
        ultimo = err;
        if (!(err instanceof ApiError && err.status === 0 && err.enviada) || vez === 2) break;
        progreso.value = 'La señal falló, reintentando…';
        await esperar(2500);
      }
    }
    resultado.value = describirFallo(ultimo);
    pendiente = resultado.value.tipo === 'dudoso' ? { datos, pin: pinUsado } : null;
  } finally {
    clearTimeout(lento);
    progreso.value = '';
    pin.value = '';
    ocupado.value = false;
  }
}

async function marcar() {
  error.value = '';
  if (!/^\d{6}$/.test(pin.value)) return (error.value = 'El PIN tiene 6 números.');
  if (!codigoQr.value) return (resultado.value = { tipo: 'error', titulo: 'Falta el código QR', detalle: 'Escanee el código QR de la pantalla de la empresa con la cámara de este celular y escriba su PIN.' });
  await enviarMarca({ accion: 'marcar', puntoId: puntoQr.value, codigo: codigoQr.value, intento: nuevoIntento() }, pin.value);
}

const reintentar = () => pendiente && enviarMarca(pendiente.datos, pendiente.pin);
function descartarPendiente() {
  pendiente = null;
  resultado.value = null;
}

// Historial de entradas y salidas (solo se mira). Responde también a «¿se registró mi marca?».
async function cargarHistorial(pinUsado, { silencioso = false } = {}) {
  try {
    historial.value = await accionFirmada('/marca/historico', { accion: 'historico' }, pinUsado, { tiempoMs: 30_000 });
    return true;
  } catch (err) {
    if (silencioso) return false;
    historial.value = null;
    const sinRed = err instanceof ApiError && err.status === 0;
    resultado.value = { tipo: 'error', titulo: 'No se pudo consultar', detalle: sinRed ? 'No hay conexión con el servidor. Intente de nuevo cuando tenga señal.' : err instanceof ApiError && err.status < 500 ? err.message : 'El servidor tuvo un problema. Intente de nuevo en un momento.' };
    return false;
  }
}

async function verHistorial() {
  error.value = '';
  resultado.value = null;
  if (!/^\d{6}$/.test(pin.value)) return (error.value = 'Escriba su PIN de 6 números para ver su historial.');
  ocupado.value = true;
  progreso.value = 'Consultando…';
  try {
    await cargarHistorial(pin.value);
  } finally {
    progreso.value = '';
    pin.value = '';
    ocupado.value = false;
  }
}

const diaCorto = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'short', day: '2-digit', month: '2-digit' });

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
      <p v-if="!enLinea" class="rounded-lg border border-red-300 bg-red-50 p-2 text-center text-xs font-semibold text-red-800" role="alert">Sin conexión a internet. No podrá marcar hasta que vuelva la señal.</p>

      <!-- Quedó registrada -->
      <div v-if="resultado?.tipo === 'ok'" class="rounded-xl border border-green-300 bg-green-50 p-3 text-center" role="status">
        <p class="text-lg font-bold text-green-800">✓ Marca registrada {{ resultado.marca.hora }}</p>
        <p class="text-xs text-green-800">{{ resultado.marca.punto }}</p>
        <p v-if="resultado.marca.repetida" class="mt-1 text-xs font-medium text-green-800">Esta marca ya estaba guardada: no se duplicó.</p>
        <p v-if="resultado.marca.aviso" class="mt-1 text-xs font-medium text-amber-800">{{ resultado.marca.aviso }}</p>
        <p v-if="resultado.marca.marcasDelDia?.length" class="mt-1 text-xs text-slate-700">Hoy: {{ resultado.marca.marcasDelDia.join(' · ') }}</p>
      </div>
      <button v-if="resultado?.tipo === 'ok'" type="button" class="btn-secondary" @click="resultado = null">Listo</button>

      <!-- No se sabe si llegó -->
      <template v-else-if="resultado?.tipo === 'dudoso'">
        <div class="rounded-xl border border-amber-400 bg-amber-50 p-3 text-center" role="alert">
          <p class="font-bold text-amber-900">{{ resultado.titulo }}</p>
          <p class="mt-1 text-xs text-amber-900">{{ resultado.detalle }}</p>
        </div>
        <button type="button" class="btn-primary" :disabled="ocupado || !enLinea" @click="reintentar">{{ ocupado ? 'Reintentando…' : 'Reintentar' }}</button>
        <p v-if="progreso" class="text-center text-xs text-slate-500">{{ progreso }}</p>
        <button type="button" class="text-center text-xs text-slate-500 underline" @click="descartarPendiente">Cancelar</button>
      </template>

      <template v-else>
        <!-- NO quedó registrada, o ya tenía una reciente -->
        <div v-if="resultado" class="rounded-xl border p-3 text-center" :class="resultado.tipo === 'aviso' ? 'border-blue-300 bg-blue-50' : 'border-red-300 bg-red-50'" role="alert">
          <p class="font-bold" :class="resultado.tipo === 'aviso' ? 'text-blue-900' : 'text-red-800'">{{ resultado.tipo === 'aviso' ? '' : '✗ ' }}{{ resultado.titulo }}</p>
          <p class="mt-1 text-xs" :class="resultado.tipo === 'aviso' ? 'text-blue-900' : 'text-red-800'">{{ resultado.detalle }}</p>
        </div>
        <p v-if="!codigoQr && !resultado" class="rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-900">Para marcar en la empresa, escanee el código QR de la pantalla con la cámara de este celular.</p>
        <div>
          <label class="label" for="pin">Su PIN</label>
          <input id="pin" :value="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" class="input text-center text-2xl tracking-[0.5em]" @input="pin = soloNumeros($event.target.value)" />
        </div>
        <button type="submit" class="btn-primary" :disabled="ocupado || !enLinea || pin.length !== 6">{{ ocupado ? 'Marcando…' : 'Marcar' }}</button>
        <p v-if="progreso" class="text-center text-xs text-slate-500">{{ progreso }}</p>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>

        <button type="button" class="text-center text-sm font-medium text-blue-700 underline" :disabled="ocupado || !enLinea" @click="verHistorial">Ver mi historial de marcas (¿se registró mi marca?)</button>
      </template>
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

    <!-- Historial de entradas y salidas: solo para consultar -->
    <section v-if="historial && celular && !activando" class="card flex flex-col gap-2" aria-label="Historial de marcas">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-sm font-bold text-slate-900">Mi historial de marcas</h2>
        <button type="button" class="text-xs text-slate-500 underline" @click="historial = null">Ocultar</button>
      </div>
      <p class="text-xs text-slate-500">Solo para consultar. Últimos {{ historial.dias.length }} días{{ historial.puntualidad ? ` · tolerancia: entrada ${historial.toleranciaEntrada} min, salida ${historial.toleranciaSalida} min` : '' }}.</p>
      <ul class="flex flex-col divide-y divide-slate-100">
        <li v-for="d in historial.dias" :key="d.fecha" class="flex flex-col gap-1 py-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold capitalize" :class="d.fecha === historial.hoy ? 'text-blue-700' : 'text-slate-900'">{{ diaCorto(d.fecha) }}<template v-if="d.fecha === historial.hoy"> · hoy</template></span>
            <span v-if="d.horario" class="text-xs text-slate-500">Horario {{ d.horario }}</span>
          </div>
          <div v-if="d.entrada || d.salida" class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span class="text-xs text-slate-500">Entrada</span>
              <p class="font-semibold tabular-nums">{{ d.entrada ?? '—' }}</p>
              <p v-if="d.entradaEstado === 'a_tiempo'" class="text-xs font-semibold text-green-700">a tiempo</p>
              <p v-else-if="d.entradaEstado === 'tarde'" class="text-xs font-semibold text-amber-800">{{ d.entradaMinutos }} min tarde</p>
            </div>
            <div>
              <span class="text-xs text-slate-500">Salida</span>
              <p class="font-semibold tabular-nums">{{ d.salida ?? '—' }}</p>
              <p v-if="d.salidaEstado === 'a_tiempo'" class="text-xs font-semibold text-green-700">a tiempo</p>
              <p v-else-if="d.salidaEstado === 'antes'" class="text-xs font-semibold text-amber-800">{{ d.salidaMinutos }} min antes</p>
            </div>
          </div>
          <p v-if="d.nota" class="text-xs text-slate-500">{{ d.nota }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>
