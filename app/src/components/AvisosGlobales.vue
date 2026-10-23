<script setup>
import { CircleAlert, CircleCheck, Info, X } from '@lucide/vue';
import { avisos, cerrarAviso } from '../lib/avisos.js';

// Pila de avisos (ver lib/avisos.js). Colores sólidos para que se lean igual en el tema claro y en el oscuro.
const ESTILO = {
  exito: 'bg-green-700 text-white',
  error: 'bg-red-700 text-white',
  info: 'bg-slate-800 text-white',
};
const ICONO = { exito: CircleCheck, error: CircleAlert, info: Info };

function usar(a) {
  a.accion?.fn?.();
  cerrarAviso(a.id);
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-3 bottom-4 z-[95] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
    <div v-for="a in avisos.lista" :key="a.id" class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg" :class="ESTILO[a.tipo]" :role="a.tipo === 'error' ? 'alert' : 'status'">
      <component :is="ICONO[a.tipo]" class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p class="min-w-0 flex-1">{{ a.texto }}</p>
      <button v-if="a.accion" type="button" class="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 font-bold hover:bg-white/30" @click="usar(a)">{{ a.accion.texto }}</button>
      <button type="button" class="shrink-0 rounded-lg p-1 hover:bg-white/20" aria-label="Cerrar aviso" @click="cerrarAviso(a.id)"><X class="size-4" /></button>
    </div>
  </div>
</template>
