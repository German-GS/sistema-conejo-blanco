<script setup>
import { computed } from 'vue';
import { QrCode } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../../stores/auth.js';
import AccesoMarcaPage from './AccesoMarcaPage.vue';
import MarcasCelularPage from './MarcasCelularPage.vue';
import PuntosMarcaPage from './PuntosMarcaPage.vue';

// Todo lo de marcar desde el celular en un solo lugar: lo que ya se marcó, las pantallas con el QR y los celulares
// de cada empleado. Las dos últimas son solo del administrador del sistema (igual que en el servidor).
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const pestanas = computed(() => [
  { id: 'marcas', titulo: 'Marcas del celular', visible: true },
  { id: 'pantallas', titulo: 'Pantallas del QR', visible: auth.esSistema },
  { id: 'celulares', titulo: 'Celulares y PIN', visible: auth.esSistema },
].filter((p) => p.visible));

const actual = computed(() => pestanas.value.find((p) => p.id === route.query.pestana)?.id ?? 'marcas');
const ir = (id) => router.replace({ name: 'planilla-sistema-marcas', query: id === 'marcas' ? {} : { pestana: id } });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <QrCode class="size-5 text-blue-600" />
      <h1 class="text-xl font-bold text-slate-900">Sistema de marcas</h1>
    </div>
    <div v-if="pestanas.length > 1" class="flex flex-wrap gap-2" role="tablist">
      <button
        v-for="p in pestanas"
        :key="p.id"
        type="button"
        role="tab"
        :aria-selected="actual === p.id"
        class="rounded-lg border px-3 py-1.5 text-sm font-semibold"
        :class="actual === p.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="ir(p.id)"
      >
        {{ p.titulo }}
      </button>
    </div>
    <MarcasCelularPage v-if="actual === 'marcas'" />
    <PuntosMarcaPage v-else-if="actual === 'pantallas'" />
    <AccesoMarcaPage v-else />
  </div>
</template>
