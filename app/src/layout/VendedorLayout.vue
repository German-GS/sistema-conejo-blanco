<script setup>
import { useRouter } from 'vue-router';
import { LogOut, KeyRound } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';

// A propósito NO tiene sidebar ni pestañas: el vendedor solo necesita
// entrar y salir de "Nuevo pedido" / "Mis pedidos" rápido, sin tener que
// pensar en un menú. Cualquier navegación extra sería fricción para
// alguien mayor usando el celular en la calle.
const auth = useAuthStore();
const router = useRouter();

function salir() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="flex-1 bg-slate-50">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div>
          <p class="text-base font-bold text-slate-900">Conejo Blanco</p>
          <p class="text-sm text-slate-500">{{ auth.usuario?.nombre }}</p>
        </div>
        <div class="flex items-center gap-2">
          <router-link :to="{ name: 'cambiar-clave' }" class="btn-secondary min-h-11 px-3 text-base" aria-label="Cambiar contraseña" title="Cambiar contraseña">
            <KeyRound class="size-5" />
          </router-link>
          <button type="button" class="btn-secondary min-h-11 px-4 text-base" @click="salir">
            <LogOut class="size-5" />
            Salir
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <router-view />
    </main>
  </div>
</template>
