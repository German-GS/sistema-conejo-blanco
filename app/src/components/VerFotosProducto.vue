<script setup>
import ImagenConRespaldo from './ImagenConRespaldo.vue';
import { ref } from 'vue';
import { Eye, X, ChevronLeft, ChevronRight } from '@lucide/vue';
import { API_URL } from '../lib/api.js';

// Botón "ojo" + card con las fotos del producto — para que el vendedor
// se las muestre al cliente sin salir del buscador de productos. Solo se
// muestra si el producto tiene al menos una foto cargada (ver Inventario).
const props = defineProps({
  producto: { type: Object, required: true },
});

const abierto = ref(false);
const indice = ref(0);

function abrir() {
  indice.value = 0;
  abierto.value = true;
}

function anterior() {
  indice.value = (indice.value - 1 + props.producto.fotos.length) % props.producto.fotos.length;
}

function siguiente() {
  indice.value = (indice.value + 1) % props.producto.fotos.length;
}

function urlFoto(foto) {
  return `${API_URL}${foto.url}`;
}
</script>

<template>
  <button
    v-if="producto.fotos?.length"
    type="button"
    class="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 underline"
    @click="abrir"
  >
    <Eye class="size-4" />
    Ver foto{{ producto.fotos.length > 1 ? 's' : '' }}
  </button>

  <Teleport to="body">
    <div
      v-if="abierto"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-4"
      @click.self="abierto = false"
    >
      <div class="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white p-4 shadow-xl">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-lg font-bold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}</p>
          <button
            type="button"
            aria-label="Cerrar"
            class="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
            @click="abierto = false"
          >
            <X class="size-5" />
          </button>
        </div>

        <div class="relative flex items-center justify-center">
          <button
            v-if="producto.fotos.length > 1"
            type="button"
            aria-label="Foto anterior"
            class="absolute left-1 z-10 rounded-full bg-white/90 p-2 shadow hover:bg-white"
            @click="anterior"
          >
            <ChevronLeft class="size-5" />
          </button>
          <ImagenConRespaldo
            :src="urlFoto(producto.fotos[indice])"
            :alt="`${producto.codigo} — ${producto.nombre}`"
            texto="Esta foto ya no está disponible"
            class="max-h-[65vh] min-h-40 w-full rounded-xl bg-slate-100 object-contain"
          />
          <button
            v-if="producto.fotos.length > 1"
            type="button"
            aria-label="Foto siguiente"
            class="absolute right-1 z-10 rounded-full bg-white/90 p-2 shadow hover:bg-white"
            @click="siguiente"
          >
            <ChevronRight class="size-5" />
          </button>
        </div>

        <div v-if="producto.fotos.length > 1" class="mt-3 flex justify-center gap-1.5">
          <button
            v-for="(foto, i) in producto.fotos"
            :key="foto.id"
            type="button"
            :aria-label="`Ver foto ${i + 1}`"
            class="size-2.5 rounded-full transition-colors"
            :class="i === indice ? 'bg-blue-600' : 'bg-slate-300'"
            @click="indice = i"
          ></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
