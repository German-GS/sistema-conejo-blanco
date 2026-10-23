<script setup>
import { ref } from 'vue';
import { Eye, EyeOff } from '@lucide/vue';

// Campo de contraseña con el ojito para verla mientras se escribe. Los márgenes (mb-4…) van en el class del componente;
// los ajustes del campo en sí (tamaño de letra, alto) en inputClass.
defineProps({
  id: { type: String, default: undefined },
  placeholder: { type: String, default: undefined },
  autocomplete: { type: String, default: 'current-password' },
  required: { type: Boolean, default: false },
  inputClass: { type: String, default: '' },
});
const modelo = defineModel({ type: String, default: '' });
const visible = ref(false);
</script>

<template>
  <div class="relative">
    <input :id="id" v-model="modelo" :type="visible ? 'text' : 'password'" :required="required" :autocomplete="autocomplete" :placeholder="placeholder" class="input !pr-12" :class="inputClass" />
    <button
      type="button"
      class="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      :aria-pressed="visible"
      :title="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" class="size-5" />
      <Eye v-else class="size-5" />
    </button>
  </div>
</template>
