<script setup>
import ImagenConRespaldo from './ImagenConRespaldo.vue';
import { computed } from 'vue';
import { API_URL } from '../lib/api.js';

// Encabezado de la factura (logo + datos de la empresa), igual al de
// Alegra: logo a la izquierda, razón social y datos al centro, y a la
// derecha el consecutivo. Lo usan el documento impreso y la vista previa
// de Configuración.
const props = defineProps({
  encabezado: { type: Object, required: true },
  consecutivo: { type: String, default: '' },
  // Título del bloque de la derecha: 'Factura electrónica' o 'Recibo de caja'.
  titulo: { type: String, default: 'Factura electrónica' },
  // Con 'numero' se muestra tal cual (recibos); con 'consecutivo' se desglosa sucursal/terminal.
  etiquetaVacia: { type: String, default: 'Se asigna al emitir' },
});

const logo = computed(() => (props.encabezado.logoUrl ? `${API_URL}${props.encabezado.logoUrl}` : null));
// consecutivo = sucursal(3) + terminal(5) + tipo(2) + secuencial(10)
const sucursal = computed(() => (props.consecutivo.length === 20 ? props.consecutivo.slice(0, 3) : null));
const terminal = computed(() => (props.consecutivo.length === 20 ? props.consecutivo.slice(3, 8) : null));
</script>

<template>
  <div class="grid grid-cols-[1fr_2fr_1fr] items-center gap-4">
    <div class="flex justify-start">
      <ImagenConRespaldo v-if="logo" :src="logo" alt="Logo" silencioso class="max-h-28 max-w-full object-contain" />
    </div>
    <div class="text-center">
      <p class="text-lg font-bold text-slate-900">{{ encabezado.razonSocial || 'Razón social' }}</p>
      <p v-if="encabezado.cedulaJuridica" class="text-xs text-slate-700">CJ: {{ encabezado.cedulaJuridica }}</p>
      <p v-if="encabezado.descripcionActividad" class="text-xs text-slate-700">{{ encabezado.descripcionActividad }}</p>
      <p v-if="encabezado.direccion" class="text-xs text-slate-700">{{ encabezado.direccion }}</p>
      <p v-if="encabezado.telefono" class="text-xs text-slate-700">Tel: {{ encabezado.telefono }}</p>
      <p v-if="encabezado.correo" class="text-xs text-slate-700">{{ encabezado.correo }}</p>
    </div>
    <div class="text-sm text-slate-700">
      <p class="font-semibold text-slate-900">{{ titulo }}</p>
      <p>No. <span class="font-semibold tabular-nums">{{ consecutivo || etiquetaVacia }}</span></p>
      <p v-if="sucursal" class="text-xs text-slate-500">Sucursal: {{ sucursal }}</p>
      <p v-if="terminal" class="text-xs text-slate-500">Punto de venta: {{ terminal }}</p>
    </div>
  </div>
</template>
