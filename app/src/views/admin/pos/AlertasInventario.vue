<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';

// Existencias que llegaron a su mínimo (o están en negativo), de todas las ubicaciones o de una.
// `compacto` = versión resumida para el inicio del panel.
const props = defineProps({ ubicacionId: { type: String, default: '' }, compacto: { type: Boolean, default: false } });
const alertas = ref([]);
const cargado = ref(false);
const error = ref('');

async function cargar() {
  try {
    alertas.value = await api.get(`/inventario/alertas${props.ubicacionId ? `?ubicacionId=${props.ubicacionId}` : ''}`);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer las alertas.';
  } finally {
    cargado.value = true;
  }
}
onMounted(cargar);
watch(() => props.ubicacionId, cargar);

const ETIQUETA = { negativo: ['Negativo', 'bg-red-600'], agotado: ['Agotado', 'bg-red-500'], bajo: ['Bajo', 'bg-amber-500'] };
const mostradas = computed(() => (props.compacto ? alertas.value.slice(0, 8) : alertas.value));
defineExpose({ cargar });
</script>

<template>
  <div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-else-if="cargado && !alertas.length" class="text-sm text-green-600">Todo en orden: ninguna existencia está en su mínimo.</p>
    <div v-else-if="alertas.length" class="tabla-fija">
      <table class="w-full min-w-[28rem] text-sm">
        <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2">Ubicación</th><th class="py-1 pr-2 text-right">Existencia</th><th class="py-1 pr-2 text-right">Mínimo</th><th class="py-1">Estado</th></tr></thead>
        <tbody>
          <tr v-for="a in mostradas" :key="a.ubicacionId + a.varianteId" class="border-b border-slate-100">
            <td class="py-1 pr-2"><span class="font-medium text-slate-800">{{ a.codigo }} · {{ a.color }}</span><span v-if="!compacto" class="block text-xs text-slate-500">{{ a.nombre }}</span></td>
            <td class="py-1 pr-2">{{ a.ubicacion }}</td>
            <td class="py-1 pr-2 text-right font-semibold">{{ a.cantidad }}</td>
            <td class="py-1 pr-2 text-right">{{ a.minimo || '—' }}</td>
            <td class="py-1"><span class="rounded px-2 py-0.5 text-xs font-semibold text-white" :class="ETIQUETA[a.estado][1]">{{ ETIQUETA[a.estado][0] }}</span></td>
          </tr>
        </tbody>
      </table>
      <p v-if="compacto && alertas.length > mostradas.length" class="mt-1 text-xs text-slate-500">y {{ alertas.length - mostradas.length }} más en Tienda → Alertas.</p>
    </div>
  </div>
</template>
