<script setup>
import { onMounted, ref, watch } from 'vue';
import { Smartphone } from '@lucide/vue';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { fechaHoyISO, formatearFecha } from '../../../lib/format.js';

// Las marcas que los empleados hicieron desde su celular, con dónde y qué tan cerca estaban del punto.
// Las «por revisar» (ubicación fuera de zona, imprecisa o sin permiso) igual se pagan: aquí se revisan.
const sumar = (iso, d) => {
  const f = new Date(`${iso}T12:00:00`);
  f.setDate(f.getDate() + d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const hasta = ref(fechaHoyISO());
const desde = ref(sumar(hasta.value, -6));
const soloRevisar = ref(false);
const filas = ref([]);
const cargando = ref(true);
const error = ref('');

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    filas.value = await api.get(`/planilla/marcas-app?desde=${desde.value}&hasta=${hasta.value}${soloRevisar.value ? '&revisar=1' : ''}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch([desde, hasta, soloRevisar], cargar);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Smartphone class="size-5 text-blue-600" />
      <h1 class="text-xl font-bold text-slate-900">Marcas desde el celular</h1>
    </div>
    <p class="text-sm text-slate-600">Cada toque de «Marcar», con la hora del servidor. <strong>Por revisar</strong> = la ubicación no coincidió con el punto, era imprecisa o no se dio permiso; la marca se pagó igual y aquí se puede verificar con el supervisor.</p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <div class="card flex flex-wrap items-end gap-3">
      <div><label class="label">Desde</label><input v-model="desde" type="date" class="input" /></div>
      <div><label class="label">Hasta</label><input v-model="hasta" type="date" class="input" /></div>
      <label class="flex items-center gap-2 pb-2 text-sm"><input v-model="soloRevisar" type="checkbox" class="size-4" /> Solo las por revisar</label>
    </div>
    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="filas.length === 0" class="text-sm text-slate-500">No hay marcas en ese período.</p>
    <div v-else class="card overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="text-left text-xs font-semibold text-slate-600">
          <tr><th class="px-2 py-1">Día</th><th class="px-2">Hora</th><th class="px-2">Colaborador</th><th class="px-2">Punto</th><th class="px-2">Estado</th><th class="px-2">Detalle</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in filas" :key="m.id" class="border-t border-slate-100">
            <td class="whitespace-nowrap px-2 py-1">{{ formatearFecha(m.fecha) }}</td>
            <td class="px-2 font-semibold tabular-nums">{{ m.hora }}</td>
            <td class="px-2">{{ m.nombre }}</td>
            <td class="px-2">{{ m.punto ?? '—' }}<span v-if="m.conQr" class="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">QR</span></td>
            <td class="px-2">
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="m.verificada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'">{{ m.verificada ? 'Verificada' : 'Por revisar' }}</span>
            </td>
            <td class="px-2 text-xs text-slate-600">
              <template v-if="m.distanciaM !== null">a {{ m.distanciaM }} m · </template>{{ m.motivo ?? '' }}
              <span v-if="!m.enDia" class="font-semibold text-red-700"> · no se sumó al día</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
