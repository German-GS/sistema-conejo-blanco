<script setup>
import { computed } from 'vue';

// Ranking en barras horizontales (HTML puro): una sola medida, etiqueta a la izquierda y valor a la derecha.
// filas: [{ etiqueta, valor, extra? }]; formato: función que convierte el valor en texto.
const props = defineProps({
  filas: { type: Array, required: true },
  formato: { type: Function, default: (v) => String(v) },
  color: { type: String, default: '#6366f1' },
  vacio: { type: String, default: 'Sin datos en este período.' },
});

const maximo = computed(() => Math.max(0, ...props.filas.map((f) => Math.abs(f.valor))) || 1);
</script>

<template>
  <ul v-if="filas.length" class="flex flex-col gap-1.5">
    <li v-for="f in filas" :key="f.etiqueta" class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]" :title="`${f.etiqueta}: ${formato(f.valor)}${f.extra ? ' · ' + f.extra : ''}`">
      <span class="truncate text-slate-700">{{ f.etiqueta }}</span>
      <span class="h-3 rounded-r bg-slate-100">
        <span class="block h-3 rounded-r" :style="{ width: `${Math.max(2, (Math.abs(f.valor) / maximo) * 100)}%`, background: color }" />
      </span>
      <span class="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">{{ formato(f.valor) }}</span>
    </li>
  </ul>
  <p v-else class="text-sm text-slate-500">{{ vacio }}</p>
</template>
