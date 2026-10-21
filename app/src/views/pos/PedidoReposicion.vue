<script setup>
import { computed, ref } from 'vue';
import { Minus, Plus, X } from '@lucide/vue';
import { useAuthStore } from '../../stores/auth.js';
import { buscar, crearOrden, minimoDe, numeroOrdenTexto, ordenesPendientes, pos, recibirOrdenTienda, stockDe, sugeridaPara, sugerenciasPedido } from '../../lib/pos.js';

// Pedido de mercadería a la bodega: ya trae sugeridos los productos agotados o en su mínimo.
const emit = defineEmits(['cerrar']);
const auth = useAuthStore();
const vista = ref('nuevo'); // 'nuevo' | 'mios'
const lineas = ref(
  sugerenciasPedido.value.map((s) => ({ varianteId: s.varianteId, codigo: s.codigo, nombre: s.nombre, color: s.color, bodega: s.bodega, stock: s.stock, minimo: s.minimo, sugerida: s.sugerida, cantidad: s.sugerida, incluir: true })),
);
const texto = ref('');
const notas = ref('');
const urgente = ref(false);
const error = ref('');
const enviando = ref(false);
const enviado = ref(null);

const resultados = computed(() => buscar(texto.value, 8).filter((v) => !lineas.value.some((l) => l.varianteId === v.varianteId)));
function agregarOtro(v) {
  const stock = stockDe(v.varianteId);
  const minimo = minimoDe(v.varianteId);
  lineas.value.push({ varianteId: v.varianteId, codigo: v.codigo, nombre: v.nombre, color: v.color, bodega: v.bodega, stock, minimo, sugerida: sugeridaPara(stock, minimo), cantidad: 12, incluir: true, manual: true });
  texto.value = '';
}
const incluidas = computed(() => lineas.value.filter((l) => l.incluir && Number(l.cantidad) > 0));
const totalPares = computed(() => incluidas.value.reduce((a, l) => a + Number(l.cantidad), 0));
const cambiar = (l, d) => (l.cantidad = Math.max(1, Number(l.cantidad || 0) + d));

