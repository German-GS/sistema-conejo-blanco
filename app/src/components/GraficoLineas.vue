<script setup>
import { computed } from 'vue';

// Gráfico de líneas sencillo en SVG (sin librerías): una o varias series sobre el mismo eje de tiempo.
// series: [{ nombre, color, datos: [número | null, ...] }]; tiempos: [ms, ...] (uno por punto).
const props = defineProps({
  series: { type: Array, required: true },
  tiempos: { type: Array, required: true },
  unidad: { type: String, default: '' },
  maximo: { type: Number, default: null }, // fijo (ej. 100 para %); si no, se ajusta a los datos
  alto: { type: Number, default: 150 },
});

const W = 620;
const PAD = { izq: 40, der: 8, arr: 8, abajo: 20 };

const techo = computed(() => {
  if (props.maximo) return props.maximo;
  const m = Math.max(0, ...props.series.flatMap((s) => s.datos.filter((v) => v !== null)));
  if (m <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  return Math.ceil(m / p) * p;
});

const n = computed(() => props.tiempos.length);
const x = (i) => PAD.izq + (n.value <= 1 ? 0 : (i / (n.value - 1)) * (W - PAD.izq - PAD.der));
const y = (v) => PAD.arr + (1 - Math.min(v, techo.value) / techo.value) * (props.alto - PAD.arr - PAD.abajo);

// Una polilínea por tramo continuo (los huecos —sin datos— cortan la línea).
const trazos = computed(() =>
  props.series.map((s) => {
    const tramos = [];
    let actual = [];
    s.datos.forEach((v, i) => {
      if (v === null || v === undefined) {
        if (actual.length) tramos.push(actual);
        actual = [];
      } else {
        actual.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      }
    });
    if (actual.length) tramos.push(actual);
    return { ...s, tramos: tramos.map((t) => t.join(' ')) };
  }),
);

const guias = computed(() => [0, 0.5, 1].map((f) => ({ f, y: y(techo.value * f), texto: `${Math.round(techo.value * f * 10) / 10}${props.unidad}` })));
const hora = (ms) => new Date(ms).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false });
const etiquetasX = computed(() => (n.value < 2 ? [] : [0, Math.floor((n.value - 1) / 2), n.value - 1].map((i) => ({ x: x(i), texto: hora(props.tiempos[i]) }))));
const hayDatos = computed(() => props.series.some((s) => s.datos.some((v) => v !== null && v !== undefined)));
</script>

<template>
  <div>
    <div class="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span v-for="s in series" :key="s.nombre" class="flex items-center gap-1.5 text-slate-600"><span class="inline-block h-0.5 w-4 rounded" :style="{ background: s.color }" /> {{ s.nombre }}</span>
    </div>
    <svg :viewBox="`0 0 ${W} ${alto}`" class="w-full" role="img">
      <g v-for="g in guias" :key="g.f">
        <line :x1="PAD.izq" :x2="W - PAD.der" :y1="g.y" :y2="g.y" stroke="currentColor" class="text-slate-200" stroke-width="1" />
        <text :x="PAD.izq - 4" :y="g.y + 3" text-anchor="end" font-size="9" fill="currentColor" class="text-slate-500">{{ g.texto }}</text>
      </g>
      <text v-for="(e, i) in etiquetasX" :key="i" :x="e.x" :y="alto - 5" :text-anchor="i === 0 ? 'start' : i === 2 ? 'end' : 'middle'" font-size="9" fill="currentColor" class="text-slate-500">{{ e.texto }}</text>
      <template v-for="s in trazos" :key="s.nombre">
        <polyline v-for="(t, i) in s.tramos" :key="i" :points="t" fill="none" :stroke="s.color" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
        <!-- un punto aislado (tramo de un solo valor) igual se ve -->
        <circle v-for="(t, i) in s.tramos.filter((p) => !p.includes(' '))" :key="`p${i}`" :cx="t.split(',')[0]" :cy="t.split(',')[1]" r="2.2" :fill="s.color" />
      </template>
      <text v-if="!hayDatos" :x="W / 2" :y="alto / 2" text-anchor="middle" font-size="11" fill="currentColor" class="text-slate-400">Todavía no hay datos en este rango</text>
    </svg>
  </div>
</template>
