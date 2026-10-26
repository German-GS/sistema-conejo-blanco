<script setup>
import Cargando from '../../components/Cargando.vue';
import { onMounted, ref } from 'vue';
import { ArrowLeft, Printer } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import FacturaDocumento from '../../components/FacturaDocumento.vue';
import EstadoEmision from '../../components/EstadoEmision.vue';
import { avisarEmision, estadoEmision } from '../../lib/emision.js';
import { exito, fallo, informar } from '../../lib/avisos.js';
import { confirmar } from '../../lib/confirmar.js';
import { formatearFechaHora } from '../../lib/format.js';

const props = defineProps({ id: { type: String, required: true } });
const doc = ref(null);
const error = ref('');
const imprimir = () => window.print();

// Acciones de emisión según el estado de la factura.
const trabajando = ref(false);
async function cargarDoc() {
  doc.value = await api.get(`/facturas/${props.id}/documento`);
}
async function accion(ruta, despues) {
  trabajando.value = true;
  try {
    const r = await api.post(`/facturacion-electronica/facturas/${props.id}/${ruta}`, {});
    await cargarDoc();
    despues(r);
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
  } finally {
    trabajando.value = false;
  }
}
const enviarAHacienda = () => accion('enviar', avisarEmision);
const consultarEstado = () => accion('consultar', (f) => (f.estado === 'enviada' ? informar('Hacienda todavía la está procesando.') : avisarEmision(f)));
async function reemitir() {
  if (!await confirmar('Hacienda rechazó esta factura. Se vuelve a emitir con un consecutivo NUEVO (el anterior no se puede reutilizar). Corrija primero los datos que indica el motivo. ¿Continuar?')) return;
  await accion('reemitir', avisarEmision);
}
const reenviarCorreo = () => accion('reenviar-correo', (r) => (r.enviado ? exito('Factura enviada al correo del cliente.') : informar(r.motivo ?? 'No se envió.')));

onMounted(async () => {
  try {
    doc.value = await api.get(`/facturas/${props.id}/documento`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la factura.';
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between print:hidden">
      <router-link :to="{ name: 'admin-facturas' }" class="flex items-center gap-1 text-sm font-semibold text-blue-700">
        <ArrowLeft class="size-4" /> Volver a facturas
      </router-link>
      <button v-if="doc" type="button" class="btn-primary" @click="imprimir">
        <Printer class="size-4" /> Imprimir
      </button>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-else-if="!doc" texto="Cargando…" compacto />
    <template v-else>
      <div class="rounded-xl border border-slate-200 bg-white p-3 text-sm print:hidden">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-slate-700">Estado de emisión:</span>
          <EstadoEmision :estado="doc.estadoHacienda" :mensaje="doc.mensajeHacienda" />
          <span class="text-slate-500">{{ estadoEmision(doc.estadoHacienda).ayuda }}</span>
        </p>
        <p v-if="doc.mensajeHacienda && doc.estadoHacienda !== 'aceptada'" class="mt-1 text-slate-600">{{ doc.mensajeHacienda }}</p>
        <div v-if="!doc.anulada" class="mt-2 flex flex-wrap gap-2">
          <button v-if="doc.estadoHacienda === 'pendiente_envio'" type="button" class="btn-primary" :disabled="trabajando" @click="enviarAHacienda">Enviar a Hacienda</button>
          <button v-if="doc.estadoHacienda === 'enviada'" type="button" class="btn-secondary" :disabled="trabajando" @click="consultarEstado">Consultar estado ahora</button>
          <button v-if="doc.estadoHacienda === 'rechazada'" type="button" class="btn-primary" :disabled="trabajando" @click="reemitir">Corregir y emitir de nuevo</button>
          <button v-if="doc.estadoHacienda === 'aceptada'" type="button" class="btn-secondary" :disabled="trabajando" @click="reenviarCorreo">
            {{ doc.entregadoCliente ? 'Reenviar al correo del cliente' : 'Enviar al correo del cliente' }}
          </button>
        </div>
        <p v-if="doc.estadoHacienda === 'aceptada'" class="mt-1 text-xs" :class="doc.entregadoCliente ? 'text-green-700' : 'text-slate-500'">
          {{ doc.entregadoCliente ? 'El XML y la respuesta de Hacienda ya se entregaron al correo del cliente.' : 'Todavía no se ha entregado al cliente por correo.' }}
        </p>
        <p class="mt-1 break-all text-xs text-slate-500">Clave numérica: {{ doc.claveNumerica }}</p>
        <p v-if="doc.enviadaEn" class="text-xs text-slate-500">Enviada a Hacienda: {{ formatearFechaHora(doc.enviadaEn) }}</p>
        <p v-if="doc.resueltaEn" class="text-xs text-slate-500">{{ doc.estadoHacienda === 'aceptada' ? 'Aceptada' : 'Respuesta' }} por Hacienda: {{ formatearFechaHora(doc.resueltaEn) }}</p>
      </div>
      <FacturaDocumento :doc="doc" />
    </template>
  </div>
</template>
