<script setup>
import { onMounted, ref } from 'vue';
import { ArrowLeft, Printer } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFecha } from '../../lib/format.js';
import FacturaEncabezado from '../../components/FacturaEncabezado.vue';

const props = defineProps({ id: { type: String, required: true } });
const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta', cheque: 'Cheque', otro: 'Otro' };

const pago = ref(null);
const error = ref('');
const anulando = ref(false);
const motivo = ref('');
const trabajando = ref(false);

async function cargar() {
  try {
    pago.value = await api.get(`/pagos/${props.id}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el recibo.';
  }
}
onMounted(cargar);

async function confirmarAnular() {
  error.value = '';
  trabajando.value = true;
  try {
    pago.value = await api.post(`/pagos/${props.id}/anular`, { motivo: motivo.value.trim() });
    anulando.value = false;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo anular.';
  } finally {
    trabajando.value = false;
  }
}
const imprimir = () => window.print();
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between print:hidden">
      <router-link :to="{ name: 'admin-pagos' }" class="flex items-center gap-1 text-sm font-semibold text-blue-700"><ArrowLeft class="size-4" /> Volver a pagos</router-link>
      <div v-if="pago" class="flex gap-2">
        <button v-if="pago.estado === 'vigente'" type="button" class="btn-secondary text-red-700" @click="anulando = !anulando">Anular recibo</button>
        <button type="button" class="btn-primary" @click="imprimir"><Printer class="size-4" /> Imprimir</button>
      </div>
    </div>

    <div v-if="anulando" class="rounded-xl border border-red-200 bg-red-50 p-3 print:hidden">
      <label class="label">Motivo de la anulación</label>
      <input v-model="motivo" class="input mb-2 bg-white" placeholder="Ej. Se registró dos veces, monto equivocado…" />
      <p class="mb-2 text-xs text-slate-600">Se genera el asiento inverso y las facturas vuelven a tener saldo pendiente.</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="anulando = false">Cancelar</button>
        <button type="button" class="btn-primary bg-red-600 hover:bg-red-700" :disabled="trabajando || motivo.trim().length < 3" @click="confirmarAnular">Anular recibo</button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-else-if="!pago" class="text-sm text-slate-500">Cargando…</p>

    <article v-else class="relative mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <p v-if="pago.estado === 'anulado'" class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none text-7xl font-black tracking-widest text-red-500/20">ANULADO</p>

      <FacturaEncabezado :encabezado="pago.encabezado" :consecutivo="String(pago.numero)" titulo="Recibo de caja" />

      <div class="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 border-y border-slate-200 py-3 text-sm sm:grid-cols-3">
        <div class="col-span-2 sm:col-span-1">
          <p class="text-xs font-semibold uppercase text-slate-500">{{ pago.cliente ? 'Recibido de' : 'Concepto' }}</p>
          <p class="font-semibold text-slate-900">{{ pago.cliente?.nombre ?? pago.concepto }}</p>
          <p v-if="pago.cliente" class="text-xs text-slate-600">Cédula: {{ pago.cliente.cedula }}</p>
        </div>
        <div><p class="text-xs font-semibold uppercase text-slate-500">Fecha de pago</p><p>{{ formatearFecha(pago.fecha) }}</p></div>
        <div><p class="text-xs font-semibold uppercase text-slate-500">Medio de pago</p><p>{{ MEDIOS[pago.medioPago] ?? pago.medioPago }}</p></div>
        <div class="col-span-2">
          <p class="text-xs font-semibold uppercase text-slate-500">Depositado en</p>
          <p>{{ pago.cuentaBancaria.nombre }}<span v-if="pago.cuentaBancaria.numeroCuenta" class="text-slate-500"> — {{ pago.cuentaBancaria.numeroCuenta }}</span></p>
        </div>
        <div><p class="text-xs font-semibold uppercase text-slate-500">Moneda</p><p>CRC</p></div>
      </div>

      <table v-if="pago.tipo === 'factura'" class="mt-4 w-full text-sm">
        <thead class="border-b-2 border-slate-300 text-left text-xs font-semibold uppercase text-slate-500">
          <tr><th class="py-2">Factura</th><th>Fecha</th><th class="text-right">Total factura</th><th class="text-right">Monto aplicado</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in pago.aplicaciones" :key="a.id" class="border-b border-slate-100">
            <td class="py-2 tabular-nums">{{ a.factura.consecutivo }}</td>
            <td>{{ formatearFecha(a.factura.fecha) }}</td>
            <td class="text-right tabular-nums">{{ formatearColones(a.factura.total) }}</td>
            <td class="text-right tabular-nums">{{ formatearColones(a.monto) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="mt-4 text-sm">Otros ingresos: {{ pago.concepto }}</p>

      <div class="mt-4 ml-auto flex w-72 justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
        <span>Total recibido</span><span class="tabular-nums">{{ formatearColones(pago.total) }}</span>
      </div>

      <section v-if="pago.notas" class="mt-6"><p class="text-xs font-semibold uppercase text-slate-500">Notas</p><p class="whitespace-pre-line text-sm">{{ pago.notas }}</p></section>
      <p v-if="pago.estado === 'anulado'" class="mt-4 text-sm font-medium text-red-600">Anulado: {{ pago.motivoAnulacion }}</p>
      <p class="mt-8 text-center text-[11px] text-slate-400">Registrado por {{ pago.creadoPor?.nombre ?? '—' }}</p>
    </article>
  </div>
</template>
