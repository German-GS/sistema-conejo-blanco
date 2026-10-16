<script setup>
import { formatearColones } from '../lib/format.js';

// Tabla genérica de un reporte contable: { columnas, filas, totales }.
// Una fila con _estilo 'titulo' | 'subtotal' | 'total' se resalta.
defineProps({ reporte: { type: Object, required: true } });

const valor = (col, v) => {
  if (v === undefined || v === null || v === '') return '';
  return col.tipo === 'moneda' ? formatearColones(v) : v;
};
const claseFila = (f) =>
  f._estilo === 'titulo'
    ? 'bg-slate-50 font-bold text-slate-800'
    : f._estilo === 'subtotal'
      ? 'font-semibold border-t border-slate-300'
      : f._estilo === 'total'
        ? 'font-bold bg-slate-100 border-t-2 border-slate-400'
        : '';
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-slate-200">
    <table class="min-w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
        <tr>
          <th v-for="c in reporte.columnas" :key="c.clave" class="whitespace-nowrap px-3 py-2" :class="c.tipo === 'moneda' && 'text-right'">{{ c.etiqueta }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(f, i) in reporte.filas" :key="i" class="border-t border-slate-100" :class="claseFila(f)">
          <td v-for="c in reporte.columnas" :key="c.clave" class="px-3 py-1.5" :class="c.tipo === 'moneda' ? 'whitespace-nowrap text-right tabular-nums' : ''">{{ valor(c, f[c.clave]) }}</td>
        </tr>
      </tbody>
      <tfoot v-if="reporte.totales" class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
        <tr>
          <td v-for="(c, i) in reporte.columnas" :key="c.clave" class="whitespace-nowrap px-3 py-2" :class="c.tipo === 'moneda' && 'text-right tabular-nums'">
            {{ i === 0 ? 'TOTAL' : valor(c, reporte.totales[c.clave]) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
