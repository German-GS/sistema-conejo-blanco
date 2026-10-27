<script setup>
import { onMounted, reactive, ref } from 'vue';
import QRCode from 'qrcode';
import { MapPin } from '@lucide/vue';
import { useRouter } from 'vue-router';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { confirmar } from '../../../lib/confirmar.js';
import { exito, fallo } from '../../../lib/avisos.js';
import { formatearFechaHora } from '../../../lib/format.js';

// Solo el administrador del sistema: dónde se puede marcar (la empresa, cada tienda), qué tan cerca hay que estar
// y la pantalla (tablet) que muestra el QR que cambia cada 30 segundos.
const router = useRouter();
const puntos = ref([]);
const cargando = ref(true);
const error = ref('');
const edicion = ref(null); // null = cerrado; {} = nuevo
const form = reactive({ nombre: '', tipo: 'empresa', latitud: '', longitud: '', radioMetros: 100, requiereQr: true, activo: true });
const guardando = ref(false);
const pantalla = ref(null); // { nombre, enlace, qr }
const leyendo = ref(false);

async function cargar() {
  cargando.value = true;
  try {
    puntos.value = await api.get('/planilla/puntos-marca');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

function abrir(p) {
  edicion.value = p ?? {};
  Object.assign(form, p ? { nombre: p.nombre, tipo: p.tipo, latitud: p.latitud ?? '', longitud: p.longitud ?? '', radioMetros: p.radioMetros, requiereQr: p.requiereQr, activo: p.activo } : { nombre: '', tipo: 'empresa', latitud: '', longitud: '', radioMetros: 100, requiereQr: true, activo: true });
}

// Para fijar las coordenadas basta pararse en el lugar con este mismo aparato y tocar el botón.
function usarMiUbicacion() {
  if (!navigator.geolocation) return fallo('Este navegador no permite leer la ubicación.');
  leyendo.value = true;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      form.latitud = Number(p.coords.latitude.toFixed(6));
      form.longitud = Number(p.coords.longitude.toFixed(6));
      leyendo.value = false;
      exito(`Ubicación tomada (±${Math.round(p.coords.accuracy)} m). Si es mucho, hágalo cerca de una ventana o afuera.`);
    },
    () => {
      leyendo.value = false;
      fallo('No se pudo leer la ubicación. Revise el permiso del navegador.');
    },
    { enableHighAccuracy: true, timeout: 20000 },
  );
}

async function guardar() {
  guardando.value = true;
  try {
    const cuerpo = { ...form, latitud: form.latitud === '' ? null : Number(form.latitud), longitud: form.longitud === '' ? null : Number(form.longitud), radioMetros: Number(form.radioMetros) };
    if (edicion.value?.id) await api.patch(`/planilla/puntos-marca/${edicion.value.id}`, cuerpo);
    else await api.post('/planilla/puntos-marca', cuerpo);
    exito('Punto de marca guardado.');
    edicion.value = null;
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo guardar.');
  } finally {
    guardando.value = false;
  }
}

async function nuevaPantalla(p) {
  if (p.pantallaUltimaVez && !(await confirmar(`¿Generar un enlace nuevo para la pantalla de ${p.nombre}? La tablet actual deja de mostrar el QR hasta que abra el enlace nuevo.`, { aceptar: 'Sí, generar enlace nuevo', peligro: true }))) return;
  try {
    const r = await api.post(`/planilla/puntos-marca/${p.id}/pantalla`, {});
    const enlace = new URL(router.resolve({ name: 'punto-pantalla', query: { p: r.puntoId, t: r.token } }).href, window.location.origin).href;
    pantalla.value = { nombre: r.nombre, enlace, qr: await QRCode.toDataURL(enlace, { width: 240, margin: 1 }) };
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo generar el enlace.');
  }
}

