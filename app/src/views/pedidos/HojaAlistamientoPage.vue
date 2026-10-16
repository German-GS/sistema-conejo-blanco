<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Printer } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearFecha, nombreClientePedido } from '../../lib/format.js';

// Hoja de alistamiento: la imprime administración y la lleva físicamente
// a bodega. Ahí no hay computadora ni nadie que vaya a aprender a usar
// una — por eso esto es papel y lápiz: bodega marca qué se alistó, anota
// a mano lo que falta, y firma. Sin precios ni IVA: a bodega no le
// corresponde ver esa información, solo qué despachar.
const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const pedido = ref(null);
const cargando = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    pedido.value = await api.get(`/pedidos/${props.id}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el pedido.';
  } finally {
    cargando.value = false;
  }
});

// `window` no está en la lista de globals que el compilador de plantillas
// de Vue resuelve — usado directo en el template (@click="window.print()")
// se compila como _ctx.window.print() y explota en silencio. Envuelto acá
// en <script setup> sí es el `window` real del navegador.
function imprimir() {
  window.print();
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between print:hidden">
      <button type="button" class="flex items-center gap-1 text-lg font-medium text-slate-600" @click="router.back()">
        <ArrowLeft class="size-5" />
        Volver
      </button>
      <button v-if="pedido" type="button" class="btn-primary min-h-11 px-4 text-base" @click="imprimir">
        <Printer class="size-5" />
        Imprimir para bodega
      </button>
    </div>

    <p v-if="cargando" class="text-lg text-slate-500 print:hidden">Cargando…</p>
    <p v-if="error" class="text-lg font-medium text-red-600 print:hidden">{{ error }}</p>

    <div v-else-if="pedido" class="text-black">
      <div class="mb-4 flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p class="text-sm font-semibold uppercase tracking-wide text-slate-500 print:text-black">Conejo Blanco</p>
          <h1 class="text-2xl font-bold">Hoja de alistamiento — Orden #{{ pedido.numeroOrden }}</h1>
        </div>
        <p class="text-lg font-semibold">{{ formatearFecha(pedido.fecha) }}</p>
      </div>

      <div class="mb-5 grid grid-cols-2 gap-3 text-base">
        <p><span class="font-semibold">Cliente:</span> {{ nombreClientePedido(pedido) }}</p>
        <p><span class="font-semibold">Vendedor:</span> {{ pedido.vendedor?.nombre ?? '—' }}</p>
      </div>

      <p class="mb-2 text-sm">
        Marque <span class="font-semibold">Alistado</span> en cada línea que quede completa. Si falta cantidad,
        anote cuántos pares faltan en <span class="font-semibold">Faltan</span>.
      </p>

      <table class="mb-8 w-full border-collapse text-left text-base">
        <thead>
          <tr>
            <th class="border-2 border-black px-2 py-2">Código</th>
            <th class="border-2 border-black px-2 py-2">Producto</th>
            <th class="border-2 border-black px-2 py-2">Color</th>
            <th class="border-2 border-black px-2 py-2 text-center">Pares pedidos</th>
            <th class="border-2 border-black px-2 py-2 text-center">Alistado</th>
            <th class="border-2 border-black px-2 py-2 text-center">Faltan</th>
            <th class="border-2 border-black px-2 py-2">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linea in pedido.lineas" :key="linea.id">
            <td class="border-2 border-black px-2 py-4 align-top font-medium">{{ linea.codigoProducto }}</td>
            <td class="border-2 border-black px-2 py-4 align-top">{{ linea.nombreProducto }}</td>
            <td class="border-2 border-black px-2 py-4 align-top">{{ linea.color }}</td>
            <td class="border-2 border-black px-2 py-4 text-center align-top text-lg font-bold">{{ linea.pares }}</td>
            <td class="border-2 border-black px-2 py-4 align-top">
              <div class="flex flex-col gap-3">
                <span class="flex items-center gap-2">
                  <span class="inline-block size-4 shrink-0 border-2 border-black"></span>
                  Sí
                </span>
                <span class="flex items-center gap-2">
                  <span class="inline-block size-4 shrink-0 border-2 border-black"></span>
                  No
                </span>
              </div>
            </td>
            <td class="border-2 border-black px-2 py-4 align-top"></td>
            <td class="border-2 border-black px-2 py-4 align-top"></td>
          </tr>
        </tbody>
      </table>

      <div class="grid grid-cols-3 gap-8 pt-6 text-base">
        <div>
          <p class="mb-8">Preparado por (nombre):</p>
          <p class="border-t-2 border-black pt-1">&nbsp;</p>
        </div>
        <div>
          <p class="mb-8">Firma:</p>
          <p class="border-t-2 border-black pt-1">&nbsp;</p>
        </div>
        <div>
          <p class="mb-8">Fecha:</p>
          <p class="border-t-2 border-black pt-1">&nbsp;</p>
        </div>
      </div>
    </div>
  </div>
</template>
