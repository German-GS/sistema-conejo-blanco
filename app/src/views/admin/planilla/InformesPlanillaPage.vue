<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError, descargarArchivo } from '../../../lib/api.js';
import { fechaHoyISO, formatearColones } from '../../../lib/format.js';

const INFORMES = [
  { tipo: 'asientos', titulo: 'Asientos contables', ayuda: 'Los asientos que la planilla generó en la contabilidad (aprobación, pago, préstamos) con su número.' },
  { tipo: 'libro', titulo: 'Libro de salarios', ayuda: 'Todo lo pagado por empleado y planilla.' },
  { tipo: 'cargas', titulo: 'Cargas sociales', ayuda: 'Lo que se debe a CCSS y demás instituciones, por mes.' },
  { tipo: 'renta', titulo: 'Retenciones de renta', ayuda: 'Impuesto retenido por empleado y mes.' },
  { tipo: 'provisiones', titulo: 'Provisiones', ayuda: 'Aguinaldo, vacaciones y cesantía reservados.' },
  { tipo: 'asistencia', titulo: 'Asistencia', ayuda: 'Ausencias, extras y horas faltantes por empleado.' },
  { tipo: 'irregularidades', titulo: 'Irregularidades', ayuda: 'Ausencias, horas descontadas y marcas corregidas, con motivo y comprobante.' },
  { tipo: 'deudas', titulo: 'Deudas de empleados', ayuda: 'Saldos pendientes con la empresa.' },
];

const hoy = fechaHoyISO();
const rango = reactive({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy });
const tipo = ref('libro');
const informe = ref(null);
const buscar = ref('');
const filasVisibles = computed(() => {
  const q = buscar.value.trim().toLowerCase();
  if (!informe.value || !q) return informe.value?.filas ?? [];
  return informe.value.filas.filter((f) => Object.values(f).some((v) => String(v).toLowerCase().includes(q)));
});
const cargando = ref(false);
const error = ref('');

const sinFechas = computed(() => tipo.value === 'deudas');

function mesActual() {
  const [a, m] = hoy.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  Object.assign(rango, { desde: `${a}-${String(m).padStart(2, '0')}-01`, hasta: `${a}-${String(m).padStart(2, '0')}-${ultimo}` });
}
function mesPasado() {
  const [a, m] = hoy.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const pref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  Object.assign(rango, { desde: `${pref}-01`, hasta: `${pref}-${ultimo}` });
}
function esteAnio() {
  const a = hoy.slice(0, 4);
  Object.assign(rango, { desde: `${a}-01-01`, hasta: `${a}-12-31` });
}

async function generar() {
  buscar.value = '';
  error.value = '';
  cargando.value = true;
  try {
    const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
    informe.value = await api.get(`/planilla/informes/${tipo.value}?${q}`);
  } catch (err) {
    informe.value = null;
    error.value = err instanceof ApiError ? err.message : 'No se pudo generar el informe.';
  } finally {
    cargando.value = false;
  }
}
function elegir(t) {
  tipo.value = t;
  generar();
}
async function descargar() {
  error.value = '';
  try {
    const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
    await descargarArchivo(`/planilla/informes/${tipo.value}/excel?${q}`, `informe-${tipo.value}.xlsx`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}
const imprimir = () => window.print();
onMounted(generar);

const valor = (col, v) => {
  if (v === undefined || v === null || v === '') return '';
  if (col.tipo === 'moneda') return formatearColones(v);
  if (col.tipo === 'numero') return Number(v).toLocaleString('es-CR', { maximumFractionDigits: 2 });
  return v;
};
</script>

<template>
  <div class="flex flex-col gap-5">
    <h1 class="text-xl font-bold text-slate-900 print:hidden">Informes de planilla</h1>

    <div class="flex flex-wrap gap-2 print:hidden">
      <button
        v-for="i in INFORMES"
        :key="i.tipo"
        type="button"
        class="rounded-lg border px-3 py-1.5 text-sm font-semibold"
        :class="tipo === i.tipo ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="elegir(i.tipo)"
      >
        {{ i.titulo }}
      </button>
    </div>

    <div class="card flex flex-wrap items-end gap-3 print:hidden">
      <template v-if="!sinFechas">
        <div><label class="label">Desde</label><input v-model="rango.desde" type="date" class="input" /></div>
        <div><label class="label">Hasta</label><input v-model="rango.hasta" type="date" class="input" /></div>
        <div class="flex gap-3 pb-2.5 text-sm font-semibold text-blue-700">
          <button type="button" class="underline" @click="mesActual(); generar()">Este mes</button>
          <button type="button" class="underline" @click="mesPasado(); generar()">Mes pasado</button>
          <button type="button" class="underline" @click="esteAnio(); generar()">Este año</button>
        </div>
      </template>
      <p v-else class="text-sm text-slate-500">Este informe muestra los saldos de hoy, no depende de fechas.</p>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-primary" :disabled="cargando" @click="generar">{{ cargando ? 'Generando…' : 'Generar' }}</button>
        <button type="button" class="btn-secondary" :disabled="!informe" @click="descargar">Descargar Excel</button>
        <button type="button" class="btn-secondary" :disabled="!informe" @click="imprimir">Imprimir</button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div v-if="informe" class="card flex flex-col gap-3">
      <div>
        <p class="text-lg font-bold text-slate-900">{{ informe.titulo }}</p>
        <p class="text-sm text-slate-500">
          {{ informe.descripcion }}
          <template v-if="!sinFechas"> Del {{ rango.desde }} al {{ rango.hasta }}.</template>
        </p>
        <p v-if="!sinFechas && ['libro', 'cargas', 'renta', 'provisiones'].includes(tipo)" class="text-xs text-slate-400">
          Incluye solo planillas aprobadas o pagadas cuyo período termina dentro del rango.
        </p>
      </div>
      <input v-if="informe.filas.length > 5" v-model="buscar" class="input max-w-sm print:hidden" placeholder="Filtrar (nombre, situación, motivo…)" />
      <p v-if="informe.filas.length === 0" class="text-sm text-slate-500">No hay datos para ese rango.</p>
      <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th v-for="c in informe.columnas" :key="c.clave" class="whitespace-nowrap px-3 py-2" :class="c.tipo !== 'texto' && 'text-right'">{{ c.etiqueta }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filasVisibles" :key="i" class="border-t border-slate-100">
              <td v-for="c in informe.columnas" :key="c.clave" class="whitespace-nowrap px-3 py-1.5" :class="c.tipo !== 'texto' && 'text-right tabular-nums'">{{ valor(c, f[c.clave]) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="Object.keys(informe.totales).length" class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <tr>
              <td v-for="(c, i) in informe.columnas" :key="c.clave" class="whitespace-nowrap px-3 py-2" :class="c.tipo !== 'texto' && 'text-right tabular-nums'">
                {{ i === 0 ? 'TOTAL' : valor(c, informe.totales[c.clave]) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-if="tipo === 'cargas' && informe.filas.length" class="flex flex-wrap gap-6 text-sm">
        <p>Total obrero: <strong>{{ formatearColones(informe.totales.obrero) }}</strong></p>
        <p>Total patronal: <strong>{{ formatearColones(informe.totales.patronal) }}</strong></p>
      </div>
    </div>
  </div>
</template>
