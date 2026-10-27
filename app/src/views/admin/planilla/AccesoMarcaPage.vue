<script setup>
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { Smartphone } from '@lucide/vue';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { confirmar } from '../../../lib/confirmar.js';
import { exito, fallo } from '../../../lib/avisos.js';
import { formatearFechaHora } from '../../../lib/format.js';
import { useRouter } from 'vue-router';

// Solo el administrador del sistema: da el código de activación de cada empleado y libera el celular o el PIN si se
// cambia de aparato. Cada empleado tiene un solo celular; sin este paso nadie más puede marcar con su nombre.
const router = useRouter();
const filas = ref([]);
const cargando = ref(true);
const error = ref('');
const busqueda = ref('');
const filtro = ref('');
const nuevo = ref(null); // { empleado, enlace, codigo, vence, qr }

const ESTADOS = {
  sin_acceso: { texto: 'Sin celular', clase: 'bg-slate-100 text-slate-700' },
  codigo_pendiente: { texto: 'Código pendiente', clase: 'bg-amber-100 text-amber-800' },
  registrado: { texto: 'Celular registrado', clase: 'bg-green-100 text-green-700' },
  bloqueado: { texto: 'Bloqueado por intentos', clase: 'bg-red-100 text-red-700' },
};

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    filas.value = await api.get('/planilla/acceso-marca');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

const visibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return filas.value.filter((f) => (!filtro.value || f.estado === filtro.value) && (!q || f.nombre.toLowerCase().includes(q)));
});
const conteo = computed(() => Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, filas.value.filter((f) => f.estado === k).length])));

async function darCodigo(f) {
  const habia = f.estado === 'registrado' || f.estado === 'bloqueado';
  if (habia && !(await confirmar(`¿Dar un código nuevo a ${f.nombre}? Se borran su celular y su PIN actuales: tendrá que activar el celular de nuevo con el código.`, { aceptar: 'Sí, dar código nuevo', peligro: true }))) return;
  try {
    const r = await api.post(`/planilla/acceso-marca/${f.empleadoId}/codigo`, {});
    const enlace = new URL(router.resolve({ name: 'marcar', query: { c: r.codigo } }).href, window.location.origin).href;
    nuevo.value = { empleado: r.empleado, enlace, codigo: r.codigo, vence: r.vence, qr: await QRCode.toDataURL(enlace, { width: 240, margin: 1 }) };
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo generar el código.');
  }
}

async function liberar(f) {
  if (!(await confirmar(`¿Liberar a ${f.nombre}? Se borran su celular y su PIN y no se da un código nuevo; ya no podrá marcar hasta que se le dé uno.`, { aceptar: 'Sí, liberar', peligro: true }))) return;
  try {
    await api.post(`/planilla/acceso-marca/${f.empleadoId}/liberar`, { motivo: 'Liberado por el administrador del sistema' });
    exito(`${f.nombre} quedó sin celular registrado.`);
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo liberar.');
  }
}

const copiar = async (texto) => {
  try {
    await navigator.clipboard.writeText(texto);
    exito('Enlace copiado.');
  } catch {
    fallo('No se pudo copiar: seleccione el enlace y cópielo a mano.');
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Smartphone class="size-5 text-blue-600" />
      <h1 class="text-xl font-bold text-slate-900">Celulares y PIN para marcar</h1>
    </div>
    <p class="text-sm text-slate-600">
      Cada empleado marca con <strong>un solo celular</strong> y un <strong>PIN de 6 números que elige él mismo</strong> (usted nunca lo ve). Para activar o cambiar un celular se le da un
      <strong>código de un solo uso</strong> (vale 24 horas): lo escribe en su celular, o escanea el QR, y elige su PIN. Solo el administrador del sistema puede dar el código o liberar un celular;
      todo queda en la bitácora. No incluye a los puestos de confianza ni a quien no usa reloj.
    </p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div class="card flex flex-wrap items-end gap-3">
      <div class="min-w-48 flex-1">
        <label class="label">Buscar empleado</label>
        <input v-model="busqueda" type="search" class="input" placeholder="Nombre…" />
      </div>
      <div>
        <label class="label">Estado</label>
        <select v-model="filtro" class="input">
          <option value="">Todos ({{ filas.length }})</option>
          <option v-for="(e, k) in ESTADOS" :key="k" :value="k">{{ e.texto }} ({{ conteo[k] }})</option>
        </select>
      </div>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="visibles.length === 0" class="text-sm text-slate-500">No hay empleados con ese filtro.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="f in visibles" :key="f.empleadoId" class="card flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-48">
          <p class="text-sm font-semibold text-slate-900">
            {{ f.nombre }}
            <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[f.estado].clase">{{ ESTADOS[f.estado].texto }}</span>
          </p>
          <p class="text-xs text-slate-500">
            {{ f.departamento ?? 'Sin departamento' }}
            <template v-if="f.dispositivo"> · {{ f.dispositivo }}, registrado {{ formatearFechaHora(f.registradoEn) }}</template>
            <template v-if="f.dispositivo && f.ultimoUsoEn"> · último uso {{ formatearFechaHora(f.ultimoUsoEn) }}</template>
            <template v-if="f.estado === 'codigo_pendiente'"> · el código vence {{ formatearFechaHora(f.codigoVence) }}</template>
            <template v-if="f.estado === 'bloqueado'"> · bloqueado hasta {{ formatearFechaHora(f.bloqueadoHasta) }}</template>
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="darCodigo(f)">{{ f.estado === 'registrado' || f.estado === 'bloqueado' ? 'Cambiar de celular' : 'Dar código' }}</button>
          <button v-if="f.estado !== 'sin_acceso'" type="button" class="btn-secondary" @click="liberar(f)">Liberar</button>
        </div>
      </li>
    </ul>

    <!-- Código recién generado: se ve una sola vez -->
    <div v-if="nuevo" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" @click.self="nuevo = null">
      <div class="card flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <h2 class="text-lg font-bold text-slate-900">Código para {{ nuevo.empleado }}</h2>
        <img :src="nuevo.qr" alt="QR de activación" class="size-60 rounded-lg bg-white p-1" />
        <p class="font-mono text-2xl font-bold tracking-widest text-slate-900">{{ nuevo.codigo }}</p>
        <p class="text-xs text-slate-600">El empleado escanea el QR con la cámara de <strong>su celular</strong> (o abre el enlace y escribe el código) y elige su PIN. Vale hasta {{ formatearFechaHora(nuevo.vence) }} y sirve una sola vez. <strong>Esta es la única vez que se muestra.</strong></p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="copiar(nuevo.enlace)">Copiar enlace</button>
          <button type="button" class="btn-primary" @click="nuevo = null">Listo</button>
        </div>
      </div>
    </div>
  </div>
</template>
