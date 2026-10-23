<script setup>
import { computed, ref } from 'vue';
import { Bookmark, Trash2 } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import { exito } from '../lib/avisos.js';

// Vistas guardadas de una lista: la persona guarda la combinación de filtros que usa seguido («Pedidos de crédito de Heredia») con un nombre
// y la aplica con un clic. Se guardan por persona en este navegador. `actual` devuelve los filtros de ahora; `aplicar` recibe los guardados.
const props = defineProps({ clave: { type: String, required: true }, actual: { type: Function, required: true }, aplicar: { type: Function, required: true } });
const auth = useAuthStore();
const llave = computed(() => `cb-vistas:${auth.usuario?.id ?? 'anonimo'}:${props.clave}`);
const abierto = ref(false);
const nombre = ref('');
const lista = ref(leer());

function leer() {
  try {
    return JSON.parse(localStorage.getItem(llave.value) ?? '[]');
  } catch {
    return [];
  }
}
function persistir() {
  try {
    localStorage.setItem(llave.value, JSON.stringify(lista.value));
  } catch {
    /* sin almacenamiento las vistas duran hasta recargar */
  }
}
function guardar() {
  const n = nombre.value.trim();
  if (!n) return;
  lista.value = [...lista.value.filter((v) => v.nombre.toLowerCase() !== n.toLowerCase()), { nombre: n, filtros: JSON.parse(JSON.stringify(props.actual())) }].slice(-12);
  persistir();
  nombre.value = '';
  exito(`Vista «${n}» guardada.`);
}
function usar(v) {
  props.aplicar(JSON.parse(JSON.stringify(v.filtros)));
  abierto.value = false;
}
function quitar(v) {
  lista.value = lista.value.filter((x) => x !== v);
  persistir();
}
</script>

<template>
  <div class="relative">
    <button type="button" class="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" :aria-expanded="abierto" @click="abierto = !abierto">
      <Bookmark class="size-4" aria-hidden="true" /> Vistas<span v-if="lista.length" class="rounded-full bg-slate-200 px-1.5 text-xs">{{ lista.length }}</span>
    </button>
    <div v-if="abierto" class="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Mis vistas</p>
      <ul v-if="lista.length" class="mt-1 divide-y divide-slate-100">
        <li v-for="v in lista" :key="v.nombre" class="flex items-center gap-1">
          <button type="button" class="min-w-0 flex-1 truncate py-2 text-left text-sm font-medium text-slate-800 hover:text-blue-700" @click="usar(v)">{{ v.nombre }}</button>
          <button type="button" class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700" :aria-label="`Quitar la vista ${v.nombre}`" @click="quitar(v)"><Trash2 class="size-4" /></button>
        </li>
      </ul>
      <p v-else class="py-2 text-sm text-slate-500">Todavía no tiene vistas. Ponga los filtros que usa seguido y guárdelos aquí.</p>
      <form class="mt-2 flex gap-2 border-t border-slate-100 pt-2" @submit.prevent="guardar">
        <input v-model="nombre" type="text" maxlength="40" placeholder="Nombre de la vista" class="input !min-h-9 flex-1" />
        <button type="submit" class="rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40" :disabled="!nombre.trim()">Guardar</button>
      </form>
      <p class="mt-1 text-xs text-slate-500">Guarda los filtros que tiene ahora.</p>
    </div>
  </div>
</template>
