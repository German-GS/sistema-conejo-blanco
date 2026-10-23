<script setup>
import Cargando from '../../components/Cargando.vue';
import { onMounted, reactive, ref } from 'vue';
import { HandCoins, Plus } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFecha } from '../../lib/format.js';

const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta', cheque: 'Cheque', otro: 'Otro' };

const pagos = ref([]);
const cargando = ref(true);
const error = ref('');
const filtro = reactive({ estado: '', desde: '', hasta: '' });

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtro)) if (v) q.set(k, v);
    pagos.value = await api.get(`/pagos?${q}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <HandCoins class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Pagos recibidos</h1>
      </div>
      <router-link :to="{ name: 'admin-pago-nuevo' }" class="btn-primary"><Plus class="size-4" /> Nuevo pago recibido</router-link>
    </div>

    <div class="card flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="label">Estado</label>
          <select v-model="filtro.estado" class="input" @change="cargar">
            <option value="">Todos</option>
            <option value="vigente">Vigentes</option>
            <option value="anulado">Anulados</option>
          </select>
        </div>
        <div><label class="label">Desde</label><input v-model="filtro.desde" type="date" class="input" @change="cargar" /></div>
        <div><label class="label">Hasta</label><input v-model="filtro.hasta" type="date" class="input" @change="cargar" /></div>
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <Cargando v-if="cargando" texto="Cargando…" compacto />
      <p v-else-if="pagos.length === 0" class="text-sm text-slate-500">No hay pagos registrados con ese filtro.</p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="p in pagos" :key="p.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div>
            <p class="text-base font-semibold text-slate-900">
              Recibo #{{ p.numero }} · {{ p.cliente?.nombre ?? p.concepto ?? 'Otros ingresos' }}
              <span v-if="p.estado === 'anulado'" class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Anulado</span>
            </p>
            <p class="text-sm text-slate-500">
              {{ formatearFecha(p.fecha) }} · {{ MEDIOS[p.medioPago] ?? p.medioPago }} · {{ p.cuenta }}
              <template v-if="p.tipo === 'otros'"> · Otros ingresos</template>
              <template v-else-if="p.facturas.length"> · Factura{{ p.facturas.length > 1 ? 's' : '' }} {{ p.facturas.join(', ') }}</template>
            </p>
          </div>
          <div class="text-right">
            <p class="text-base font-bold" :class="p.estado === 'anulado' ? 'text-slate-500 line-through' : 'text-slate-900'">{{ formatearColones(p.total) }}</p>
            <router-link :to="{ name: 'admin-pago-detalle', params: { id: p.id } }" class="text-sm font-semibold text-blue-700 underline">Ver / imprimir</router-link>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
