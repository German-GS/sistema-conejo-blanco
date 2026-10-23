<script setup>
// Botón al final de una lista larga (ver usarLimite en lib/filtros.js).
defineProps({ restantes: { type: Number, default: 0 }, paso: { type: Number, default: 50 } });
defineEmits(['mas']);
</script>

<template>
  <div v-if="restantes > 0" class="flex justify-center py-3">
    <button type="button" class="rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" @click="$emit('mas')">Mostrar {{ Math.min(paso, restantes) }} más <span class="font-normal text-slate-500">(quedan {{ restantes }})</span></button>
  </div>
</template>
