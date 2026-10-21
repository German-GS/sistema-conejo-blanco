<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Menu, LogOut, KeyRound } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import AdminSidebar from './AdminSidebar.vue';
import { menuFijado } from '../lib/menuLateral.js';

const auth = useAuthStore();
const router = useRouter();
const menuMovilAbierto = ref(false);

const ETIQUETAS_ROL = {
  sistema: 'Administrador del sistema',
  gerente_general: 'Gerente general',
  administracion: 'Administración (gerencia)',
  contador: 'Contador',
  asistente: 'Asistente',
  vendedor: 'Vendedor',
  encargado_tienda: 'Encargado de tienda',
};

function salir() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="admin flex flex-1 bg-slate-50">
    <AdminSidebar :abierto-en-movil="menuMovilAbierto" @cerrar="menuMovilAbierto = false" />

    <!-- El contenido deja 4 rem para la barra de íconos (16 rem si el menú está fijado). -->
    <div class="flex min-w-0 flex-1 flex-col transition-[padding] duration-200" :class="menuFijado ? 'lg:pl-64' : 'lg:pl-16'">
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          aria-label="Abrir menú"
          class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          @click="menuMovilAbierto = true"
        >
          <Menu class="size-5" />
        </button>

        <div class="ml-auto flex items-center gap-3">
          <div class="text-right leading-tight">
            <p class="text-sm font-semibold text-slate-900">{{ auth.usuario?.nombre }}</p>
            <p class="text-xs text-slate-500">{{ ETIQUETAS_ROL[auth.usuario?.rol] ?? auth.usuario?.rol }}</p>
          </div>
          <router-link :to="{ name: 'cambiar-clave' }" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cambiar contraseña" title="Cambiar contraseña">
            <KeyRound class="size-5" />
          </router-link>
          <button type="button" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Salir" @click="salir">
            <LogOut class="size-5" />
          </button>
        </div>
      </header>

      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div class="mx-auto max-w-6xl">
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>
