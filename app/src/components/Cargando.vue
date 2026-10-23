<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

// Indicador de carga con red de seguridad: si algo tarda demasiado, la persona no se queda mirando una pantalla quieta; se le dice
// qué pasa y qué puede hacer (reintentar o revisar la conexión).
const props = defineProps({
  texto: { type: String, default: 'Cargando…' },
  // Fila pequeña dentro de una tarjeta o lista (sin el espacio vertical grande).
  compacto: { type: Boolean, default: false },
  // Qué hacer al tocar «Reintentar»; sin esto se recarga la página.
  reintentar: { type: Function, default: null },
});
const tarda = ref(false);
const muyLento = ref(false);
let t1 = null;
let t2 = null;
onMounted(() => {
  t1 = setTimeout(() => (tarda.value = true), 8000);
  t2 = setTimeout(() => (muyLento.value = true), 25000);
});
onBeforeUnmount(() => {
  clearTimeout(t1);
  clearTimeout(t2);
});
const volver = () => (props.reintentar ? props.reintentar() : window.location.reload());
</script>

<template>
  <div role="status" aria-live="polite" class="flex flex-col items-center justify-center gap-2 text-slate-600" :class="compacto ? 'py-2' : 'py-8'">
    <div class="flex items-center gap-3">
      <span class="cargando-anillo" :class="compacto ? 'size-5' : 'size-8'" aria-hidden="true" />
      <span :class="compacto ? 'text-sm' : 'text-base font-medium'">{{ texto }}</span>
    </div>
    <template v-if="tarda">
      <p class="max-w-sm text-center text-sm text-slate-500">
        {{ muyLento ? 'Parece que hay un problema de conexión. Revise su internet o vuelva a intentarlo.' : 'Está tardando más de lo normal…' }}
      </p>
      <button type="button" class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" @click="volver">{{ reintentar ? 'Reintentar' : 'Recargar la página' }}</button>
    </template>
  </div>
</template>