async function enviar() {
  error.value = '';
  if (!incluidas.value.length) return (error.value = 'Marque al menos un producto con cantidad.');
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
    <div class="flex max-h-full w-full max-w-3xl flex-col rounded-2xl bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div class="flex gap-2">
          <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold" :class="vista === 'nuevo' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'" @click="vista = 'nuevo'; enviado = null">Pedir mercadería</button>
          <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold" :class="vista === 'mios' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'" @click="vista = 'mios'">Mis pedidos ({{ locales.length + remotos.length }})<span v-if="enCamino" class="ml-1 rounded-full bg-indigo-600 px-1.5 text-white">{{ enCamino }}</span></button>
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
                    <td v-if="o.puedeRecibir" class="py-1 text-right"><input v-if="(l.aprobada ?? 0) > 0" v-model="cantidades[l.varianteId]" type="number" min="0" :max="l.aprobada" class="input !min-h-9 !w-20 text-right" /></td>
                    <td v-else-if="o.estado === 'entregada'" class="py-1 text-right">{{ l.recibida ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="o.resolucion === 'corregida' && ['revisada', 'alistada', 'en_camino'].includes(o.estado)" class="mt-1 text-xs text-amber-700">El pedido se corrigió porque eso es lo que hay en bodega.</p>
              <template v-if="o.puedeRecibir">
                <p class="mt-2 text-sm font-semibold text-slate-800">Verifique lo que llegó contra la orden y acepte.</p>
                <input v-model="notaRecepcion" type="text" maxlength="300" :placeholder="hayDiferencia(o) ? 'Obligatorio: qué faltó o llegó dañado' : 'Nota (opcional)'" class="input mt-1" />
                <p v-if="errorRecepcion" class="mt-1 text-sm font-medium text-red-600">{{ errorRecepcion }}</p>
                <button type="button" class="btn-primary mt-2 w-full" :disabled="aceptando" @click="aceptar(o)">{{ aceptando ? 'Guardando…' : hayDiferencia(o) ? 'Aceptar con diferencias' : 'Todo coincide: aceptar mercadería' }}</button>
              </template>
            </div>
          </li>
          <li v-if="!locales.length && !remotos.length" class="py-4 text-sm text-slate-500">Todavía no hay pedidos de mercadería.</li>
        </ul>
        <p v-if="ordenesPendientes.length" class="mt-2 text-xs text-amber-700">{{ ordenesPendientes.length }} pedido(s) guardado(s) en esta computadora esperando internet.</p>
      </div>

      <div v-else-if="enviado" class="p-6 text-center">
        <p class="text-lg font-bold text-green-700">Pedido {{ numeroOrdenTexto(enviado) }} guardado</p>
        <p class="mt-1 text-sm text-slate-600">{{ enviado.enviada ? 'Ya llegó a la administración.' : pos.enLinea ? 'Enviando a la administración…' : 'Quedó guardado en esta computadora y se enviará solo cuando haya internet.' }}</p>
        <button type="button" class="btn-primary mt-4" @click="emit('cerrar')">Listo</button>
      </div>

      <template v-else>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <p class="text-sm text-slate-600">Ya van marcados los productos <b>agotados</b> o que llegaron a su <b>mínimo</b>, con la cantidad sugerida (hasta el doble del mínimo, en docenas). Ajuste lo que necesite.</p>
          <table class="mt-3 w-full text-sm">
            <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="w-8 py-1"></th><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2 text-right">En tienda</th><th class="py-1 pr-2 text-right">Mínimo</th><th class="py-1 pr-2 text-right">En bodega</th><th class="py-1 text-right">Pedir (pares)</th></tr></thead>
            <tbody>
              <tr v-for="l in lineas" :key="l.varianteId" class="border-b border-slate-100" :class="l.incluir ? '' : 'opacity-50'">
                <td class="py-1.5"><input v-model="l.incluir" type="checkbox" :aria-label="`Incluir ${l.codigo} ${l.color}`" /></td>
                <td class="py-1.5 pr-2"><span class="font-semibold">{{ l.codigo }} · {{ l.color }}</span><span v-if="l.stock <= 0" class="ml-1 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">Agotado</span><span v-else-if="l.minimo > 0 && l.stock <= l.minimo" class="ml-1 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">Bajo</span><span v-if="l.manual" class="ml-1 text-xs text-slate-400">agregado</span></td>
                <td class="py-1.5 pr-2 text-right font-semibold" :class="l.stock <= 0 ? 'text-red-600' : ''">{{ l.stock }}</td>
                <td class="py-1.5 pr-2 text-right text-slate-500">{{ l.minimo || '—' }}</td>
                <td class="py-1.5 pr-2 text-right" :class="l.bodega <= 0 ? 'text-red-600' : 'text-slate-600'">{{ l.bodega <= 0 ? 'sin existencias' : l.bodega }}</td>
                <td class="py-1.5"><span class="flex items-center justify-end gap-1"><button type="button" class="rounded border border-slate-300 p-1" aria-label="Menos" @click="cambiar(l, -12)"><Minus class="h-3.5 w-3.5" /></button><input v-model="l.cantidad" type="number" min="1" step="1" class="input !min-h-9 !w-20 text-right" /><button type="button" class="rounded border border-slate-300 p-1" aria-label="Más una docena" @click="cambiar(l, 12)"><Plus class="h-3.5 w-3.5" /></button></span></td>
              </tr>
              <tr v-if="!lineas.length"><td colspan="6" class="py-4 text-center text-sm text-green-700">Ningún producto está agotado ni en su mínimo. Si necesita algo más, búsquelo abajo.</td></tr>
            </tbody>
          </table>
          <div class="mt-3">
            <input v-model="texto" type="text" placeholder="Agregar otro producto: código o nombre" class="input" />
            <ul v-if="resultados.length" class="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
              <li v-for="v in resultados" :key="v.varianteId"><button type="button" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50" @click="agregarOtro(v)"><span>{{ v.codigo }} · {{ v.color }}</span><span class="text-xs text-slate-500">{{ stockDe(v.varianteId) }} en tienda</span></button></li>
            </ul>
          </div>
          <input v-model="notas" type="text" maxlength="300" placeholder="Notas para la administración (opcional)" class="input mt-3" />
          <label class="mt-2 flex items-center gap-2 text-sm font-medium"><input v-model="urgente" type="checkbox" /> Es urgente</label>
          <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p class="text-sm text-slate-600">{{ incluidas.length }} producto(s) · <b>{{ totalPares }}</b> pares</p>
          <button type="button" class="btn-primary" :disabled="enviando" @click="enviar">{{ enviando ? 'Guardando…' : 'Enviar pedido' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
