<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import { dialogo, responderDialogo } from '../lib/confirmar.js';

// Ventana de confirmación (ver lib/confirmar.js). El foco empieza en «Cancelar»: confirmar siempre es una decisión consciente.
const escrito = ref('');
const botonCancelar = ref(null);
const habilitado = computed(() => !dialogo.palabra || escrito.value.trim().toLowerCase() === dialogo.palabra.toLowerCase());

watch(
  () => dialogo.abierto,
  async (abierto) => {
    if (!abierto) return;
    escrito.value = '';
    await nextTick();
    botonCancelar.value?.focus();
  },
);

function alTeclear(e) {
  if (e.key === 'Escape') responderDialogo(false);
}
</script>

<template>
  <div v-if="dialogo.abierto" class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-3" role="presentation" @keydown="alTeclear" @click.self="responderDialogo(false)">
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo">
      <div class="flex items-start gap-3">
        <span v-if="dialogo.peligro" class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"><TriangleAlert class="size-5" /></span>
        <div class="min-w-0">
          <p id="confirmar-titulo" class="text-lg font-bold text-slate-900">{{ dialogo.titulo }}</p>
          <p v-for="(d, i) in dialogo.detalle" :key="i" class="mt-1.5 text-sm leading-snug text-slate-600">{{ d }}</p>
        </div>
      </div>
      <div v-if="dialogo.palabra" class="mt-4">
        <label class="text-sm font-semibold text-slate-700" for="confirmar-palabra">Para confirmar, escriba <b class="font-mono">{{ dialogo.palabra }}</b></label>
        <input id="confirmar-palabra" v-model="escrito" type="text" autocomplete="off" class="input mt-1" @keydown.enter.prevent="habilitado && responderDialogo(true)" />
      </div>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button ref="botonCancelar" type="button" class="rounded-xl border-2 border-slate-300 px-5 py-2.5 text-base font-semibold text-slate-700 hover:bg-slate-100" @click="responderDialogo(false)">{{ dialogo.cancelar }}</button>
        <button type="button" class="rounded-xl px-5 py-2.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" :class="dialogo.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'" :disabled="!habilitado" @click="responderDialogo(true)">{{ dialogo.aceptar }}</button>
      </div>
    </div>
  </div>
</template>
