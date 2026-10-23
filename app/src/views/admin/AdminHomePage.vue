<script setup>
import { ref, watch } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import ResumenEmpresa from './ResumenEmpresa.vue';
import InicioSistema from './InicioSistema.vue';
import BandejaPendientes from '../../components/BandejaPendientes.vue';

// El inicio de cualquier cuenta es el resumen de la empresa. El administrador del sistema ve primero
// las métricas del servidor y, en otra pestaña, la salud de la empresa (el mismo resumen).
const auth = useAuthStore();
const pestana = ref(sessionStorage.getItem('cb-inicio-pestana') ?? 'sistema');
watch(pestana, (p) => sessionStorage.setItem('cb-inicio-pestana', p));
</script>

<template>
  <div v-if="!auth.esSistema" class="flex flex-col gap-5">
    <BandejaPendientes />
    <ResumenEmpresa />
  </div>
  <div v-else class="flex flex-col gap-5">
    <BandejaPendientes />
    <div class="flex gap-2">
      <button
        v-for="p in [['sistema', 'Sistema'], ['empresa', 'Salud de la empresa']]"
        :key="p[0]"
        type="button"
        class="rounded-lg border px-4 py-1.5 text-sm font-semibold"
        :class="pestana === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="pestana = p[0]"
      >
        {{ p[1] }}
      </button>
    </div>
    <InicioSistema v-if="pestana === 'sistema'" />
    <ResumenEmpresa v-else />
  </div>
</template>