const copiar = async (t) => {
  try {
    await navigator.clipboard.writeText(t);
    exito('Enlace copiado.');
  } catch {
    fallo('No se pudo copiar: seleccione el enlace y cópielo a mano.');
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <MapPin class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Puntos de marca</h1>
      </div>
      <button type="button" class="btn-primary" @click="abrir()">Nuevo punto</button>
    </div>
    <p class="text-sm text-slate-600">
      Un punto es un lugar donde se puede marcar. En la <strong>empresa</strong> el empleado escanea el QR de una pantalla (tablet o monitor) que cambia cada 30 segundos, y además se revisa que su ubicación esté dentro del radio.
      Una <strong>tienda</strong> sin pantalla puede pedir solo la ubicación. Si la ubicación falla, la marca <strong>se guarda igual</strong> y queda «por revisar»: nadie pierde pago por un problema técnico.
    </p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="puntos.length === 0" class="card text-sm text-slate-600">Aún no hay puntos. Cree el de la empresa: párese en el lugar y use «Usar mi ubicación actual».</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="p in puntos" :key="p.id" class="card flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-48">
          <p class="text-sm font-semibold text-slate-900">
            {{ p.nombre }}
            <span class="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{{ p.tipo === 'empresa' ? 'Empresa' : 'Tienda' }}</span>
            <span v-if="!p.activo" class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Apagado</span>
          </p>
          <p class="text-xs text-slate-500">
            <template v-if="p.latitud !== null">{{ p.latitud }}, {{ p.longitud }} · radio {{ p.radioMetros }} m</template>
            <template v-else>Sin coordenadas · la ubicación no se puede verificar</template>
            · {{ p.requiereQr ? 'con QR' : 'solo ubicación' }}
            <template v-if="p.requiereQr"> · pantalla: {{ p.pantallaUltimaVez ? `activa, vista ${formatearFechaHora(p.pantallaUltimaVez)}` : 'sin conectar' }}</template>
          </p>
        </div>
        <div class="flex gap-2">
          <button v-if="p.requiereQr" type="button" class="btn-secondary" @click="nuevaPantalla(p)">{{ p.pantallaUltimaVez ? 'Enlace nuevo de pantalla' : 'Conectar pantalla' }}</button>
          <button type="button" class="btn-secondary" @click="abrir(p)">Editar</button>
        </div>
      </li>
    </ul>

    <!-- Crear / editar -->
    <div v-if="edicion" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" @click.self="edicion = null">
      <form class="card flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto" @submit.prevent="guardar">
        <h2 class="text-lg font-bold text-slate-900">{{ edicion.id ? 'Editar punto' : 'Nuevo punto de marca' }}</h2>
        <div><label class="label">Nombre</label><input v-model="form.nombre" class="input" required maxlength="80" placeholder="Fábrica y oficinas" /></div>
        <div>
          <label class="label">Tipo</label>
          <select v-model="form.tipo" class="input" @change="form.requiereQr = form.tipo === 'empresa'"><option value="empresa">Empresa</option><option value="tienda">Tienda</option></select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="label">Latitud</label><input v-model="form.latitud" type="number" step="any" class="input" placeholder="9.934100" /></div>
          <div><label class="label">Longitud</label><input v-model="form.longitud" type="number" step="any" class="input" placeholder="-84.087700" /></div>
        </div>
        <button type="button" class="btn-secondary" :disabled="leyendo" @click="usarMiUbicacion">{{ leyendo ? 'Leyendo ubicación…' : 'Usar mi ubicación actual' }}</button>
        <div><label class="label">Radio permitido (metros)</label><input v-model="form.radioMetros" type="number" min="20" max="2000" class="input" required /></div>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.requiereQr" type="checkbox" class="size-4" /> Hay que escanear el QR de una pantalla</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.activo" type="checkbox" class="size-4" /> Activo</label>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="edicion = null">Cancelar</button>
          <button type="submit" class="btn-primary" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </div>

    <!-- Enlace de la pantalla: se ve una sola vez -->
    <div v-if="pantalla" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" @click.self="pantalla = null">
      <div class="card flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <h2 class="text-lg font-bold text-slate-900">Pantalla de {{ pantalla.nombre }}</h2>
        <img :src="pantalla.qr" alt="Enlace de la pantalla" class="size-60 rounded-lg bg-white p-1" />
        <p class="text-xs text-slate-600">En la tablet o el monitor que se va a quedar en el lugar, abra este enlace (escanee este QR con la cámara de la tablet o copie el enlace). La pantalla queda autorizada y muestra el QR de marcar en pantalla completa. <strong>Esta es la única vez que se muestra: no lo comparta.</strong></p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="copiar(pantalla.enlace)">Copiar enlace</button>
          <button type="button" class="btn-primary" @click="pantalla = null">Listo</button>
        </div>
      </div>
    </div>
  </div>
</template>
