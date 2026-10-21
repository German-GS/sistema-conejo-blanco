<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';
import { fechaHoyISO, formatearColones } from '../../../lib/format.js';
import BarrasHorizontales from '../../../components/BarrasHorizontales.vue';
import BarrasPeriodo from '../../../components/BarrasPeriodo.vue';

const props = defineProps({ ubicaciones: { type: Array, default: () => [] } });
const auth = useAuthStore();
const hoy = fechaHoyISO();
const hace = (d) => {
  const f = new Date();
  f.setDate(f.getDate() - d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const desde = ref(hace(6));
const hasta = ref(hoy);
const tienda = ref('');
const pruebas = ref(false);
const resumen = ref(null);
const ventas = ref([]);
const error = ref('');
const detalle = ref(null);
const motivo = ref('');
const anulando = ref(false);

const crc = (v) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(v ?? 0);
const MEDIO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE Móvil', transferencia: 'Transferencia' };
const periodos = computed(() => (resumen.value?.porDia ?? []).map((d) => ({ etiqueta: d.etiqueta.slice(5), a: d.monto })));

async function cargar() {
  const q = new URLSearchParams();
  if (desde.value) q.set('desde', desde.value);
  if (hasta.value) q.set('hasta', hasta.value);
  if (tienda.value) q.set('ubicacionId', tienda.value);
  if (pruebas.value) q.set('pruebas', '1');
  try {
    [resumen.value, ventas.value] = await Promise.all([api.get(`/pos/resumen?${q}`), api.get(`/pos/ventas?${q}`)]);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer las ventas.';
  }
}
onMounted(cargar);
watch([desde, hasta, tienda, pruebas], cargar);

async function ver(v) {
  motivo.value = '';
  try {
    detalle.value = await api.get(`/pos/ventas/${v.id}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo abrir la venta.';
  }
}
async function anular() {
  if (!motivo.value.trim()) return (error.value = 'Escriba el motivo de la anulación.');
  if (!window.confirm(`¿Anular el tiquete ${detalle.value.numeroTexto}? Las existencias vuelven a la tienda y se reversa el asiento.`)) return;
  anulando.value = true;
  try {
    await api.post(`/pos/ventas/${detalle.value.id}/anular`, { motivo: motivo.value.trim() });
    detalle.value = null;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo anular.';
  } finally {
    anulando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Desde<input v-model="desde" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Hasta<input v-model="hasta" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Tienda
        <select v-model="tienda" class="input mt-1"><option value="">Todas</option><option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </label>
      <label v-if="auth.esSistema" class="flex items-center gap-2 pb-2 text-sm text-slate-700"><input v-model="pruebas" type="checkbox" class="size-4" /> Incluir ventas de prueba</label>
      <div class="flex gap-1.5"><button type="button" class="btn-secondary" @click="desde = hoy; hasta = hoy">Hoy</button><button type="button" class="btn-secondary" @click="desde = hace(6); hasta = hoy">7 días</button><button type="button" class="btn-secondary" @click="desde = hace(29); hasta = hoy">30 días</button></div>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <template v-if="resumen">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendido</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(resumen.kpis.total) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tiquetes</p><p class="mt-1 text-xl font-bold text-slate-900">{{ resumen.kpis.tiquetes }}</p><p class="mt-1 text-xs text-slate-500">{{ resumen.kpis.pares }} pares</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tiquete promedio</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(resumen.kpis.ticketPromedio) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Anulados</p><p class="mt-1 text-xl font-bold text-slate-900">{{ resumen.kpis.anuladas }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Cobrados sin internet</p><p class="mt-1 text-xl font-bold text-slate-900">{{ resumen.kpis.sinConexion }}</p></div>
      </div>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Venta por día</p><BarrasPeriodo :periodos="periodos" :nombres="['Ventas']" :formato="crc" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Por forma de pago</p><BarrasHorizontales :filas="resumen.porMedio.map((m) => ({ etiqueta: MEDIO[m.etiqueta] ?? m.etiqueta, valor: m.monto }))" :formato="crc" color="#0ea5e9" /></div>
        <div class="card xl:col-span-2"><p class="mb-2 text-sm font-semibold text-slate-900">Productos más vendidos</p><BarrasHorizontales :filas="resumen.topProductos.map((p) => ({ etiqueta: p.etiqueta, valor: p.monto, extra: `${p.pares} pares` }))" :formato="crc" color="#10b981" /></div>
      </div>
    </template>

    <div class="card overflow-x-auto">
      <p class="mb-2 text-sm font-semibold text-slate-900">Tiquetes</p>
      <table class="w-full min-w-[40rem] text-sm">
        <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Tiquete</th><th class="py-1 pr-2">Fecha</th><th class="py-1 pr-2">Cajero</th><th class="py-1 pr-2">Pago</th><th class="py-1 pr-2 text-right">Pares</th><th class="py-1 pr-2 text-right">Total</th><th class="py-1">Estado</th></tr></thead>
        <tbody>
          <tr v-for="v in ventas" :key="v.id" class="cursor-pointer border-b border-slate-100 hover:bg-slate-50" :class="v.estado === 'anulada' ? 'opacity-60' : ''" @click="ver(v)">
            <td class="py-1 pr-2 font-mono text-xs">{{ v.numeroTexto }}<span v-if="v.prueba" class="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-extrabold text-white">PRUEBA</span></td><td class="py-1 pr-2">{{ v.fecha }}</td><td class="py-1 pr-2">{{ v.cajero }}</td><td class="py-1 pr-2 text-xs">{{ (v.medios ?? '').split(', ').map((m) => MEDIO[m] ?? m).join(', ') }}</td>
            <td class="py-1 pr-2 text-right">{{ v.pares }}</td><td class="py-1 pr-2 text-right font-semibold tabular-nums">{{ crc(v.total) }}</td>
            <td class="py-1 text-xs"><span :class="v.estado === 'anulada' ? 'font-semibold text-red-600' : 'text-green-600'">{{ v.estado === 'anulada' ? 'Anulado' : 'Vigente' }}</span><span v-if="v.sinConexion" class="ml-1 text-slate-500">· sin internet</span><span v-if="v.alerta" class="ml-1 font-semibold text-amber-600" :title="v.alerta">· revisar precio</span></td>
          </tr>
          <tr v-if="!ventas.length"><td colspan="7" class="py-3 text-slate-500">No hay tiquetes en este rango.</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="detalle" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3" @click.self="detalle = null">
      <div class="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <p class="text-lg font-bold text-slate-900">Tiquete {{ detalle.numeroTexto }}</p>
        <p class="text-sm text-slate-500">{{ detalle.tienda }} · {{ detalle.cajero }} · {{ new Date(detalle.fecha).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) }}</p>
        <p v-if="detalle.estado === 'anulada'" class="mt-1 text-sm font-semibold text-red-600">Anulado: {{ detalle.motivoAnulacion }}</p>
        <p v-if="detalle.alerta" class="mt-1 text-sm font-semibold text-amber-600">Revisar: {{ detalle.alerta }}</p>
        <table class="mt-3 w-full text-sm"><tbody>
          <tr v-for="(l, i) in detalle.lineas" :key="i" class="border-b border-slate-100"><td class="py-1">{{ l.cantidad }} × {{ l.codigo }} {{ l.color }}</td><td class="py-1 text-right tabular-nums">{{ crc(l.subtotal) }}</td></tr>
          <tr class="font-bold"><td class="py-1">Total</td><td class="py-1 text-right tabular-nums">{{ crc(detalle.total) }}</td></tr>
        </tbody></table>
        <p v-for="(p, i) in detalle.pagos" :key="i" class="text-sm text-slate-600">{{ MEDIO[p.medio] ?? p.medio }}: {{ crc(p.monto) }}<span v-if="p.referencia"> · ref. {{ p.referencia }}</span></p>
        <template v-if="detalle.estado === 'vigente' && auth.tienePermiso('pos.gestionar')">
          <input v-model="motivo" type="text" maxlength="200" placeholder="Motivo de la anulación" class="input mt-3" />
          <button type="button" class="btn-danger mt-2 w-full" :disabled="anulando" @click="anular">{{ anulando ? 'Anulando…' : 'Anular tiquete' }}</button>
        </template>
        <button type="button" class="btn-secondary mt-2 w-full" @click="detalle = null">Cerrar</button>
      </div>
    </div>
  </div>
</template>
