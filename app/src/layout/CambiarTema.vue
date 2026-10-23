<script setup>
import { computed } from 'vue';
import { Moon, Sun } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import { alternarTema, temaDe } from '../lib/tema.js';

// Perfiles de gerencia (administrador del sistema, gerente general y administración): interruptor entre tema oscuro y tema claro.
const auth = useAuthStore();
const tema = computed(() => temaDe(auth.usuario));
</script>

<template>
  <button
    v-if="auth.esAdministracion"
    type="button"
    role="switch"
    :aria-checked="tema === 'oscuro'"
    :aria-label="tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
    :title="tema === 'oscuro' ? 'Tema oscuro (clic para tema claro)' : 'Tema claro (clic para tema oscuro)'"
    class="relative flex h-8 w-16 shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-1 transition"
    @click="alternarTema(auth.usuario)"
  >
    <Sun class="absolute left-2 size-4 text-amber-500" />
    <Moon class="absolute right-2 size-4 text-indigo-400" />
    <span class="relative z-10 size-6 rounded-full bg-white shadow ring-1 ring-slate-300 transition-transform duration-200" :class="tema === 'oscuro' ? 'translate-x-8' : 'translate-x-0'" />
  </button>
</template>
