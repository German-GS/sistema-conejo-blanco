<script setup>
import { ref, watch } from 'vue';
import { ImageOff } from '@lucide/vue';

// Imagen que, si no carga (archivo borrado, sin internet, ruta vieja), muestra un marcador claro en lugar del ícono de imagen rota.
// `silencioso`: si falla no muestra nada (por ejemplo, el logo de una factura, que ya lleva el nombre de la empresa al lado).
const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  texto: { type: String, default: 'Imagen no disponible' },
  silencioso: { type: Boolean, default: false },
});
const fallo = ref(false);
watch(() => props.src, () => (fallo.value = false));
</script>

<template>
  <img v-if="src && !fallo" :src="src" :alt="alt" @error="fallo = true" />
  <span v-else-if="!silencioso" class="flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-500" role="img" :aria-label="`${alt || texto}: ${texto}`">
    <ImageOff class="size-6" aria-hidden="true" />
    {{ texto }}
  </span>
</template>
