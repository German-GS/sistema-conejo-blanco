<script setup>
import { onMounted, reactive, ref } from 'vue';
import QRCode from 'qrcode';
import { useRouter } from 'vue-router';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { confirmar } from '../../../lib/confirmar.js';
import { exito, fallo } from '../../../lib/avisos.js';
import { formatearFechaHora } from '../../../lib/format.js';

// Solo el administrador del sistema: los lugares donde se puede marcar y la pantalla (tablet) de cada uno, que
// muestra el QR que cambia cada 30 segundos. No se pide ubicación: el QR solo se ve en el lugar.
const router = useRouter();
const puntos = ref([]);
const cargando = ref(true);
const error = ref('');
const edicion = ref(null); // null = cerrado; {} = nuevo
const form = reactive({ nombre: '', tipo: 'empresa', activo: true });
const guardando = ref(false);
const pantalla = ref(null); // { nombre, enlace, qr }

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
  Object.assign(form, p ? { nombre: p.nombre, tipo: p.tipo, activo: p.activo } : { nombre: '', tipo: 'empresa', activo: true });
}

async function guardar() {
  guardando.value = true;
  try {
    if (edicion.value?.id) await api.patch(`/planilla/puntos-marca/${edicion.value.id}`, { ...form });
    else await api.post('/planilla/puntos-marca', { ...form });
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
    <div class="flex flex-wrap items-start justify-between gap-2">
      <p class="max-w-3xl text-sm text-slate-600">
        Un punto es un lugar donde se puede marcar. Su pantalla (tablet o monitor) muestra un QR que cambia cada 30 segundos y solo se ve ahí: el empleado lo escanea con su celular y escribe su PIN. No se pide ni se guarda la ubicación del celular.
      </p>
      <button type="button" class="btn-primary" @click="abrir()">Nuevo punto</button>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="puntos.length === 0" class="card text-sm text-slate-600">Aún no hay puntos. Cree el de la empresa y conecte su pantalla.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="p in puntos" :key="p.id" class="card flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-48">
          <p class="text-sm font-semibold text-slate-900">
            {{ p.nombre }}
            <span v-if="!p.activo" class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Apagado</span>
          </p>
          <p class="text-xs text-slate-500">
            Pantalla: {{ p.pantallaUltimaVez ? `activa, vista ${formatearFechaHora(p.pantallaUltimaVez)}` : 'sin conectar' }}
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="nuevaPantalla(p)">{{ p.pantallaUltimaVez ? 'Enlace nuevo de pantalla' : 'Conectar pantalla' }}</button>
          <button type="button" class="btn-secondary" @click="abrir(p)">Editar</button>
        </div>
      </li>
    </ul>

    <!-- Crear / editar -->
    <div v-if="edicion" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" @click.self="edicion = null">
      <form class="card flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto" @submit.prevent="guardar">
        <h2 class="text-lg font-bold text-slate-900">{{ edicion.id ? 'Editar punto' : 'Nuevo punto de marca' }}</h2>
        <div><label class="label">Nombre</label><input v-model="form.nombre" class="input" required maxlength="80" placeholder="Fábrica y oficinas" /></div>
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
