<script setup>
import { Clock } from '@lucide/vue';
import { continuarSesion, inactividad } from '../lib/inactividad.js';

// «¿Sigue ahí?»: antes de cerrar la sesión por inactividad se avisa con una cuenta regresiva (ver lib/inactividad.js).
</script>

<template>
  <div v-if="inactividad.restante > 0" class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-3" role="presentation">
    <div class="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="inactividad-titulo">
      <span class="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Clock class="size-6" /></span>
      <p id="inactividad-titulo" class="mt-3 text-xl font-bold text-slate-900">¿Sigue ahí?</p>
      <p class="mt-1 text-base text-slate-600">Por seguridad, su sesión se cerrará en <b class="tabular-nums text-slate-900">{{ inactividad.restante }}</b> segundos.</p>
      <button type="button" class="mt-4 w-full rounded-2xl bg-blue-600 py-3 text-lg font-bold text-white hover:bg-blue-700" autofocus @click="continuarSesion">Seguir trabajando</button>
    </div>
  </div>
</template>
