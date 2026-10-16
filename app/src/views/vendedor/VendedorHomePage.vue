<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { PlusCircle, ClipboardList, ChevronRight, TriangleAlert } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFecha, nombreClientePedido } from '../../lib/format.js';

const router = useRouter();
const pedidos = ref([]);
const cargando = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    pedidos.value = await api.get('/pedidos');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar tus pedidos.';
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <button type="button" class="btn-primary w-full min-h-20 text-xl" @click="router.push({ name: 'pedido-nuevo' })">
      <PlusCircle class="size-7" />
      Nuevo pedido
    </button>

    <section>
      <h2 class="mb-3 flex items-center gap-2 text-xl font-bold text-slate-900">
        <ClipboardList class="size-6" />
        Mis pedidos
      </h2>

      <p v-if="error" class="text-lg font-medium text-red-600">{{ error }}</p>
      <p v-if="cargando" class="text-lg text-slate-500">Cargando…</p>
      <p v-else-if="pedidos.length === 0" class="text-lg text-slate-500">Todavía no has hecho ningún pedido.</p>

      <ul v-else class="flex flex-col gap-3">
        <li v-for="pedido in pedidos" :key="pedido.id">
          <button
            type="button"
            class="card flex w-full items-center justify-between text-left"
            @click="router.push({ name: 'pedido-detalle', params: { id: pedido.id } })"
          >
            <div>
              <p class="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                Orden #{{ pedido.numeroOrden }} — {{ nombreClientePedido(pedido) }}
                <TriangleAlert v-if="!pedido.cliente" class="size-4 shrink-0 text-amber-600" />
              </p>
              <p class="text-base text-slate-500">
                {{ formatearFecha(pedido.fecha) }} · {{ pedido.tipoPago === 'credito' ? 'Crédito' : 'Contado' }}
                <span v-if="!pedido.cliente" class="font-semibold text-amber-600"> · Cliente pendiente</span>
                <span v-if="pedido.estado === 'anulado'" class="font-semibold text-red-600"> · Anulado</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <p class="text-lg font-bold text-slate-900">{{ formatearColones(pedido.total) }}</p>
              <ChevronRight class="size-5 text-slate-400" />
            </div>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
