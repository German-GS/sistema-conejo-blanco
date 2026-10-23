<script setup>
import { computed, useId } from 'vue';

// Campo de formulario accesible: etiqueta unida al campo, texto de ayuda y mensaje de error enlazados (aria-describedby).
// Uso:
//   <Campo v-model="nombre" etiqueta="Nombre" ayuda="Como aparece en la cédula" :error="errores.nombre" requerido />
//   <Campo v-model="tipo" etiqueta="Tipo" tipo="select"><option value="a">A</option></Campo>
const props = defineProps({
  etiqueta: { type: String, required: true },
  tipo: { type: String, default: 'text' }, // text, number, date, email, password, textarea, select…
  ayuda: { type: String, default: '' },
  error: { type: String, default: '' },
  requerido: { type: Boolean, default: false },
  placeholder: { type: String, default: undefined },
  deshabilitado: { type: Boolean, default: false },
});
const modelo = defineModel({ default: '' });
const id = useId();
const ayudaId = computed(() => (props.ayuda ? `${id}-ayuda` : undefined));
const errorId = computed(() => (props.error ? `${id}-error` : undefined));
const describe = computed(() => [ayudaId.value, errorId.value].filter(Boolean).join(' ') || undefined);
</script>

<template>
  <div class="flex flex-col">
    <label :for="id" class="label">{{ etiqueta }}<span v-if="requerido" class="text-red-600" aria-hidden="true"> *</span></label>
    <select v-if="tipo === 'select'" :id="id" v-model="modelo" class="input" :required="requerido" :disabled="deshabilitado" :aria-invalid="Boolean(error)" :aria-describedby="describe"><slot /></select>
    <textarea v-else-if="tipo === 'textarea'" :id="id" v-model="modelo" class="input" :required="requerido" :placeholder="placeholder" :disabled="deshabilitado" :aria-invalid="Boolean(error)" :aria-describedby="describe" />
    <input v-else :id="id" v-model="modelo" :type="tipo" class="input" :required="requerido" :placeholder="placeholder" :disabled="deshabilitado" :aria-invalid="Boolean(error)" :aria-describedby="describe" />
    <p v-if="ayuda" :id="ayudaId" class="mt-1 text-xs text-slate-500">{{ ayuda }}</p>
    <p v-if="error" :id="errorId" class="mt-1 text-sm font-medium text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
