<script setup>
import { computed } from 'vue';
import { FileClock } from '@lucide/vue';

// Aviso «Hay un borrador guardado» (ver lib/borrador.js).
const props = defineProps({ borrador: { type: Object, required: true } });
const cuando = computed(() => {
  const g = props.borrador.pendiente.value?.guardadoEn;
  if (!g) return '';
  return new Date(g).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
});
</script>

<template>
  <div v-if="borrador.pendiente.value" class="flex flex-wrap items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-white" role="status">
    <FileClock class="size-6 shrink-0" aria-hidden="true" />
    <p class="min-w-0 flex-1 text-base font-medium">Quedó un borrador sin terminar ({{ cuando }}). ¿Quiere recuperarlo?</p>
    <div class="flex gap-2">
      <button type="button" class="rounded-xl bg-white px-4 py-2 text-base font-bold text-blue-700 hover:bg-blue-50" @click="borrador.restaurar()">Recuperar</button>
      <button type="button" class="rounded-xl border-2 border-white/70 px-4 py-2 text-base font-semibold text-white hover:bg-white/10" @click="borrador.descartar()">Descartar</button>
    </div>
  </div>
</template>
