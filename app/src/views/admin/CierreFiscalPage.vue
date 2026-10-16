<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Landmark } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { fechaHoyISO, formatearColones } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';

const auth = useAuthStore();
const m = formatearColones;
const anioActual = Number(fechaHoyISO().slice(0, 4));

const anios = computed(() => Array.from({ length: 6 }, (_, i) => anioActual - i));
const anio = ref('');
const ajuste = ref('');
const notas = ref('');
const vista = ref(null);
const cierres = ref([]);
const parametros = ref([]);
const editados = reactive({});
const cargando = ref(false);
const trabajando = ref(false);
const error = ref('');
const verCuentas = ref(false);
const verParametros = ref(false);

async function cargarCierres() {
  cierres.value = await api.get('/contabilidad/cierre-fiscal').catch(() => []);
}
async function cargarParametros() {
  parametros.value = await api.get('/contabilidad/cierre-fiscal/parametros').catch(() => []);
  for (const p of parametros.value) editados[p.clave] = Number(p.valor);
}

async function calcular() {
  error.value = '';
  vista.value = null;
  if (!anio.value) return;
  cargando.value = true;
  try {
    const q = new URLSearchParams({ ajusteFiscal: String(Number(ajuste.value) || 0) });
    vista.value = await api.get(`/contabilidad/cierre-fiscal/${anio.value}/vista-previa?${q}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo calcular el cierre.';
  } finally {
    cargando.value = false;
  }
}

async function cerrar() {
  const texto = `¿Cerrar el año fiscal ${anio.value}? Se provisiona el impuesto de renta (${m(vista.value.renta.impuesto)}) y los ingresos y gastos del año se saldan contra utilidades acumuladas.`;
  if (!window.confirm(texto)) return;
  error.value = '';
  trabajando.value = true;
  try {
    await api.post(`/contabilidad/cierre-fiscal/${anio.value}/cerrar`, {
      ajusteFiscal: Number(ajuste.value) || 0,
      ...(notas.value.trim() ? { notas: notas.value.trim() } : {}),
    });
    anio.value = '';
    vista.value = null;
    ajuste.value = '';
    notas.value = '';
    await cargarCierres();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cerrar el año.';
  } finally {
    trabajando.value = false;
  }
}

async function reabrir(c) {
  if (!window.confirm(`¿Reabrir el año fiscal ${c.anio}? Se reversan el asiento del impuesto y el de cierre de resultados.`)) return;
  error.value = '';
  try {
    await api.post(`/contabilidad/cierre-fiscal/${c.anio}/reabrir`, {});
    await cargarCierres();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo reabrir.';
  }
}

async function guardarParametro(p) {
  error.value = '';
  try {
    await api.patch(`/contabilidad/cierre-fiscal/parametros/${p.clave}`, { valor: Number(editados[p.clave]) });
    await cargarParametros();
    if (vista.value) await calcular();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar el parámetro.';
  }
}

onMounted(() => {
  cargarCierres();
  cargarParametros();
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2"><Landmark class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Cierre fiscal</h1></div>
    <p class="text-sm text-slate-500">
      El año fiscal va de enero a diciembre. Se cierra a mano, una vez terminado el año y con todos sus meses ya cerrados (Cierre mensual). Provisiona el impuesto
      de renta de la empresa —gasto contra "Impuesto de renta por pagar"— y salda los ingresos y gastos del año contra utilidades acumuladas. El estado de resultados
      del año no cambia por el cierre.
    </p>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <section class="card flex flex-col gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="label">Año fiscal</label>
          <select v-model="anio" class="input" @change="calcular">
            <option value="">Elegí un año…</option>
            <option v-for="a in anios" :key="a" :value="a" :disabled="cierres.some((c) => c.anio === a)">{{ a }}{{ cierres.some((c) => c.anio === a) ? ' (cerrado)' : '' }}</option>
          </select>
        </div>
        <div v-if="vista">
          <label class="label">Ajuste fiscal ₡ <span class="font-normal text-slate-500">(+ suma, − resta)</span></label>
          <input v-model="ajuste" type="number" step="0.01" class="input" placeholder="0" @change="calcular" />
        </div>
      </div>
      <p v-if="cargando" class="text-sm text-slate-500">Calculando…</p>

      <template v-if="vista">
        <div class="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <p class="flex justify-between"><span>Ingresos del año</span><strong>{{ m(vista.ingresos) }}</strong></p>
          <p class="flex justify-between"><span>Gastos y costos del año</span><strong>{{ m(vista.gastos) }}</strong></p>
          <p class="flex justify-between"><span>Utilidad antes de impuesto</span><strong>{{ m(vista.utilidadAntesImpuesto) }}</strong></p>
          <p class="flex justify-between"><span>Ajuste fiscal</span><strong>{{ m(vista.ajusteFiscal) }}</strong></p>
          <p class="flex justify-between"><span>Renta neta gravable</span><strong>{{ m(vista.rentaNeta) }}</strong></p>
          <p class="flex justify-between"><span>Régimen</span><strong>{{ vista.renta.regimen === 'escala' ? 'Escala por tramos (pequeña empresa)' : 'Tarifa general' }}</strong></p>
        </div>

        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1">Tramo de renta neta</th><th class="py-1 text-right">Tarifa</th><th class="py-1 text-right">Base</th><th class="py-1 text-right">Impuesto</th></tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in vista.renta.tramos" :key="i" class="border-b border-slate-100">
              <td class="py-1">{{ m(t.desde) }} {{ t.hasta === null ? 'en adelante' : `a ${m(t.hasta)}` }}</td>
              <td class="py-1 text-right">{{ t.tarifa }} %</td><td class="py-1 text-right">{{ m(t.base) }}</td><td class="py-1 text-right">{{ m(t.impuesto) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="rounded-xl bg-slate-50 p-3 text-sm">
          <p class="flex justify-between"><span>Impuesto de renta del año</span><strong>{{ m(vista.renta.impuesto) }}</strong></p>
          <p class="flex justify-between"><span>− Retenciones y pagos a favor aplicados (cuenta 1410)</span><strong>{{ m(vista.retencionesAplicadas) }}</strong></p>
          <p class="flex justify-between border-t border-slate-200 pt-1"><span>Impuesto de renta por pagar</span><strong>{{ m(vista.impuestoPorPagar) }}</strong></p>
          <p class="flex justify-between"><span>Utilidad del año después de impuesto</span><strong>{{ m(vista.utilidadNeta) }}</strong></p>
        </div>

        <button type="button" class="w-fit text-sm font-semibold text-blue-700 underline" @click="verCuentas = !verCuentas">
          {{ verCuentas ? 'Ocultar' : 'Ver' }} las {{ vista.cuentas.length }} cuentas de resultados que se saldan
        </button>
        <ul v-if="verCuentas" class="grid grid-cols-1 gap-x-8 text-sm sm:grid-cols-2">
          <li v-for="c in vista.cuentas" :key="c.codigo" class="flex justify-between border-b border-slate-100 py-0.5"><span>{{ c.codigo }} {{ c.nombre }}</span><span>{{ m(c.saldo) }}</span></li>
        </ul>

        <ul v-if="vista.bloqueos.length" class="list-disc pl-5 text-sm font-medium text-red-700">
          <li v-for="(b, i) in vista.bloqueos" :key="i">{{ b }}</li>
        </ul>
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-64 flex-1"><label class="label">Notas (opcional)</label><input v-model="notas" class="input" placeholder="Ej. Cierre fiscal aprobado por el contador" /></div>
          <button type="button" class="btn-primary" :disabled="trabajando || vista.bloqueos.length > 0 || vista.yaCerrado" @click="cerrar">
            {{ trabajando ? 'Cerrando…' : 'Cerrar año fiscal' }}
          </button>
        </div>
      </template>
    </section>

    <section class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">Años cerrados</p>
      <p v-if="cierres.length === 0" class="text-sm text-slate-500">Todavía no hay años fiscales cerrados.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="c in cierres" :key="c.anio" class="rounded-xl border border-slate-200 p-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-semibold text-slate-900">Año fiscal {{ c.anio }}</span>
            <button v-if="auth.esSistema" type="button" class="font-semibold text-blue-700 underline" @click="reabrir(c)">Reabrir (reversa los asientos)</button>
          </div>
          <p class="mt-1 text-slate-600">
            Utilidad antes de impuesto {{ m(c.resumen.utilidadAntesImpuesto) }} · Impuesto {{ m(c.resumen.impuesto) }} · Utilidad neta {{ m(c.resumen.utilidadNeta) }}
          </p>
          <p v-if="c.notas" class="text-xs text-slate-500">{{ c.notas }}</p>
        </li>
      </ul>
    </section>

    <section class="card flex flex-col gap-3">
      <button type="button" class="w-fit text-left text-base font-semibold text-slate-900" @click="verParametros = !verParametros">
        Tarifas y tramos del impuesto de renta {{ verParametros ? '▾' : '▸' }}
      </button>
      <template v-if="verParametros">
        <p class="text-sm text-slate-500">
          Valores del período fiscal 2026 (Decreto 45333-H). Hacienda los actualiza cada año: confirmalos con el contador antes de cerrar un año nuevo. Solo el gerente general o el administrador del sistema los modifican.
        </p>
        <ul class="flex flex-col gap-2">
          <li v-for="p in parametros" :key="p.clave" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="min-w-72 flex-1 text-slate-700">{{ p.descripcion }}</span>
            <input v-model="editados[p.clave]" type="number" step="0.0001" class="input w-44" :disabled="!auth.puedeEditarLey" />
            <button v-if="auth.puedeEditarLey" type="button" class="btn-secondary" :disabled="Number(editados[p.clave]) === Number(p.valor)" @click="guardarParametro(p)">Guardar</button>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
