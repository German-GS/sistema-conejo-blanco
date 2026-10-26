<script setup>
import { computed } from 'vue';
import { CircleCheck, Clock, CircleX, Send } from '@lucide/vue';
import { estadoEmision } from '../lib/emision.js';

// Insignia del estado de emisión de una factura (como en Alegra): verde = Emitida, gris = En proceso,
// ámbar = Pendiente de envío, rojo = Rechazada. Al pasar el mouse explica qué significa.
const props = defineProps({ estado: { type: String, required: true }, mensaje: { type: String, default: null } });
const info = computed(() => estadoEmision(props.estado));
const icono = computed(() => ({ aceptada: CircleCheck, enviada: Clock, rechazada: CircleX, pendiente_envio: Send })[props.estado] ?? Clock);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
    :class="info.clase"
    :title="[info.ayuda, mensaje].filter(Boolean).join(' — ')"
  >
    <component :is="icono" class="size-3.5" />
    {{ info.texto }}
  </span>
</template>
