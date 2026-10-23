<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import { esActiva, seccionesVisibles } from '../lib/navegacion.js';

// Migas de pan: dónde está la persona (Grupo › Sección › Nueva/Detalle) y un clic para volver a la sección.
const route = useRoute();
const auth = useAuthStore();
const migas = computed(() => {
  const sec = seccionesVisibles(auth).find((s) => esActiva(s, route.name));
  if (!sec || route.name === 'admin-home') return [];
  const partes = [];
  if (sec.grupo) partes.push({ texto: sec.grupo });
  const final = sec.to.name === route.name;
  partes.push({ texto: sec.etiqueta, to: final ? null : sec.to });
  if (!final) partes.push({ texto: /nuev/.test(String(route.name)) ? 'Nuevo' : 'Detalle' });
  return partes;
});
</script>

<template>
  <nav v-if="migas.length" aria-label="Ruta de navegación" class="flex min-w-0 items-center gap-1 text-sm text-slate-500">
    <template v-for="(m, i) in migas" :key="i">
      <ChevronRight v-if="i > 0" class="size-3.5 shrink-0" aria-hidden="true" />
      <router-link v-if="m.to" :to="m.to" class="truncate font-medium hover:text-slate-800 hover:underline">{{ m.texto }}</router-link>
      <span v-else class="truncate" :class="i === migas.length - 1 ? 'font-semibold text-slate-800' : ''" :aria-current="i === migas.length - 1 ? 'page' : undefined">{{ m.texto }}</span>
    </template>
  </nav>
</template>
