<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { FileBarChart } from '@lucide/vue';
import { api, ApiError, descargarArchivo } from '../../lib/api.js';
import { fechaHoyISO } from '../../lib/format.js';
import TablaReporte from '../../components/TablaReporte.vue';

const REPORTES = [
  { tipo: 'balance-general', titulo: 'Balance general', rango: 'hasta' },
  { tipo: 'estado-resultados', titulo: 'Estado de resultados', rango: 'periodo' },
  { tipo: 'balance-comprobacion', titulo: 'Balance de comprobación', rango: 'hasta' },
];
const hoy = fechaHoyISO();
const tipo = ref('balance-general');
const fechas = reactive({ desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
const cuentaId = ref('');
const cuentas = ref([]);
const reporte = ref(null);
const cargando = ref(false);
const error = ref('');

const actual = computed(() => REPORTES.find((r) => r.tipo === tipo.value));

onMounted(async () => {
  try {
    cuentas.value = await api.get('/contabilidad/cuentas');
  } catch {
    /* el selector de cuentas solo se necesita en el mayor */
  }
  generar();
});

function consulta() {
  const q = new URLSearchParams({ hasta: fechas.hasta });
  if (actual.value.rango === 'periodo') q.set('desde', fechas.desde);
  if (actual.value.cuenta) q.set('cuentaId', cuentaId.value);
  return q;
}

async function generar() {
  error.value = '';
  reporte.value = null;
  if (actual.value.cuenta && !cuentaId.value) return;
  cargando.value = true;
  try {
    reporte.value = await api.get(`/contabilidad/reportes/${tipo.value}?${consulta()}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo generar el reporte.';
  } finally {
    cargando.value = false;
  }
}
function elegir(t) {
  tipo.value = t;
  generar();
}
async function descargar() {
  try {
    await descargarArchivo(`/contabilidad/reportes/${tipo.value}/excel?${consulta()}`, `contabilidad-${tipo.value}.xlsx`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}
const imprimir = () => window.print();
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2 print:hidden"><FileBarChart class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Reportes contables</h1></div>

    <div class="flex flex-wrap gap-2 print:hidden">
      <button
        v-for="r in REPORTES"
        :key="r.tipo"
        type="button"
        class="rounded-lg border px-3 py-1.5 text-sm font-semibold"
        :class="tipo === r.tipo ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="elegir(r.tipo)"
      >
        {{ r.titulo }}
      </button>
    </div>

    <div class="card flex flex-wrap items-end gap-3 print:hidden">
      <div v-if="actual.cuenta" class="min-w-64 flex-1">
        <label class="label">Cuenta</label>
        <select v-model="cuentaId" class="input" @change="generar">
          <option value="">Elegí una cuenta…</option>
          <option v-for="c in cuentas" :key="c.id" :value="c.id">{{ c.codigo }} — {{ c.nombre }}</option>
        </select>
      </div>
      <div v-if="actual.rango === 'periodo'"><label class="label">Desde</label><input v-model="fechas.desde" type="date" class="input" @change="generar" /></div>
      <div><label class="label">{{ actual.rango === 'hasta' ? 'Al' : 'Hasta' }}</label><input v-model="fechas.hasta" type="date" class="input" @change="generar" /></div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-secondary" :disabled="!reporte" @click="descargar">Descargar Excel</button>
        <button type="button" class="btn-secondary" :disabled="!reporte" @click="imprimir">Imprimir</button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-sm text-slate-500">Generando…</p>
    <p v-else-if="actual.cuenta && !cuentaId" class="text-sm text-slate-500">Elegí una cuenta para ver sus movimientos.</p>

    <div v-if="reporte" class="card flex flex-col gap-3">
      <div>
        <p class="text-lg font-bold text-slate-900">{{ reporte.titulo }}</p>
        <p class="text-sm text-slate-500">{{ reporte.descripcion }}</p>
      </div>
      <p v-if="reporte.filas.length === 0" class="text-sm text-slate-500">No hay movimientos.</p>
      <TablaReporte v-else :reporte="reporte" />
    </div>
  </div>
</template>
