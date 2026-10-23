<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { LayoutDashboard, Store, ShoppingBag } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';

// Solo el administrador del sistema: pasar entre las pantallas de cada perfil (administración, caja de la
// tienda y vendedor) sin cerrar sesión, para probar y demostrar el recorrido completo.
const auth = useAuthStore();
const route = useRoute();

const VISTAS = [
  { clave: 'admin', nombre: 'Administración', ruta: 'admin-home', icono: LayoutDashboard },
  { clave: 'caja', nombre: 'Caja', ruta: 'pos', icono: Store },
  { clave: 'vendedor', nombre: 'Vendedor', ruta: 'vendedor-home', icono: ShoppingBag },
];

const actual = computed(() => (route.path.startsWith('/admin') ? 'admin' : route.path.startsWith('/pos') ? 'caja' : 'vendedor'));
</script>

<template>
  <nav v-if="auth.esSistema" class="flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5" aria-label="Cambiar de vista">
    <router-link
      v-for="v in VISTAS"
      :key="v.clave"
      :to="{ name: v.ruta }"
      class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition"
      :class="actual === v.clave ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
      :aria-current="actual === v.clave ? 'page' : undefined"
    >
      <component :is="v.icono" class="size-4" />
      <span class="hidden sm:inline">{{ v.nombre }}</span>
    </router-link>
  </nav>
</template>
