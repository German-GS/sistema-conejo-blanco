<script setup>
import { redondear } from '../../lib/dinero.js';
import { computed, onMounted, reactive, ref } from 'vue';
import { NotebookText, Plus, Trash2 } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { fechaHoyISO, formatearColones, formatearFecha } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';

const auth = useAuthStore();
const puedeGestionar = computed(() => auth.tienePermiso('contabilidad.gestionar'));

const ORIGENES = {
  manual: 'Manual',
  reversa: 'Reversa',
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  pago_recibido: 'Pago recibido',
  pago_recibido_anulado: 'Pago anulado',
  planilla: 'Planilla',
  planilla_pago: 'Pago de planilla',
  deuda_empleado: 'Préstamo a empleado',
  deuda_empleado_baja: 'Baja de préstamo',
  cierre_mensual: 'Cierre mensual',
  cierre_fiscal: 'Cierre fiscal',
  cierre_fiscal_impuesto: 'Impuesto de renta',
};

const hoy = fechaHoyISO();
const rango = reactive({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy });
const asientos = ref([]);
const cargando = ref(true);
const error = ref('');
const abiertos = ref(new Set());

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    asientos.value = await api.get(`/contabilidad/diario?desde=${rango.desde}&hasta=${rango.hasta}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el libro diario.';
  } finally {
    cargando.value = false;
  }
}
onMounted(() => {
  cargar();
  api.get('/contabilidad/cuentas').then((c) => (cuentas.value = c.filter((x) => x.activa))).catch(() => {});
});
function alternar(id) {
  const s = new Set(abiertos.value);
  s.has(id) ? s.delete(id) : s.add(id);
  abiertos.value = s;
}
const total = (a) => a.lineas.reduce((x, l) => x + l.debe, 0);

// ---- Asiento manual ----
const cuentas = ref([]);
const mostrandoForm = ref(false);
const nuevo = reactive({ fecha: hoy, descripcion: '', lineas: [] });
const guardando = ref(false);
const errorForm = ref('');

function abrirForm() {
  Object.assign(nuevo, { fecha: hoy, descripcion: '', lineas: [{ cuentaId: '', debe: '', haber: '' }, { cuentaId: '', debe: '', haber: '' }] });
  errorForm.value = '';
  mostrandoForm.value = true;
}
const sumaDebe = computed(() => redondear(nuevo.lineas.reduce((a, l) => a + (Number(l.debe) || 0), 0)));
const sumaHaber = computed(() => redondear(nuevo.lineas.reduce((a, l) => a + (Number(l.haber) || 0), 0)));
const cuadra = computed(() => sumaDebe.value > 0 && sumaDebe.value === sumaHaber.value);
const lineasOk = computed(() => nuevo.lineas.every((l) => l.cuentaId && (Number(l.debe) > 0) !== (Number(l.haber) > 0)));

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    await api.post('/contabilidad/asientos', {
      fecha: nuevo.fecha,
      descripcion: nuevo.descripcion.trim(),
      lineas: nuevo.lineas.map((l) => ({ cuentaId: l.cuentaId, ...(Number(l.debe) > 0 ? { debe: Number(l.debe) } : { haber: Number(l.haber) }) })),
    });
    mostrandoForm.value = false;
    await cargar();
  } catch (err) {
    errorForm.value = err instanceof ApiError ? err.message : 'No se pudo guardar el asiento.';
  } finally {
    guardando.value = false;
  }
}

// ---- Reversar ----
const reversando = ref(null);
const motivo = ref('');
async function reversar(a) {
  error.value = '';
  try {
    await api.post(`/contabilidad/asientos/${a.id}/reversar`, { motivo: motivo.value.trim() });
    reversando.value = null;
    motivo.value = '';
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo reversar.';
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2"><NotebookText class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Libro diario</h1></div>
      <button v-if="puedeGestionar" type="button" class="btn-primary" @click="abrirForm"><Plus class="size-4" /> Nuevo asiento manual</button>
    </div>
    <p class="max-w-3xl text-sm text-slate-500">
      Todos los asientos, los automáticos (ventas, cobros, planilla) y los manuales. Un asiento no se edita ni se
      borra: si un asiento manual tiene un error, se reversa con otro asiento inverso.
    </p>

    <div v-if="mostrandoForm" class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">Nuevo asiento manual</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div><label class="label">Fecha *</label><input v-model="nuevo.fecha" type="date" class="input" /></div>
        <div class="sm:col-span-3"><label class="label">Descripción *</label><input v-model="nuevo.descripcion" class="input" placeholder="Ej. Pago de alquiler de octubre" /></div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs font-semibold uppercase text-slate-500">
            <tr><th class="px-1 py-1">Cuenta</th><th class="w-36 px-1">Débito</th><th class="w-36 px-1">Crédito</th><th class="w-8" /></tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in nuevo.lineas" :key="i">
              <td class="px-1 py-1">
                <select v-model="l.cuentaId" class="input">
                  <option value="">Elegí una cuenta…</option>
                  <option v-for="c in cuentas" :key="c.id" :value="c.id">{{ c.codigo }} — {{ c.nombre }}</option>
                </select>
              </td>
              <td class="px-1 py-1"><input v-model="l.debe" type="number" min="0" step="0.01" class="input" @input="l.haber = ''" /></td>
              <td class="px-1 py-1"><input v-model="l.haber" type="number" min="0" step="0.01" class="input" @input="l.debe = ''" /></td>
              <td class="px-1"><button v-if="nuevo.lineas.length > 2" type="button" class="text-slate-400 hover:text-red-600" @click="nuevo.lineas.splice(i, 1)"><Trash2 class="size-4" /></button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-semibold">
              <td class="px-1 py-2 text-right">Totales</td>
              <td class="px-1 tabular-nums">{{ formatearColones(sumaDebe) }}</td>
              <td class="px-1 tabular-nums">{{ formatearColones(sumaHaber) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" class="flex w-fit items-center gap-1 text-sm font-semibold text-blue-700" @click="nuevo.lineas.push({ cuentaId: '', debe: '', haber: '' })"><Plus class="size-4" /> Agregar línea</button>
      <p class="text-sm" :class="cuadra ? 'text-teal-700' : 'text-amber-700'">
        {{ cuadra ? 'El asiento cuadra.' : sumaDebe || sumaHaber ? `No cuadra: diferencia de ${formatearColones(Math.abs(sumaDebe - sumaHaber))}.` : 'Ingresá los montos: los débitos y los créditos deben ser iguales.' }}
      </p>
      <p v-if="errorForm" class="text-sm font-medium text-red-600">{{ errorForm }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="mostrandoForm = false">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="guardando || !cuadra || !lineasOk || nuevo.descripcion.trim().length < 3" @click="guardar">{{ guardando ? 'Guardando…' : 'Registrar asiento' }}</button>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <div><label class="label">Desde</label><input v-model="rango.desde" type="date" class="input" @change="cargar" /></div>
      <div><label class="label">Hasta</label><input v-model="rango.hasta" type="date" class="input" @change="cargar" /></div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
    <p v-else-if="asientos.length === 0" class="text-sm text-slate-500">No hay asientos en ese rango.</p>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="a in asientos" :key="a.id" class="rounded-xl border border-slate-200 bg-white">
        <button type="button" class="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" @click="alternar(a.id)">
          <span class="text-sm">
            <span class="mr-2 text-slate-500">{{ formatearFecha(a.fecha) }}</span>
            <span v-if="a.numero" class="mr-2 text-xs font-semibold text-slate-400">#{{ a.numero }}</span><span class="font-semibold text-slate-900">{{ a.descripcion }}</span>
            <span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ ORIGENES[a.origenTipo] ?? a.origenTipo ?? '—' }}</span>
            <span v-if="a.reversado" class="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Reversado</span>
          </span>
          <span class="text-sm font-semibold tabular-nums">{{ formatearColones(total(a)) }}</span>
        </button>
        <div v-if="abiertos.has(a.id)" class="border-t border-slate-100 p-3">
          <table class="w-full text-sm">
            <thead class="text-left text-xs font-semibold uppercase text-slate-500"><tr><th>Cuenta</th><th class="text-right">Débito</th><th class="text-right">Crédito</th></tr></thead>
            <tbody>
              <tr v-for="(l, i) in a.lineas" :key="i">
                <td class="py-0.5" :class="l.haber > 0 && 'pl-6'">{{ l.codigo }} — {{ l.cuenta }}</td>
                <td class="text-right tabular-nums">{{ l.debe > 0 ? formatearColones(l.debe) : '' }}</td>
                <td class="text-right tabular-nums">{{ l.haber > 0 ? formatearColones(l.haber) : '' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="puedeGestionar && a.origenTipo === 'manual' && !a.reversado" class="mt-3">
            <button v-if="reversando !== a.id" type="button" class="text-sm font-semibold text-red-700 underline" @click="reversando = a.id; motivo = ''">Reversar asiento</button>
            <div v-else class="flex flex-wrap items-center gap-2">
              <input v-model="motivo" class="input max-w-sm" placeholder="Motivo de la reversa" />
              <button type="button" class="btn-secondary" @click="reversando = null">Cancelar</button>
              <button type="button" class="btn-primary bg-red-600 hover:bg-red-700" :disabled="motivo.trim().length < 3" @click="reversar(a)">Reversar</button>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
