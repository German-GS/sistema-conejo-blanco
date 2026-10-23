<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CornerDownLeft, FilePlus2, KeyRound, Search } from '@lucide/vue';
import { useAuthStore } from '../stores/auth.js';
import { seccionesVisibles } from '../lib/navegacion.js';
import { cerrarPaleta, paleta } from '../lib/paleta.js';
import { registrarUso } from '../lib/uso.js';

// Búsqueda rápida: escriba parte del nombre de una sección (o una palabra relacionada, como «planilla», «iva» o «reloj») y entre con Enter.
// Se abre con Ctrl/Cmd + K. Solo muestra lo que la persona tiene permiso de ver. Recuerda las últimas pantallas elegidas.
const auth = useAuthStore();
const router = useRouter();
const texto = ref('');
const indice = ref(0);
const entrada = ref(null);
const lista = ref(null);
const CLAVE_RECIENTES = 'cb-paleta-recientes';

const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ACCIONES = computed(() => {
  const a = [];
  if (auth.tienePermiso('facturacion.gestionar')) a.push({ etiqueta: 'Nueva factura de venta', grupo: 'Crear', to: { name: 'admin-factura-nueva' }, icono: FilePlus2, palabras: 'emitir facturar crear' });
  if (auth.tienePermiso('cuentas_por_cobrar.gestionar')) a.push({ etiqueta: 'Registrar un pago recibido', grupo: 'Crear', to: { name: 'admin-pago-nuevo' }, icono: FilePlus2, palabras: 'cobro abono nuevo pago' });
  a.push({ etiqueta: 'Cambiar mi contraseña', grupo: 'Mi cuenta', to: { name: 'cambiar-clave' }, icono: KeyRound, palabras: 'clave seguridad dos pasos 2fa' });
  return a;
});

const todas = computed(() => [...seccionesVisibles(auth), ...ACCIONES.value]);
const clave = (i) => `${i.to.name}`;

function recientes() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
  } catch {
    return [];
  }
}
const resultados = computed(() => {
  const q = normalizar(texto.value).trim();
  if (!q) {
    const r = recientes();
    const frecuentes = r.map((n) => todas.value.find((i) => clave(i) === n)).filter(Boolean);
    return [...frecuentes.map((i) => ({ ...i, reciente: true })), ...todas.value.filter((i) => !frecuentes.includes(i))].slice(0, 14);
  }
  const palabras = q.split(/\s+/);
  return todas.value
    .map((i) => {
      const campo = normalizar(`${i.etiqueta} ${i.grupo} ${i.palabras ?? ''}`);
      if (!palabras.every((p) => campo.includes(p))) return null;
      const enTitulo = normalizar(i.etiqueta);
      const puntos = palabras.reduce((a, p) => a + (enTitulo.startsWith(p) ? 3 : enTitulo.includes(p) ? 2 : 1), 0);
      return { i, puntos };
    })
    .filter(Boolean)
    .sort((a, b) => b.puntos - a.puntos)
    .map((x) => x.i)
    .slice(0, 14);
});

let temporizadorSin = null;
watch(texto, (t) => {
  indice.value = 0;
  clearTimeout(temporizadorSin);
  // Una búsqueda que no encuentra nada (y la persona dejó de escribir) se anota: dice qué nombres le faltan al menú.
  if (t.trim().length >= 3) temporizadorSin = setTimeout(() => !resultados.value.length && registrarUso('busqueda_sin_resultado', t.trim().toLowerCase()), 1500);
});
watch(
  () => paleta.abierta,
  async (abierta) => {
    if (!abierta) return;
    texto.value = '';
    indice.value = 0;
    await nextTick();
    entrada.value?.focus();
  },
);

function ir(item) {
  if (!item) return;
  try {
    const r = recientes().filter((n) => n !== clave(item));
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify([clave(item), ...r].slice(0, 5)));
  } catch {
    /* sin almacenamiento: no se recuerdan las recientes */
  }
  cerrarPaleta();
  router.push(item.to);
}

function alTeclear(e) {
  if (e.key === 'Escape') return cerrarPaleta();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    indice.value = Math.min(indice.value + 1, resultados.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    indice.value = Math.max(indice.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    ir(resultados.value[indice.value]);
  }
  nextTick(() => lista.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
}

function atajo(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (auth.autenticado && auth.usaPanelAdmin) paleta.abierta = !paleta.abierta;
  }
}
onMounted(() => window.addEventListener('keydown', atajo));
onBeforeUnmount(() => window.removeEventListener('keydown', atajo));
</script>

<template>
  <div v-if="paleta.abierta" class="fixed inset-0 z-[105] flex items-start justify-center bg-slate-900/50 p-3 pt-[12vh]" role="presentation" @click.self="cerrarPaleta">
    <div class="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Búsqueda rápida">
      <div class="flex items-center gap-3 border-b border-slate-200 px-4">
        <Search class="size-5 shrink-0 text-slate-500" aria-hidden="true" />
        <input ref="entrada" v-model="texto" type="text" role="combobox" aria-expanded="true" aria-controls="paleta-lista" autocomplete="off" placeholder="¿A dónde quiere ir? (factura, planilla, bodega…)" class="min-h-14 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500" @keydown="alTeclear" />
        <kbd class="hidden shrink-0 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs font-semibold text-slate-500 sm:block">Esc</kbd>
      </div>
      <ul id="paleta-lista" ref="lista" role="listbox" class="max-h-[50vh] overflow-y-auto p-2">
        <li v-for="(r, n) in resultados" :key="r.to.name + r.etiqueta" role="option" :aria-selected="n === indice">
          <button type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left" :class="n === indice ? 'bg-blue-600 text-white' : 'text-slate-800 hover:bg-slate-100'" @mousemove="indice = n" @click="ir(r)">
            <component :is="r.icono" class="size-[18px] shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ r.etiqueta }}</span>
            <span class="shrink-0 text-xs" :class="n === indice ? 'text-white/80' : 'text-slate-500'">{{ r.reciente ? 'Reciente' : r.grupo }}</span>
            <CornerDownLeft v-if="n === indice" class="size-4 shrink-0" aria-hidden="true" />
          </button>
        </li>
        <li v-if="!resultados.length" class="px-3 py-6 text-center text-sm text-slate-500">No hay nada con «{{ texto }}». Pruebe con otra palabra (por ejemplo «cliente», «planilla» o «iva»).</li>
      </ul>
      <p class="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">↑ ↓ para moverse · Enter para abrir · Esc para cerrar</p>
    </div>
  </div>
</template>
