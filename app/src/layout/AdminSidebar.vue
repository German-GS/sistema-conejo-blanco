<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronDown, Pin, PinOff, X } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import { NAV, esActiva, puedeVer } from '../lib/navegacion.js';
import { contadorDeRuta } from '../lib/pendientes.js';
import { menuFijado } from '../lib/menuLateral.js';
import logoMenu from '../logo/logo-menu.png';

const route = useRoute();
const auth = useAuthStore();

// Aplana grupos y sueltos en una sola lista de "filas" para el template:
// { tipo: 'item', ... } o { tipo: 'grupo', etiqueta, items }. Un grupo
// sin ningún hijo visible no se muestra.
const filas = computed(() =>
  NAV.flatMap((entrada) => {
    if (entrada.grupo) {
      const visibles = entrada.items.filter((i) => puedeVer(i, auth));
      return visibles.length > 0 ? [{ tipo: 'grupo', etiqueta: entrada.grupo, items: visibles }] : [];
    }
    return puedeVer(entrada, auth) ? [{ tipo: 'item', ...entrada }] : [];
  }),
);

const props = defineProps({ abiertoEnMovil: { type: Boolean, default: false } });
const emit = defineEmits(['cerrar']);

// ---- Menú autocolapsable ----
// En pantallas grandes es una barra angosta de íconos que se expande al pasar el mouse (o queda
// abierta si se fija con el alfiler). En celular/tablet es el cajón de siempre.
const encima = ref(false);
let salida = null;
const expandido = computed(() => menuFijado.value || encima.value);
// Barra angosta de íconos (solo en pantallas grandes, sin pasar el mouse y sin fijar).
const compacto = computed(() => !expandido.value && !props.abiertoEnMovil);
function entrar() {
  clearTimeout(salida);
  encima.value = true;
}
function salir() {
  clearTimeout(salida);
  salida = setTimeout(() => (encima.value = false), 180);
}

// Los grupos (Ingresos, Contabilidad, Planilla) se abren y cierran; el de la página actual siempre se abre.
const abiertos = ref(new Set());
const grupoActivo = computed(() => filas.value.find((f) => f.tipo === 'grupo' && f.items.some((i) => esActiva(i, route.name)))?.etiqueta);
watch(grupoActivo, (g) => g && abiertos.value.add(g), { immediate: true });
function alternar(etiqueta) {
  const nuevo = new Set(abiertos.value);
  if (nuevo.has(etiqueta)) nuevo.delete(etiqueta);
  else nuevo.add(etiqueta);
  abiertos.value = nuevo;
}
</script>

<template>
  <div v-if="abiertoEnMovil" class="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" @click="emit('cerrar')" />

  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-[transform,width] duration-200 lg:translate-x-0"
    :class="[abiertoEnMovil ? 'translate-x-0' : '-translate-x-full', expandido ? 'lg:w-64 lg:shadow-xl' : 'lg:w-16', menuFijado ? 'lg:shadow-none' : '']"
    @mouseenter="entrar"
    @mouseleave="salir"
  >
    <div class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <img :src="logoMenu" alt="" class="size-9 shrink-0 object-contain" />
        <p class="truncate text-base font-bold text-slate-900" :class="{ 'lg:hidden': !expandido }">Conejo Blanco</p>
      </div>
      <button
        v-if="expandido"
        type="button"
        class="hidden rounded-lg p-1.5 hover:bg-slate-100 lg:block"
        :class="menuFijado ? 'text-blue-600' : 'text-slate-500'"
        :title="menuFijado ? 'Desfijar el menú' : 'Fijar el menú abierto'"
        @click="menuFijado = !menuFijado"
      >
        <component :is="menuFijado ? PinOff : Pin" class="size-4" />
      </button>
      <button type="button" aria-label="Cerrar menú" class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" @click="emit('cerrar')">
        <X class="size-5" />
      </button>
    </div>

    <nav class="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
      <template v-for="fila in filas" :key="fila.etiqueta">
        <router-link
          v-if="fila.tipo === 'item'"
          :to="fila.to"
          :title="expandido ? undefined : fila.etiqueta"
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
          :class="esActiva(fila, route.name) ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
          @click="emit('cerrar')"
        >
          <component :is="fila.icono" class="size-[18px] shrink-0" />
          <span class="truncate" :class="{ 'lg:hidden': !expandido }">{{ fila.etiqueta }}</span>
          <span v-if="contadorDeRuta(fila.to.name)" class="ml-auto rounded-full bg-red-600 px-1.5 text-xs font-bold text-white" :class="{ 'lg:hidden': !expandido }">{{ contadorDeRuta(fila.to.name) }}</span>
        </router-link>

        <div v-else class="pt-1">
          <!-- Encabezado del grupo: se abre y se cierra. En la barra angosta es solo una línea separadora. -->
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-600"
            :class="{ 'lg:hidden': !expandido }"
            @click="alternar(fila.etiqueta)"
          >
            {{ fila.etiqueta }}
            <ChevronDown class="size-3.5 transition-transform" :class="{ '-rotate-90': !abiertos.has(fila.etiqueta) }" />
          </button>
          <div v-if="compacto" class="mx-3 hidden border-t border-slate-100 lg:block" />
          <template v-if="abiertos.has(fila.etiqueta) || compacto">
            <router-link
              v-for="item in fila.items"
              :key="item.etiqueta"
              :to="item.to"
              :title="expandido ? undefined : item.etiqueta"
              class="mt-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              :class="esActiva(item, route.name) ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
              @click="emit('cerrar')"
            >
              <component :is="item.icono" class="size-[18px] shrink-0" />
              <span class="truncate" :class="{ 'lg:hidden': !expandido }">{{ item.etiqueta }}</span>
              <span v-if="contadorDeRuta(item.to.name)" class="ml-auto rounded-full bg-red-600 px-1.5 text-xs font-bold text-white" :class="{ 'lg:hidden': !expandido }">{{ contadorDeRuta(item.to.name) }}</span>
            </router-link>
          </template>
        </div>
      </template>
    </nav>
  </aside>
</template>
