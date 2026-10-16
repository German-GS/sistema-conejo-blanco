<script setup>
import FacturaEncabezado from './FacturaEncabezado.vue';
import { formatearColones, formatearFecha } from '../lib/format.js';

// La factura como se ve impresa (formato tipo Alegra). `doc` es lo que
// devuelve GET /facturas/:id/documento — o, en la vista previa, un objeto
// armado con lo que hay en el formulario.
defineProps({ doc: { type: Object, required: true } });

const dinero = (v) => formatearColones(v);
const numero = (v) => Number(v).toLocaleString('es-CR', { maximumFractionDigits: 2 });
</script>

<template>
  <article class="relative mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
    <p
      v-if="doc.anulada"
      class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none text-7xl font-black tracking-widest text-red-500/20"
    >
      ANULADA
    </p>

    <FacturaEncabezado :encabezado="doc.encabezado" :consecutivo="doc.consecutivo" />

    <div class="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 border-y border-slate-200 py-3 text-sm sm:grid-cols-4">
      <div class="col-span-2">
        <p class="text-xs font-semibold uppercase text-slate-500">Cliente</p>
        <p class="font-semibold text-slate-900">{{ doc.cliente.nombre }}</p>
        <p class="text-xs text-slate-600">Cédula: {{ doc.cliente.cedula }}</p>
        <p v-if="doc.cliente.direccion" class="text-xs text-slate-600">{{ doc.cliente.direccion }}</p>
        <p class="text-xs text-slate-600">{{ doc.cliente.telefono }} · {{ doc.cliente.email }}</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase text-slate-500">Fecha</p>
        <p>{{ formatearFecha(doc.fecha) }}</p>
        <p class="mt-1 text-xs font-semibold uppercase text-slate-500">Vencimiento</p>
        <p>{{ formatearFecha(doc.fechaVencimiento) }}</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase text-slate-500">Condición</p>
        <p>{{ doc.condicion }}</p>
        <template v-if="doc.medioPago">
          <p class="mt-1 text-xs font-semibold uppercase text-slate-500">Medio de pago</p>
          <p class="capitalize">{{ doc.medioPago }}</p>
        </template>
      </div>
      <div v-if="doc.encabezado.actividadEconomica" class="col-span-2">
        <p class="text-xs font-semibold uppercase text-slate-500">Actividad económica</p>
        <p class="text-xs">{{ doc.encabezado.actividadEconomica }}</p>
      </div>
      <div v-if="doc.vendedor">
        <p class="text-xs font-semibold uppercase text-slate-500">Vendedor</p>
        <p>{{ doc.vendedor }}</p>
      </div>
      <div v-if="doc.ordenCompra">
        <p class="text-xs font-semibold uppercase text-slate-500">Orden de compra</p>
        <p>{{ doc.ordenCompra }}</p>
      </div>
    </div>

    <table class="mt-4 w-full text-sm">
      <thead class="border-b-2 border-slate-300 text-left text-xs font-semibold uppercase text-slate-500">
        <tr>
          <th class="py-2 pr-2">Ítem</th>
          <th class="px-2 text-right">Cant.</th>
          <th class="px-2 text-right">Precio</th>
          <th class="px-2 text-right">Desc.</th>
          <th class="px-2 text-right">Imp.</th>
          <th class="pl-2 text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(l, i) in doc.lineas" :key="i" class="border-b border-slate-100 align-top">
          <td class="py-2 pr-2">{{ l.descripcion }}</td>
          <td class="px-2 text-right tabular-nums">{{ numero(l.cantidad) }}</td>
          <td class="px-2 text-right tabular-nums">{{ dinero(l.precioUnitario) }}</td>
          <td class="px-2 text-right tabular-nums">{{ l.descuentoPorcentaje ? `${numero(l.descuentoPorcentaje)} %` : '—' }}</td>
          <td class="px-2 text-right tabular-nums">{{ l.impuestoPorcentaje ? `${numero(l.impuestoPorcentaje)} %` : '—' }}</td>
          <td class="pl-2 text-right tabular-nums">{{ dinero(l.subtotal) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="mt-4 ml-auto w-72 text-sm">
      <div class="flex justify-between py-0.5"><span class="text-slate-600">Subtotal</span><span class="tabular-nums">{{ dinero(doc.totales.subtotalBruto) }}</span></div>
      <div class="flex justify-between py-0.5"><span class="text-slate-600">Descuento</span><span class="tabular-nums">{{ dinero(doc.totales.descuento) }}</span></div>
      <div class="flex justify-between py-0.5"><span class="text-slate-600">Impuestos</span><span class="tabular-nums">{{ dinero(doc.totales.impuestos) }}</span></div>
      <div class="mt-1 flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
        <span>Total</span><span class="tabular-nums">{{ dinero(doc.totales.total) }}</span>
      </div>
    </div>

    <section v-if="doc.encabezado.cuentasBancarias" class="mt-6">
      <p class="text-xs font-semibold uppercase text-slate-500">Cuentas bancarias para el pago</p>
      <p class="whitespace-pre-line text-sm">{{ doc.encabezado.cuentasBancarias }}</p>
      <p class="text-xs text-slate-500">Favor colocar solamente el número de factura en el pago.</p>
    </section>
    <section v-if="doc.notas" class="mt-6">
      <p class="text-xs font-semibold uppercase text-slate-500">Notas</p>
      <p class="whitespace-pre-line text-sm">{{ doc.notas }}</p>
    </section>
    <section v-if="doc.terminos" class="mt-4">
      <p class="text-xs font-semibold uppercase text-slate-500">Términos y condiciones</p>
      <p class="whitespace-pre-line text-xs text-slate-700">{{ doc.terminos }}</p>
    </section>
    <p v-if="doc.leyenda" class="mt-6 text-center text-[11px] text-slate-500">{{ doc.leyenda }}</p>
  </article>
</template>
