<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { BookMarked, ChevronDown, ChevronRight } from '@lucide/vue';
import { api, ApiError, descargarArchivo } from '../../lib/api.js';
import { fechaHoyISO, formatearColones, formatearFecha } from '../../lib/format.js';

const m = formatearColones;
const hoy = fechaHoyISO();

const ORIGENES = {
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  pago_recibido: 'Recibo de caja',
  planilla: 'Planilla',
  planilla_pago: 'Pago de planilla',
  cierre_mensual: 'Cierre mensual',
  cierre_fiscal: 'Cierre fiscal',
  cierre_fiscal_impuesto: 'Impuesto de renta',
  deuda_empleado: 'Préstamo a empleado',
  deuda_empleado_baja: 'Baja de préstamo',
  manual: 'Manual',
  reversa: 'Reversa',
};

const cuentas = ref([]);
const cuentaId = ref('');
const rango = reactive({ desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
const mayor = ref(null);
const cargando = ref(false);
const error = ref('');
const abiertas = ref(new Set());
const soloUna = computed(() => Boolean(cuentaId.value));

function consulta() {
  const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  if (cuentaId.value) q.set('cuentaId', cuentaId.value);
  return q;
}

async function generar() {
  error.value = '';
  cargando.value = true;
  try {
    mayor.value = await api.get(`/contabilidad/mayor?${consulta()}`);
    abiertas.value = new Set(soloUna.value ? mayor.value.cuentas.map((c) => c.codigo) : []);
  } catch (err) {
    mayor.value = null;
    error.value = err instanceof ApiError ? err.message : 'No se pudo generar el libro mayor.';
  } finally {
    cargando.value = false;
  }
}

function alternar(codigo) {
  const nuevo = new Set(abiertas.value);
  if (nuevo.has(codigo)) nuevo.delete(codigo);
  else nuevo.add(codigo);
  abiertas.value = nuevo;
}
const todasAbiertas = computed(() => mayor.value && mayor.value.cuentas.length > 0 && abiertas.value.size === mayor.value.cuentas.length);
function alternarTodas() {
  abiertas.value = todasAbiertas.value ? new Set() : new Set(mayor.value.cuentas.map((c) => c.codigo));
}

async function excel() {
  try {
    await descargarArchivo(`/contabilidad/mayor/excel?${consulta()}`, `libro-mayor-${rango.desde}-a-${rango.hasta}.xlsx`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}

const imprimir = () => window.print();

function esteMes() {
  const [a, mes] = hoy.split('-');
  Object.assign(rango, { desde: `${a}-${mes}-01`, hasta: hoy });
  generar();
}
function mesPasado() {
  const [a, mes] = hoy.split('-').map(Number);
  const d = new Date(a, mes - 2, 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const pref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  Object.assign(rango, { desde: `${pref}-01`, hasta: `${pref}-${ultimo}` });
  generar();
}
function esteAnio() {
  Object.assign(rango, { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
  generar();
}

onMounted(async () => {
  try {
    cuentas.value = await api.get('/contabilidad/cuentas');
  } catch {
    /* sin el selector se ve el mayor completo */
  }
  generar();
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2 print:hidden"><BookMarked class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Libro mayor</h1></div>
    <p class="text-sm text-slate-500 print:hidden">
      El movimiento de cada cuenta con su saldo corrido. El saldo se muestra según la naturaleza de la cuenta: un pasivo sube con créditos, un activo con débitos.
      El número es el del asiento en el libro diario.
    </p>

    <div class="card flex flex-wrap items-end gap-3 print:hidden">
      <div class="min-w-64 flex-1">
        <label class="label">Cuenta</label>
        <select v-model="cuentaId" class="input" @change="generar">
          <option value="">Todas las cuentas con movimiento</option>
          <option v-for="c in cuentas" :key="c.id" :value="c.id">{{ c.codigo }} — {{ c.nombre }}</option>
        </select>
      </div>
      <div><label class="label">Desde</label><input v-model="rango.desde" type="date" class="input" @change="generar" /></div>
      <div><label class="label">Hasta</label><input v-model="rango.hasta" type="date" class="input" @change="generar" /></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" @click="esteMes">Este mes</button>
        <button type="button" class="btn-secondary" @click="mesPasado">Mes pasado</button>
        <button type="button" class="btn-secondary" @click="esteAnio">Este año</button>
      </div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-secondary" :disabled="!mayor" @click="excel">Descargar Excel</button>
        <button type="button" class="btn-secondary" :disabled="!mayor" @click="imprimir">Imprimir</button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-sm text-slate-500">Generando…</p>

    <template v-if="mayor && !cargando">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card"><p class="text-xs text-slate-500">Cuentas con movimiento</p><p class="text-lg font-bold text-slate-900">{{ mayor.cuentas.length }}</p></div>
        <div class="card"><p class="text-xs text-slate-500">Total débitos</p><p class="text-lg font-bold text-slate-900">{{ m(mayor.totales.debe) }}</p></div>
        <div class="card"><p class="text-xs text-slate-500">Total créditos</p><p class="text-lg font-bold text-slate-900">{{ m(mayor.totales.haber) }}</p></div>
        <div class="card" :class="mayor.cuadra ? 'bg-green-50' : 'bg-red-50'">
          <p class="text-xs text-slate-500">Cuadre</p>
          <p class="text-lg font-bold" :class="mayor.cuadra ? 'text-green-700' : 'text-red-700'">{{ mayor.cuadra ? 'Débitos = créditos' : 'No cuadra' }}</p>
        </div>
      </div>

      <p v-if="mayor.cuentas.length === 0" class="text-sm text-slate-500">No hay movimientos en ese período.</p>
      <div v-else-if="!soloUna" class="flex justify-end print:hidden">
        <button type="button" class="text-sm font-semibold text-blue-700 underline" @click="alternarTodas">{{ todasAbiertas ? 'Contraer todas' : 'Expandir todas' }}</button>
      </div>

      <section v-for="c in mayor.cuentas" :key="c.codigo" class="card break-inside-avoid">
        <button type="button" class="flex w-full flex-wrap items-center justify-between gap-2 text-left" @click="alternar(c.codigo)">
          <span class="flex items-center gap-2 text-base font-semibold text-slate-900">
            <component :is="abiertas.has(c.codigo) ? ChevronDown : ChevronRight" class="size-4 text-slate-400 print:hidden" />
            {{ c.codigo }} — {{ c.nombre }}
            <span class="text-xs font-normal text-slate-500">({{ c.naturaleza }})</span>
          </span>
          <span class="text-sm text-slate-600">
            Inicial {{ m(c.saldoInicial) }} · Déb. {{ m(c.totalDebe) }} · Créd. {{ m(c.totalHaber) }} · <strong>Final {{ m(c.saldoFinal) }}</strong>
          </span>
        </button>

        <div v-if="abiertas.has(c.codigo)" class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[40rem] text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
                <th class="py-1 pr-2">Fecha</th><th class="py-1 pr-2">Asiento</th><th class="py-1 pr-2">Origen</th><th class="py-1 pr-2">Descripción</th>
                <th class="py-1 pr-2 text-right">Débito</th><th class="py-1 pr-2 text-right">Crédito</th><th class="py-1 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-slate-50 font-semibold"><td class="py-1 pr-2" colspan="6">Saldo inicial</td><td class="py-1 text-right">{{ m(c.saldoInicial) }}</td></tr>
              <tr v-for="(mov, i) in c.movimientos" :key="i" class="border-b border-slate-100 align-top">
                <td class="py-1 pr-2 whitespace-nowrap">{{ formatearFecha(mov.fecha) }}</td>
                <td class="py-1 pr-2">{{ mov.numero ?? '—' }}</td>
                <td class="py-1 pr-2 whitespace-nowrap text-slate-500">{{ ORIGENES[mov.origenTipo] ?? mov.origenTipo ?? '' }}</td>
                <td class="py-1 pr-2">{{ mov.descripcion }}</td>
                <td class="py-1 pr-2 text-right">{{ mov.debe ? m(mov.debe) : '' }}</td>
                <td class="py-1 pr-2 text-right">{{ mov.haber ? m(mov.haber) : '' }}</td>
                <td class="py-1 text-right font-medium">{{ m(mov.saldo) }}</td>
              </tr>
              <tr class="bg-slate-50 font-semibold">
                <td class="py-1 pr-2" colspan="4">Totales / saldo final</td>
                <td class="py-1 pr-2 text-right">{{ m(c.totalDebe) }}</td><td class="py-1 pr-2 text-right">{{ m(c.totalHaber) }}</td><td class="py-1 text-right">{{ m(c.saldoFinal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

  </div>
</template>
