<script setup>
import { onMounted, ref } from 'vue';
import { CircleCheck, CircleAlert, RefreshCw } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';

const resultado = ref(null);
const cargando = ref(true);
const error = ref('');
const abierto = ref(null);

async function verificar() {
  cargando.value = true;
  error.value = '';
  try {
    resultado.value = await api.get('/contabilidad/integridad');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo verificar.';
  } finally {
    cargando.value = false;
  }
}

onMounted(verificar);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-slate-900">Verificación de cálculos</h1>
        <p class="text-sm text-slate-500">
          Revisa que los datos guardados cumplan siempre las reglas: asientos cuadrados, totales de pedidos y facturas,
          saldos por cobrar, inventario y planilla. Solo lee, no modifica nada.
        </p>
      </div>
      <button type="button" class="btn-secondary min-h-11 px-4" :disabled="cargando" @click="verificar">
        <RefreshCw class="size-5" :class="{ 'animate-spin': cargando }" />
        Verificar
      </button>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div v-if="resultado" class="card" :class="resultado.ok ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'">
      <p class="flex items-center gap-2 text-base font-semibold" :class="resultado.ok ? 'text-green-800' : 'text-red-800'">
        <component :is="resultado.ok ? CircleCheck : CircleAlert" class="size-5" />
        {{ resultado.ok ? 'Todo cuadra: ninguna regla tiene diferencias.' : 'Hay diferencias que revisar.' }}
      </p>
    </div>

    <ul v-if="resultado" class="flex flex-col gap-2">
      <li v-for="r in resultado.resultados" :key="r.codigo" class="card">
        <button type="button" class="flex w-full items-start gap-3 text-left" @click="abierto = abierto === r.codigo ? null : r.codigo">
          <component :is="r.ok ? CircleCheck : CircleAlert" class="mt-0.5 size-5 shrink-0" :class="r.ok ? 'text-green-600' : 'text-red-600'" />
          <span class="flex-1 text-sm text-slate-800">{{ r.titulo }}</span>
          <span v-if="!r.ok" class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{{ r.cantidadProblemas }}</span>
        </button>
        <pre v-if="!r.ok && abierto === r.codigo" class="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{{ JSON.stringify(r.ejemplos, null, 2) }}</pre>
      </li>
    </ul>
  </div>
</template>
