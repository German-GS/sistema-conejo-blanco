<script setup>
import Cargando from '../../components/Cargando.vue';
import { onMounted, ref } from 'vue';
import { Undo2 } from '@lucide/vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFecha } from '../../lib/format.js';

const router = useRouter();
const notas = ref([]);
const cargando = ref(true);
const error = ref('');

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    notas.value = await api.get('/notas-credito');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar las notas de crédito.';
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center gap-2">
      <Undo2 class="size-5 text-red-600" />
      <h1 class="text-xl font-bold text-slate-900">Notas de crédito</h1>
    </div>
    <p class="text-sm text-slate-500">
      Comprobantes que anulan una factura ya emitida — se generan desde Facturas, con motivo obligatorio. Revierten
      automáticamente el inventario descontado y el asiento contable de la venta.
    </p>

    <div class="card flex flex-col gap-4">
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <Cargando v-if="cargando" texto="Cargando…" compacto />
      <p v-else-if="notas.length === 0" class="text-sm text-slate-500">Todavía no se ha anulado ninguna factura.</p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="n in notas"
          :key="n.id"
          class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
          @click="router.push({ name: 'pedido-detalle', params: { id: n.pedidoId } })"
        >
          <div>
            <p class="text-base font-semibold text-slate-900">{{ n.cliente.nombre }}</p>
            <p class="text-sm text-slate-500">
              Orden #{{ n.numeroOrden }} · Anula factura {{ n.facturaConsecutivo }} · {{ formatearFecha(n.fecha) }}
            </p>
            <p class="text-sm text-slate-500">Motivo: {{ n.motivo }}</p>
            <p class="text-xs text-slate-500">{{ n.usuario?.nombre ?? 'Usuario eliminado' }} · {{ n.consecutivo }}</p>
          </div>
          <p class="text-base font-bold text-red-600">−{{ formatearColones(n.total) }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
