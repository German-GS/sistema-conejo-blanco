<script setup>
import { onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { fechaHoyISO } from '../../../lib/format.js';

const props = defineProps({ ubicaciones: { type: Array, default: () => [] } });
const hoy = fechaHoyISO();
const hace = (d) => {
  const f = new Date();
  f.setDate(f.getDate() - d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const desde = ref(hace(29));
const hasta = ref(hoy);
const tienda = ref('');
const cajas = ref([]);
const error = ref('');
const crc = (v) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(v));

async function cargar() {
  const q = new URLSearchParams();
  if (desde.value) q.set('desde', desde.value);
  if (hasta.value) q.set('hasta', hasta.value);
  if (tienda.value) q.set('ubicacionId', tienda.value);
  try {
    cajas.value = await api.get(`/pos/cajas?${q}`);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer las cajas.';
  }
}
onMounted(cargar);
watch([desde, hasta, tienda], cargar);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Desde<input v-model="desde" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Hasta<input v-model="hasta" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Tienda
        <select v-model="tienda" class="input mt-1"><option value="">Todas</option><option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </label>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <div class="card overflow-x-auto">
      <p class="mb-1 text-sm font-semibold text-slate-900">Turnos de caja</p>
      <p class="mb-2 text-xs text-slate-500">Esperado = fondo + efectivo cobrado en ventas vigentes. Una diferencia distinta de cero es un faltante (negativo) o sobrante.</p>
      <div class="tabla-fija">
      <table class="w-full min-w-[44rem] text-sm">
        <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Tienda</th><th class="py-1 pr-2">Cajero</th><th class="py-1 pr-2">Abrió</th><th class="py-1 pr-2">Cerró</th><th class="py-1 pr-2 text-right">Ventas</th><th class="py-1 pr-2 text-right">Esperado</th><th class="py-1 pr-2 text-right">Contado</th><th class="py-1 text-right">Diferencia</th></tr></thead>
        <tbody>
          <tr v-for="c in cajas" :key="c.id" class="border-b border-slate-100">
            <td class="py-1 pr-2">{{ c.tienda }}</td><td class="py-1 pr-2">{{ c.cajero }}</td><td class="py-1 pr-2">{{ c.abiertaEn }}</td>
            <td class="py-1 pr-2">{{ c.cerradaEn ?? 'Abierta' }}</td><td class="py-1 pr-2 text-right tabular-nums">{{ crc(c.ventas) }}</td>
            <td class="py-1 pr-2 text-right tabular-nums">{{ crc(c.efectivoEsperado) }}</td><td class="py-1 pr-2 text-right tabular-nums">{{ crc(c.efectivoContado) }}</td>
            <td class="py-1 text-right font-semibold tabular-nums" :class="c.diferencia === null ? '' : c.diferencia < 0 ? 'text-red-600' : c.diferencia > 0 ? 'text-amber-600' : 'text-green-600'">{{ c.diferencia === null ? '—' : crc(c.diferencia) }}</td>
          </tr>
          <tr v-if="!cajas.length"><td colspan="8" class="py-3 text-slate-500">No hay turnos en este rango.</td></tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>
