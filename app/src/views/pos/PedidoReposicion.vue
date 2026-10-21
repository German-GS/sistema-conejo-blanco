<script setup>
import { computed, ref } from 'vue';
import { Minus, Package, Plus, Search, X } from '@lucide/vue';
import { API_URL } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { formatearColones } from '../../lib/format.js';
import { buscar, crearOrden, esVendible, minimoDe, numeroOrdenTexto, ordenesPendientes, pos, recibirOrdenTienda, stockDe, sugeridaPara, sugerenciasPedido } from '../../lib/pos.js';

// Pedido de mercadería a la bodega: ya trae sugeridos los productos agotados o en su mínimo.
const emit = defineEmits(['cerrar']);
const auth = useAuthStore();
const vista = ref('nuevo'); // 'nuevo' | 'mios'
const lineas = ref(
  sugerenciasPedido.value.map((s) => ({ varianteId: s.varianteId, codigo: s.codigo, nombre: s.nombre, color: s.color, bodega: s.bodega, prueba: !!s.prueba, stock: s.stock, minimo: s.minimo, sugerida: s.sugerida, cantidad: s.sugerida, incluir: true })),
);
const texto = ref('');
const notas = ref('');
const urgente = ref(false);
const error = ref('');
const enviando = ref(false);
const enviado = ref(null);

const verTodo = ref(false);
const fotosRotas = ref({});
const urlFoto = (v) => (v.foto && !fotosRotas.value[v.varianteId] ? `${API_URL}${v.foto}` : null);
const yaEnPedido = (v) => lineas.value.some((l) => l.varianteId === v.varianteId);
// Se busca en todo el catálogo, también lo que la tienda todavía no vende; sin texto y con «Ver todos» se lista todo.
const todos = computed(() => (pos.catalogo?.variantes ?? []).slice(0, 60));
const tarjetas = computed(() => (texto.value.trim() ? buscar(texto.value, 12, true) : verTodo.value ? todos.value : []));
function agregarOtro(v) {
  const stock = stockDe(v.varianteId);
  const minimo = minimoDe(v.varianteId);
  lineas.value.push({ varianteId: v.varianteId, codigo: v.codigo, nombre: v.nombre, color: v.color, bodega: v.bodega, prueba: !!v.prueba, stock, minimo, sugerida: sugeridaPara(stock, minimo), cantidad: 12, incluir: true, manual: true });
  texto.value = '';
}
const incluidas = computed(() => lineas.value.filter((l) => l.incluir && Number(l.cantidad) > 0));
const totalPares = computed(() => incluidas.value.reduce((a, l) => a + Number(l.cantidad), 0));
const cambiar = (l, d) => (l.cantidad = Math.max(1, Number(l.cantidad || 0) + d));

