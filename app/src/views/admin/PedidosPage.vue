<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { TriangleAlert, ClipboardList, Receipt } from '@lucide/vue';
import { formatearColones, formatearFecha, nombreClientePedido } from '../../lib/format.js';
import { api, ApiError } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { PROVINCIAS, etiquetaProvincia } from '../../lib/provincias.js';

const ESTADOS = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'activo', etiqueta: 'Pendiente de facturar' },
  { valor: 'facturado', etiqueta: 'Facturado' },
  { valor: 'anulado', etiqueta: 'Anulado' },
];

const router = useRouter();
const auth = useAuthStore();
const puedeAnular = auth.tienePermiso('pedidos.gestionar');
const pedidos = ref([]);
const cargando = ref(true);
const error = ref('');
const clientesFiltro = ref([]);
const filtroClienteId = ref('');
const filtroEstado = ref('');
const filtroProvincia = ref('');
const filtroDesde = ref('');
const filtroHasta = ref('');

function paramsActuales() {
  const params = new URLSearchParams();
  if (filtroClienteId.value) params.set('clienteId', filtroClienteId.value);
  if (filtroEstado.value) params.set('estado', filtroEstado.value);
  if (filtroProvincia.value) params.set('provincia', filtroProvincia.value);
  if (filtroDesde.value) params.set('desde', filtroDesde.value);
  if (filtroHasta.value) params.set('hasta', filtroHasta.value);
  return params;
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    pedidos.value = await api.get(`/pedidos?${paramsActuales().toString()}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la lista de pedidos.';
  } finally {
    cargando.value = false;
  }
}

onMounted(async () => {
  try {
    clientesFiltro.value = await api.get('/clientes');
  } catch {
    // El filtro por cliente es informativo — si falla, la página igual carga sin él.
  }
  await cargar();
});

watch([filtroClienteId, filtroEstado, filtroProvincia, filtroDesde, filtroHasta], cargar);

async function anular(pedido, event) {
  event.stopPropagation();
  if (!confirm(`¿Anular la orden #${pedido.numeroOrden}? Esta acción no se puede deshacer.`)) return;
  error.value = '';
  try {
    await api.patch(`/pedidos/${pedido.id}/anular`, {});
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo anular el pedido.';
  }
}

function irAHojaDeBodega(pedido, event) {
  event.stopPropagation();
  router.push({ name: 'pedido-alistamiento', params: { id: pedido.id } });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Todos los pedidos</h1>

    <div class="card grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label class="label">Cliente</label>
        <select v-model="filtroClienteId" class="input">
          <option value="">Todos los clientes</option>
          <option v-for="c in clientesFiltro" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="label">Estado</label>
        <select v-model="filtroEstado" class="input">
          <option v-for="e in ESTADOS" :key="e.valor" :value="e.valor">{{ e.etiqueta }}</option>
        </select>
      </div>
      <div>
        <label class="label">Provincia</label>
        <select v-model="filtroProvincia" class="input">
          <option value="">Todas las provincias</option>
          <option v-for="p in PROVINCIAS" :key="p.valor" :value="p.valor">{{ p.etiqueta }}</option>
        </select>
      </div>
      <div>
        <label class="label">Fecha</label>
        <div class="flex items-center gap-1">
          <input v-model="filtroDesde" type="date" class="input" />
          <span class="text-sm text-slate-400">a</span>
          <input v-model="filtroHasta" type="date" class="input" />
        </div>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-base text-slate-500">Cargando…</p>
    <p v-else-if="pedidos.length === 0" class="text-base text-slate-500">Ningún pedido coincide con estos filtros.</p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="pedido in pedidos" :key="pedido.id">
        <button
          type="button"
          class="card flex w-full items-center justify-between text-left"
          @click="router.push({ name: 'pedido-detalle', params: { id: pedido.id } })"
        >
          <div>
            <p class="flex items-center gap-1.5 text-base font-semibold text-slate-900">
              Orden #{{ pedido.numeroOrden }} — {{ nombreClientePedido(pedido) }}
              <span
                v-if="!pedido.cliente"
                class="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
              >
                <TriangleAlert class="size-3" />
                Cliente pendiente
              </span>
              <span
                v-if="pedido.factura"
                class="flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700"
              >
                <Receipt class="size-3" />
                Facturada
              </span>
            </p>
            <p class="text-sm text-slate-500">
              Cédula: {{ pedido.cliente?.cedula ?? pedido.clientePendiente?.cedula ?? '—' }} ·
              Tel: {{ pedido.cliente?.telefono ?? pedido.clientePendiente?.telefono ?? '—' }}
              <span v-if="pedido.cliente?.provincia"> · {{ etiquetaProvincia(pedido.cliente.provincia) }}</span>
            </p>
            <p class="text-sm text-slate-500">
              {{ formatearFecha(pedido.fecha) }} · {{ pedido.vendedor?.nombre }} ·
              {{ pedido.tipoPago === 'credito' ? `Crédito ${pedido.diasCredito}d` : 'Contado' }}
              <span v-if="pedido.estado === 'anulado'" class="font-semibold text-red-600"> · Anulado</span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <p class="text-base font-bold text-slate-900">{{ formatearColones(pedido.total) }}</p>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-semibold text-slate-600 underline"
              @click="irAHojaDeBodega(pedido, $event)"
            >
              <ClipboardList class="size-4" />
              Bodega
            </button>
            <button
              v-if="pedido.estado === 'activo' && !pedido.factura && puedeAnular"
              type="button"
              class="text-sm font-semibold text-red-600 underline"
              @click="anular(pedido, $event)"
            >
              Anular
            </button>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
