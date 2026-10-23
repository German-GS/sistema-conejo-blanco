<script setup>
import VistasGuardadas from '../../components/VistasGuardadas.vue';
import { confirmar } from '../../lib/confirmar.js';
import { recordarFiltros, usarLimite } from '../../lib/filtros.js';
import MostrarMas from '../../components/MostrarMas.vue';
import Cargando from '../../components/Cargando.vue';
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { TriangleAlert, ClipboardList, Receipt } from '@lucide/vue';
import { formatearColones, formatearFecha, nombreClientePedido } from '../../lib/format.js';
import { api, ApiError } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { PROVINCIAS, etiquetaProvincia } from '../../lib/provincias.js';
import OrdenesTiendaTab from './pos/OrdenesTiendaTab.vue';

const ESTADOS = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'activo', etiqueta: 'Pendiente de facturar' },
  { valor: 'facturado', etiqueta: 'Facturado' },
  { valor: 'anulado', etiqueta: 'Anulado' },
];

const router = useRouter();
const auth = useAuthStore();
const puedeAnular = auth.tienePermiso('pedidos.gestionar');
// Los pedidos de reposición que arman las tiendas desde el POS llegan acá, junto a los de los vendedores.
const veTiendas = auth.tienePermiso('pos.ver') && auth.moduloActivo('pos');
const pestana = ref(sessionStorage.getItem('cb-pedidos-pestana') === 'tiendas' && veTiendas ? 'tiendas' : 'vendedores');
watch(pestana, (p) => sessionStorage.setItem('cb-pedidos-pestana', p));
const pendientesTiendas = ref(null);
const tiendas = ref([]);
async function cargarPendientesTiendas() {
  if (!veTiendas) return;
  try {
    pendientesTiendas.value = await api.get('/pos/ordenes/resumen');
  } catch {
    /* el contador es informativo */
  }
}
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
  cargarPendientesTiendas();
  if (veTiendas) {
    try {
      tiendas.value = (await api.get('/ubicaciones')).filter((u) => u.tipo === 'tienda' && u.activa);
    } catch {
      /* sin la lista, el filtro de tienda queda vacío */
    }
  }
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
  if (!await confirmar(`¿Anular la orden #${pedido.numeroOrden}? Esta acción no se puede deshacer.`, { aceptar: 'Sí, anular la orden' })) return;
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

// Los filtros se recuerdan al entrar a un pedido y volver; la lista larga se muestra de a 50.
recordarFiltros('pedidos', { cliente: filtroClienteId, estado: filtroEstado, provincia: filtroProvincia, desde: filtroDesde, hasta: filtroHasta });
const { visibles: pedidosVisibles, restantes: pedidosRestantes, mostrarMas: mostrarMasPedidos, reiniciar: reiniciarPedidos, paso: pasoPedidos } = usarLimite(() => pedidos.value);
watch([filtroClienteId, filtroEstado, filtroProvincia, filtroDesde, filtroHasta], reiniciarPedidos);
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Todos los pedidos</h1>

    <div v-if="veTiendas" class="flex flex-wrap gap-2">
      <button type="button" class="rounded-lg border px-4 py-1.5 text-sm font-semibold" :class="pestana === 'vendedores' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="pestana = 'vendedores'">Pedidos de vendedores</button>
      <button type="button" class="rounded-lg border px-4 py-1.5 text-sm font-semibold" :class="pestana === 'tiendas' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="pestana = 'tiendas'">
        Reposición de tiendas<span v-if="pendientesTiendas?.pendientes" class="ml-1.5 rounded-full px-1.5 text-xs font-bold" :class="pestana === 'tiendas' ? 'bg-white text-blue-700' : 'bg-red-600 text-white'">{{ pendientesTiendas.pendientes }}</span>
      </button>
    </div>
    <OrdenesTiendaTab v-if="pestana === 'tiendas'" :ubicaciones="tiendas" @cambio="cargarPendientesTiendas" />

    <template v-else>
    <VistasGuardadas
      clave="pedidos"
      :actual="() => ({ cliente: filtroClienteId, estado: filtroEstado, provincia: filtroProvincia, desde: filtroDesde, hasta: filtroHasta })"
      :aplicar="(v) => { filtroClienteId = v.cliente ?? ''; filtroEstado = v.estado ?? ''; filtroProvincia = v.provincia ?? ''; filtroDesde = v.desde ?? ''; filtroHasta = v.hasta ?? ''; }"
    />
    <div class="card grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
          <input v-model="filtroDesde" type="date" class="input min-w-0 flex-1" />
          <span class="text-sm text-slate-500">a</span>
          <input v-model="filtroHasta" type="date" class="input min-w-0 flex-1" />
        </div>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" />
    <p v-else-if="pedidos.length === 0" class="text-base text-slate-500">Ningún pedido coincide con estos filtros.</p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="pedido in pedidosVisibles" :key="pedido.id">
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
              class="ml-2 rounded-lg border border-red-300 px-2.5 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"
              @click="anular(pedido, $event)"
            >
              Anular
            </button>
          </div>
        </button>
      </li>
    </ul>
    <MostrarMas :restantes="pedidosRestantes" :paso="pasoPedidos" @mas="mostrarMasPedidos" />
      </template>
  </div>
</template>
