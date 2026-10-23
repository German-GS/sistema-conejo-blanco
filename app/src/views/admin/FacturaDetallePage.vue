<script setup>
import Cargando from '../../components/Cargando.vue';
import { onMounted, ref } from 'vue';
import { ArrowLeft, Printer } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import FacturaDocumento from '../../components/FacturaDocumento.vue';

const props = defineProps({ id: { type: String, required: true } });
const doc = ref(null);
const error = ref('');
const imprimir = () => window.print();

onMounted(async () => {
  try {
    doc.value = await api.get(`/facturas/${props.id}/documento`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la factura.';
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between print:hidden">
      <router-link :to="{ name: 'admin-facturas' }" class="flex items-center gap-1 text-sm font-semibold text-blue-700">
        <ArrowLeft class="size-4" /> Volver a facturas
      </router-link>
      <button v-if="doc" type="button" class="btn-primary" @click="imprimir">
        <Printer class="size-4" /> Imprimir
      </button>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-else-if="!doc" texto="Cargando…" compacto />
    <FacturaDocumento v-else :doc="doc" />
  </div>
</template>
