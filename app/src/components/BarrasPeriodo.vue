<script setup>
import { computed, ref } from 'vue';

// Barras verticales por período (mes o semana). Una o dos series; cada barra tiene su valor al pasar el mouse.
// periodos: [{ etiqueta, a, b? }]; nombres: [nombreA, nombreB?]; colores: [colorA, colorB?]
const props = defineProps({
  periodos: { type: Array, required: true },
  nombres: { type: Array, default: () => ['Valor'] },
  colores: { type: Array, default: () => ['#6366f1', '#d97706'] },
  formato: { type: Function, default: (v) => String(v) },
  alto: { type: Number, default: 180 },
});

const W = 620;
const PAD = { izq: 6, der: 6, arr: 14, abajo: 22 };
const dosSeries = computed(() => props.nombres.length > 1);
const techo = computed(() => Math.max(0, ...props.periodos.flatMap((p) => [p.a, p.b ?? 0])) || 1);
const hayNegativos = computed(() => props.periodos.some((p) => p.a < 0 || (p.b ?? 0) < 0));
const minimo = computed(() => (hayNegativos.value ? Math.min(0, ...props.periodos.flatMap((p) => [p.a, p.b ?? 0])) : 0));
const rango = computed(() => techo.value - minimo.value || 1);
const hAlto = props.alto - PAD.arr - PAD.abajo;
const y = (v) => PAD.arr + (1 - (v - minimo.value) / rango.value) * hAlto;
const y0 = computed(() => y(0));
const ancho = computed(() => (W - PAD.izq - PAD.der) / Math.max(props.periodos.length, 1));
const grosor = computed(() => Math.min(46, ancho.value * (dosSeries.value ? 0.38 : 0.62)));
const barras = computed(() =>
  props.periodos.flatMap((p, i) => {
    const centro = PAD.izq + ancho.value * (i + 0.5);
    const lista = [{ k: `${i}a`, v: p.a, x: dosSeries.value ? centro - grosor.value - 1 : centro - grosor.value / 2, c: props.colores[0], n: props.nombres[0], p }];
    if (dosSeries.value) lista.push({ k: `${i}b`, v: p.b ?? 0, x: centro + 1, c: props.colores[1], n: props.nombres[1], p });
    return lista.map((b) => ({ ...b, y: Math.min(y(b.v), y0.value), h: Math.max(Math.abs(y(b.v) - y0.value), b.v === 0 ? 0 : 1.5) }));
  }),
);
const etiquetas = computed(() => {
  const paso = Math.ceil(props.periodos.length / 8);
  return props.periodos.map((p, i) => ({ i, x: PAD.izq + ancho.value * (i + 0.5), texto: p.etiqueta })).filter((e) => e.i % paso === 0);
});
const activa = ref(null);
</script>

<template>
  <div>
    <div v-if="dosSeries" class="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span v-for="(n, i) in nombres" :key="n" class="flex items-center gap-1.5 text-slate-600"><span class="inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: colores[i] }" /> {{ n }}</span>
    </div>
    <svg v-if="periodos.length" :viewBox="`0 0 ${W} ${alto}`" class="w-full" role="img" :aria-label="`Gráfico por período: ${nombres.join(' y ')}`">
      <line :x1="PAD.izq" :x2="W - PAD.der" :y1="y0" :y2="y0" stroke="currentColor" class="text-slate-300" stroke-width="1" />
      <g v-for="b in barras" :key="b.k" @mouseenter="activa = b" @mouseleave="activa = null">
        <rect :x="b.x" :y="b.y" :width="grosor" :height="b.h" :fill="b.c" rx="3" :opacity="activa && activa.k !== b.k ? 0.55 : 1" />
        <rect :x="b.x - 2" :y="PAD.arr" :width="grosor + 4" :height="hAlto" fill="transparent" />
        <title>{{ b.p.etiqueta }} · {{ b.n }}: {{ formato(b.v) }}</title>
      </g>
      <text v-for="e in etiquetas" :key="e.i" :x="e.x" :y="alto - 6" text-anchor="middle" font-size="10" fill="currentColor" class="text-slate-500">{{ e.texto }}</text>
      <text v-if="activa" :x="W - PAD.der" y="10" text-anchor="end" font-size="11" fill="currentColor" class="text-slate-700">{{ activa.p.etiqueta }} · {{ activa.n }}: {{ formato(activa.v) }}</text>
    </svg>
    <p v-else class="text-sm text-slate-500">Sin datos en este período.</p>
  </div>
</template>
