<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { CircleCheck, ClipboardCheck } from '@lucide/vue';
import { pendientes, vigilarPendientes } from '../lib/pendientes.js';
import Cargando from './Cargando.vue';

// «Para hacer hoy»: lo que necesita acción, ordenado por urgencia, con un clic a la pantalla donde se resuelve.
const router = useRouter();
let detener = null;
onMounted(() => (detener = vigilarPendientes()));
onBeforeUnmount(() => detener?.());

const ESTILO = {
  urgente: 'bg-red-600 text-white',
  atencion: 'bg-amber-500 text-slate-900',
  info: 'bg-slate-200 text-slate-700',
};
const ETIQUETA = { urgente: 'Urgente', atencion: 'Por atender', info: 'Para revisar' };
const hayUrgentes = computed(() => pendientes.lista.some((p) => p.gravedad === 'urgente'));

function abrir(p) {
  try {
    if (p.pestana) sessionStorage.setItem(p.pestana.clave, p.pestana.valor);
  } catch {
    /* sin sessionStorage solo abre la primera pestaña */
  }
  router.push({ name: p.ruta });
}
</script>

<template>
  <section class="card" aria-labelledby="pendientes-titulo">
    <div class="flex items-center gap-2">
      <ClipboardCheck class="size-5 text-blue-600" aria-hidden="true" />
      <h2 id="pendientes-titulo" class="text-base font-semibold text-slate-900">Para hacer hoy</h2>
      <span v-if="pendientes.lista.length" class="rounded-full px-2 py-0.5 text-xs font-bold" :class="hayUrgentes ? 'bg-red-600 text-white' : 'bg-amber-500 text-slate-900'">{{ pendientes.lista.length }}</span>
    </div>

    <Cargando v-if="!pendientes.cargado" compacto texto="Revisando lo pendiente…" />
    <p v-else-if="pendientes.error && !pendientes.lista.length" class="mt-2 text-sm text-slate-500">No se pudo revisar lo pendiente en este momento.</p>
    <p v-else-if="!pendientes.lista.length" class="mt-2 flex items-center gap-2 text-sm font-medium text-green-700"><CircleCheck class="size-5" aria-hidden="true" /> Todo al día: no hay nada pendiente para su perfil.</p>
    <ul v-else class="mt-2 divide-y divide-slate-100">
      <li v-for="p in pendientes.lista" :key="p.clave">
        <button type="button" class="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left hover:bg-slate-50" @click="abrir(p)">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold" :class="ESTILO[p.gravedad]" :title="ETIQUETA[p.gravedad]">{{ p.cantidad }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-slate-900">{{ p.titulo }}</span>
            <span class="block text-xs text-slate-500">{{ p.detalle }}</span>
          </span>
          <span class="shrink-0 text-sm font-semibold text-blue-700">Abrir ›</span>
        </button>
      </li>
    </ul>
  </section>
</template>
