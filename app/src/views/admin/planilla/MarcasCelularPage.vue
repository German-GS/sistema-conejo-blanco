<script setup>
import { onMounted, ref, watch } from 'vue';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { fechaHoyISO, formatearFecha } from '../../../lib/format.js';

// Las marcas que los empleados hicieron desde su celular (siempre con el QR de la pantalla del punto).
// Si alguna no se pudo sumar al día (día ya decidido, planilla aprobada), aquí se ve para resolverla a mano.
const sumar = (iso, d) => {
  const f = new Date(`${iso}T12:00:00`);
  f.setDate(f.getDate() + d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const hasta = ref(fechaHoyISO());
const desde = ref(sumar(hasta.value, -6));
const soloNoSumadas = ref(false);
const filas = ref([]);
const cargando = ref(true);
const error = ref('');

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    filas.value = await api.get(`/planilla/marcas-app?desde=${desde.value}&hasta=${hasta.value}${soloNoSumadas.value ? '&revisar=1' : ''}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch([desde, hasta, soloNoSumadas], cargar);
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-slate-600">Cada toque de «Marcar», con la hora del servidor. <strong>No se sumó</strong> = la hora quedó registrada pero no entró a las marcas del día (el día ya estaba decidido o la planilla ya se aprobó): hay que corregirlo en Marcas a mano.</p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <div class="card flex flex-wrap items-end gap-3">
      <div><label class="label">Desde</label><input v-model="desde" type="date" class="input" /></div>
      <div><label class="label">Hasta</label><input v-model="hasta" type="date" class="input" /></div>
      <label class="flex items-center gap-2 pb-2 text-sm"><input v-model="soloNoSumadas" type="checkbox" class="size-4" /> Solo las que no se sumaron</label>
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
            <td class="px-2">{{ m.punto ?? '—' }}</td>
            <td class="px-2">
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="m.enDia ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'">{{ m.enDia ? 'Sumada al día' : 'No se sumó' }}</span>
            </td>
            <td class="px-2 text-xs text-slate-600">
              {{ m.motivo ?? '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