async function enviar() {
  error.value = '';
  if (!incluidas.value.length) return (error.value = 'Marque al menos un producto con cantidad.');
  const hayPrueba = incluidas.value.some((l) => l.prueba);
  if (hayPrueba && incluidas.value.some((l) => !l.prueba)) return (error.value = 'No mezcle productos de PRUEBA con productos reales en el mismo pedido: desmarque unos u otros.');
  enviando.value = true;
  try {
    enviado.value = await crearOrden(
      incluidas.value.map((l) => ({ varianteId: l.varianteId, codigo: l.codigo, nombre: l.nombre, color: l.color, cantidad: Math.round(Number(l.cantidad)), stockTienda: l.stock, minimo: l.minimo, sugerida: l.sugerida })),
      { urgente: urgente.value, notas: notas.value },
      { id: auth.usuario.id, nombre: auth.usuario.nombre },
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo guardar el pedido.';
  } finally {
    enviando.value = false;
  }
}

const COLOR = { enviada: 'bg-amber-100 text-amber-800', recibida: 'bg-amber-100 text-amber-800', revisada: 'bg-blue-100 text-blue-800', alistada: 'bg-blue-100 text-blue-800', en_camino: 'bg-indigo-100 text-indigo-800', entregada: 'bg-green-100 text-green-800', rechazada: 'bg-red-100 text-red-800', cancelada: 'bg-slate-200 text-slate-700' };
const TITULO_ESTADO = { enviada: 'Enviado', recibida: 'Recibido por la administración', revisada: 'Revisado', alistada: 'Alistado en bodega', en_camino: 'Enviado a la tienda', entregada: 'Recibido y aceptado', rechazada: 'Rechazado', cancelada: 'Cancelado' };
// Lo guardado en esta terminal que el servidor aún no devolvió + el seguimiento que conoce el servidor.
const locales = computed(() => pos.ordenes.filter((o) => !o.enviada).map((o) => ({ id: o.id, texto: numeroOrdenTexto(o), fecha: new Date(o.fecha).toLocaleString('es-CR', { hour12: false }), pares: o.lineas.reduce((a, l) => a + l.cantidad, 0), urgente: o.urgente, error: o.error })));
const remotos = computed(() => pos.ordenesRecientes.map((o) => ({ ...o, texto: `OR-${pos.tienda?.codigo}-${String(o.numero).padStart(4, '0')}` })).filter((o) => !locales.value.some((l) => l.id === o.id)));
const abierto = ref(null);
const cantidades = ref({});
const notaRecepcion = ref('');
const errorRecepcion = ref('');
const aceptando = ref(false);
function abrirOrden(o) {
  abierto.value = abierto.value === o.id ? null : o.id;
  cantidades.value = Object.fromEntries(o.lineas.filter((l) => (l.aprobada ?? 0) > 0).map((l) => [l.varianteId, l.aprobada]));
  notaRecepcion.value = '';
  errorRecepcion.value = '';
}
const hayDiferencia = (o) => o.lineas.some((l) => (l.aprobada ?? 0) > 0 && Number(cantidades.value[l.varianteId]) !== l.aprobada);
async function aceptar(o) {
  errorRecepcion.value = '';
  if (hayDiferencia(o) && !notaRecepcion.value.trim()) return (errorRecepcion.value = 'Hay diferencias con lo enviado: anote qué pasó (faltantes o dañados).');
  aceptando.value = true;
  try {
    await recibirOrdenTienda(o.id, o.lineas.filter((l) => (l.aprobada ?? 0) > 0).map((l) => ({ varianteId: l.varianteId, cantidadRecibida: Math.round(Number(cantidades.value[l.varianteId] ?? 0)) })), notaRecepcion.value);
    abierto.value = null;
  } catch (err) {
    errorRecepcion.value = err instanceof Error ? err.message : 'No se pudo aceptar la mercadería.';
  } finally {
    aceptando.value = false;
  }
}
const enCamino = computed(() => remotos.value.filter((o) => o.puedeRecibir).length);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3" @click.self="emit('cerrar')">
    <div class="flex max-h-full w-full max-w-4xl flex-col rounded-3xl bg-white text-base shadow-xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div class="flex gap-2">
          <button type="button" class="rounded-xl px-4 py-2.5 text-base font-extrabold" :class="vista === 'nuevo' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'" @click="vista = 'nuevo'; enviado = null">Pedir mercadería</button>
          <button type="button" class="rounded-xl px-4 py-2.5 text-base font-extrabold" :class="vista === 'mios' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'" @click="vista = 'mios'">Mis pedidos ({{ locales.length + remotos.length }})<span v-if="enCamino" class="ml-1 rounded-full bg-indigo-600 px-1.5 text-white">{{ enCamino }}</span></button>
        </div>
        <button type="button" aria-label="Cerrar" @click="emit('cerrar')"><X class="h-5 w-5" /></button>
      </div>

      <div v-if="vista === 'mios'" class="overflow-y-auto p-5">
        <p v-if="enCamino" class="mb-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">Tiene {{ enCamino }} envío(s) en camino: al llegar, verifique lo recibido y acéptelo.</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="p in locales" :key="p.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><span class="font-semibold">{{ p.texto }}</span> · {{ p.fecha }} · {{ p.pares }} pares<span v-if="p.urgente" class="ml-1 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">Urgente</span><span v-if="p.error" class="block text-xs text-red-600">{{ p.error }}</span></span>
            <span class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sin enviar (se enviará con internet)</span>
          </li>
          <li v-for="o in remotos" :key="o.id" class="py-2 text-sm">
            <button type="button" class="flex w-full flex-wrap items-center justify-between gap-2 text-left" @click="abrirOrden(o)">
              <span><span class="font-semibold">{{ o.texto }}</span> · {{ o.fecha }} · {{ o.pares }} pares<span v-if="o.urgente" class="ml-1 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">Urgente</span><span v-if="o.resolucion" class="ml-1 rounded bg-slate-200 px-1.5 text-xs font-semibold text-slate-700">{{ o.resolucion === 'aceptada' ? 'Aceptado' : 'Corregido' }}</span></span>
              <span class="rounded px-2 py-0.5 text-xs font-semibold" :class="COLOR[o.estado]">{{ TITULO_ESTADO[o.estado] ?? o.estado }}</span>
            </button>
            <div v-if="abierto === o.id" class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <ol class="space-y-0.5 text-xs text-slate-600">
                <li v-for="(e, i) in o.eventos" :key="i"><span class="font-semibold">{{ e.fecha }}</span> · {{ e.etiqueta }}<span v-if="e.usuario"> — {{ e.usuario }}</span><span v-if="e.nota" class="italic"> · «{{ e.nota }}»</span></li>
              </ol>
              <p v-if="o.respuesta" class="mt-1 text-sm text-slate-700">De la administración: {{ o.respuesta }}</p>
              <table class="mt-2 w-full text-sm">
                <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2 text-right">Usted pidió</th><th class="py-1 pr-2 text-right">{{ o.estado === 'entregada' ? 'Se envió' : 'Se le enviará' }}</th><th v-if="o.puedeRecibir || o.estado === 'entregada'" class="py-1 text-right">Recibido</th></tr></thead>
                <tbody>
                  <tr v-for="l in o.lineas" :key="l.varianteId" class="border-b border-slate-100">
                    <td class="py-1 pr-2 font-medium">{{ l.codigo }} · {{ l.color }}</td>
                    <td class="py-1 pr-2 text-right">{{ l.pedido }}</td>
                    <td class="py-1 pr-2 text-right font-semibold" :class="l.aprobada !== null && l.aprobada !== l.pedido ? 'text-amber-600' : ''">{{ l.aprobada ?? 'por definir' }}</td>
                    <td v-if="o.puedeRecibir" class="py-1 text-right"><input v-if="(l.aprobada ?? 0) > 0" v-model="cantidades[l.varianteId]" type="number" min="0" :max="l.aprobada" class="input !min-h-11 !w-24 text-right text-lg font-bold" /></td>
                    <td v-else-if="o.estado === 'entregada'" class="py-1 text-right">{{ l.recibida ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="o.resolucion === 'corregida' && ['revisada', 'alistada', 'en_camino'].includes(o.estado)" class="mt-1 text-xs text-amber-700">El pedido se corrigió porque eso es lo que hay en bodega.</p>
              <template v-if="o.puedeRecibir">
                <p class="mt-2 text-sm font-semibold text-slate-800">Verifique lo que llegó contra la orden y acepte.</p>
                <input v-model="notaRecepcion" type="text" maxlength="300" :placeholder="hayDiferencia(o) ? 'Obligatorio: qué faltó o llegó dañado' : 'Nota (opcional)'" class="input mt-1" />
                <p v-if="errorRecepcion" class="mt-1 text-sm font-medium text-red-600">{{ errorRecepcion }}</p>
                <button type="button" class="mt-2 w-full rounded-2xl bg-green-600 py-4 text-xl font-extrabold text-white shadow-sm hover:bg-green-700 disabled:bg-slate-300" :disabled="aceptando" @click="aceptar(o)">{{ aceptando ? 'Guardando…' : hayDiferencia(o) ? 'ACEPTAR CON DIFERENCIAS' : 'TODO COINCIDE: ACEPTAR MERCADERÍA' }}</button>
              </template>
            </div>
          </li>
          <li v-if="!locales.length && !remotos.length" class="py-4 text-sm text-slate-500">Todavía no hay pedidos de mercadería.</li>
        </ul>
        <p v-if="ordenesPendientes.length" class="mt-2 text-xs text-amber-700">{{ ordenesPendientes.length }} pedido(s) guardado(s) en esta computadora esperando internet.</p>
      </div>

      <div v-else-if="enviado" class="p-6 text-center">
        <p class="text-3xl font-extrabold text-green-700">PEDIDO ENVIADO</p><p class="text-xl font-bold text-slate-800">{{ numeroOrdenTexto(enviado) }}</p>
        <p class="mt-1 text-sm text-slate-600">{{ enviado.enviada ? 'Ya llegó a la administración.' : pos.enLinea ? 'Enviando a la administración…' : 'Quedó guardado en esta computadora y se enviará solo cuando haya internet.' }}</p>
        <button type="button" class="mt-4 rounded-2xl bg-slate-800 px-10 py-4 text-xl font-extrabold text-white hover:bg-slate-900" @click="emit('cerrar')">LISTO</button>
      </div>

      <template v-else>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <ol class="list-decimal space-y-0.5 rounded-2xl bg-blue-50 p-4 pl-9 text-base text-blue-900"><li>Ya van marcados los productos que se <b>acabaron</b> o se están acabando, con la cantidad que recomienda el sistema.</li><li>Cambie la cantidad si hace falta, o desmarque lo que no necesite.</li><li>Toque <b>ENVIAR PEDIDO</b>. La administración lo recibirá y usted podrá ver cómo va en «Mis pedidos».</li></ol>
          <table class="mt-3 w-full text-base">
            <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="w-8 py-1"></th><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2 text-right">En tienda</th><th class="py-1 pr-2 text-right">Mínimo</th><th class="py-1 pr-2 text-right">En bodega</th><th class="py-1 text-right">Pedir (pares)</th></tr></thead>
            <tbody>
              <tr v-for="l in lineas" :key="l.varianteId" class="border-b border-slate-100" :class="l.incluir ? '' : 'opacity-50'">
                <td class="py-1.5"><input v-model="l.incluir" type="checkbox" class="size-5" :aria-label="`Incluir ${l.codigo} ${l.color}`" /></td>
                <td class="py-1.5 pr-2"><span class="font-semibold">{{ l.codigo }} · {{ l.color }}</span><span v-if="l.prueba" class="ml-1 rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">PRUEBA</span><span v-if="l.stock <= 0" class="ml-1 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">Agotado</span><span v-else-if="l.minimo > 0 && l.stock <= l.minimo" class="ml-1 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">Bajo</span><span v-if="l.manual" class="ml-1 text-xs text-slate-400">agregado</span></td>
                <td class="py-1.5 pr-2 text-right font-semibold" :class="l.stock <= 0 ? 'text-red-600' : ''">{{ l.stock }}</td>
                <td class="py-1.5 pr-2 text-right text-slate-500">{{ l.minimo || '—' }}</td>
                <td class="py-1.5 pr-2 text-right" :class="l.bodega <= 0 ? 'text-red-600' : 'text-slate-600'">{{ l.bodega <= 0 ? 'sin existencias' : l.bodega }}</td>
                <td class="py-1.5"><span class="flex items-center justify-end gap-1"><button type="button" class="rounded border border-slate-300 p-1" aria-label="Menos" @click="cambiar(l, -12)"><Minus class="h-3.5 w-3.5" /></button><input v-model="l.cantidad" type="number" min="1" step="1" class="input !min-h-11 !w-24 text-right text-lg font-bold" /><button type="button" class="rounded border border-slate-300 p-1" aria-label="Más una docena" @click="cambiar(l, 12)"><Plus class="h-3.5 w-3.5" /></button></span></td>
              </tr>
              <tr v-if="!lineas.length"><td colspan="6" class="py-4 text-center text-sm text-green-700">Ningún producto está agotado ni en su mínimo. Si necesita algo más, búsquelo abajo.</td></tr>
            </tbody>
          </table>
          <div class="mt-4 rounded-2xl border-2 border-slate-200 p-3">
            <p class="text-base font-extrabold text-slate-900">¿Necesita otro producto?</p>
            <div class="relative mt-2">
              <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input v-model="texto" type="search" placeholder="Busque por código, nombre o color" class="input !pl-12" />
            </div>
            <button v-if="!texto.trim()" type="button" class="mt-2 text-sm font-semibold text-blue-700 underline" @click="verTodo = !verTodo">{{ verTodo ? 'Ocultar productos' : 'Ver todos los productos' }}</button>
            <p v-if="texto.trim() && !tarjetas.length" class="mt-2 text-sm text-slate-600">No se encontró ese producto. Pruebe con otra parte del código o del nombre.</p>
            <ul v-if="tarjetas.length" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <li v-for="v in tarjetas" :key="v.varianteId" class="flex gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <div class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  <img v-if="urlFoto(v)" :src="urlFoto(v)" alt="" class="size-full object-cover" @error="fotosRotas[v.varianteId] = true" />
                  <Package v-else class="size-8 text-slate-400" />
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <p class="truncate text-base font-bold text-slate-900">{{ v.codigo }} · {{ v.color }}<span v-if="v.prueba" class="ml-1 rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">PRUEBA</span></p>
                  <p class="truncate text-sm text-slate-600">{{ v.nombre }}</p>
                  <p class="mt-0.5 text-xs text-slate-600">En tienda <b :class="stockDe(v.varianteId) <= 0 ? 'text-red-600' : ''">{{ stockDe(v.varianteId) }}</b> · En bodega <b :class="v.bodega <= 0 ? 'text-red-600' : ''">{{ v.bodega <= 0 ? 'no hay' : v.bodega }}</b><span v-if="esVendible(v)"> · {{ formatearColones(v.precio) }}</span><span v-else class="ml-1 rounded bg-slate-200 px-1.5 text-slate-700">aún sin precio de tienda</span></p>
                  <button type="button" class="mt-auto self-end rounded-xl px-3 py-1.5 text-sm font-extrabold" :class="yaEnPedido(v) ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'" :disabled="yaEnPedido(v)" @click="agregarOtro(v)">{{ yaEnPedido(v) ? 'Ya está en el pedido' : 'Agregar al pedido' }}</button>
                </div>
              </li>
            </ul>
          </div>
          <input v-model="notas" type="text" maxlength="300" placeholder="Notas para la administración (opcional)" class="input mt-3" />
          <label class="mt-2 flex items-center gap-2 text-sm font-medium"><input v-model="urgente" type="checkbox" /> Es urgente</label>
          <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p class="text-lg text-slate-700">{{ incluidas.length }} producto(s) · <b>{{ totalPares }}</b> pares</p>
          <button type="button" class="rounded-2xl bg-green-600 px-8 py-4 text-xl font-extrabold text-white shadow-sm hover:bg-green-700 disabled:bg-slate-300" :disabled="enviando" @click="enviar">{{ enviando ? 'Guardando…' : 'ENVIAR PEDIDO' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
