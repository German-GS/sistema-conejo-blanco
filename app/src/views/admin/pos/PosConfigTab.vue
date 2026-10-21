<script setup>
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';

const auth = useAuthStore();
const cfg = ref(null);
const error = ref('');
const aviso = ref('');
const guardando = ref(false);
const puedeEditar = auth.tienePermiso('pos.gestionar');

async function cargar() {
  try {
    cfg.value = await api.get('/pos/configuracion');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo leer la configuración.';
  }
}
onMounted(cargar);

async function guardar() {
  guardando.value = true;
  error.value = '';
  aviso.value = '';
  try {
    cfg.value = await api.patch('/pos/configuracion', {
      cuentaTarjetaId: cfg.value.cuentaTarjetaId || null,
      cuentaSinpeId: cfg.value.cuentaSinpeId || null,
      cuentaTransferenciaId: cfg.value.cuentaTransferenciaId || null,
      pieTiquete: cfg.value.pieTiquete,
      ...(auth.esSistema ? { modoPrueba: Boolean(cfg.value.modoPrueba) } : {}),
    });
    aviso.value = 'Configuración guardada.';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}
const CAMPOS = [
  ['cuentaTarjetaId', 'Tarjeta (el banco deposita lo cobrado con el datáfono)'],
  ['cuentaSinpeId', 'SINPE Móvil'],
  ['cuentaTransferenciaId', 'Transferencia'],
];
</script>

<template>
  <div v-if="cfg" class="card flex max-w-2xl flex-col gap-3">
    <div>
      <p class="text-base font-semibold text-slate-900">Configuración del POS</p>
      <p class="text-sm text-slate-500">El efectivo entra a Caja y Bancos (1100). Para los demás medios elija la cuenta bancaria donde cae el dinero; si no elige una, también entra a Caja y Bancos. Las ventas no llevan IVA aparte (régimen simplificado).</p>
    </div>
    <label v-for="c in CAMPOS" :key="c[0]" class="flex flex-col text-sm font-medium text-slate-700">{{ c[1] }}
      <select v-model="cfg[c[0]]" class="input mt-1" :disabled="!puedeEditar"><option :value="null">Caja y Bancos (1100)</option><option v-for="b in cfg.cuentasBancarias" :key="b.id" :value="b.id">{{ b.nombre }}</option></select>
    </label>
    <label v-if="auth.esSistema" class="flex items-start gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <input v-model="cfg.modoPrueba" type="checkbox" class="mt-0.5 size-5" />
      <span><b>Modo de prueba</b> (solo el administrador del sistema). Mientras esté activo, la caja de las tiendas muestra los <b>productos de prueba</b> con su etiqueta PRUEBA y un aviso grande. Sus ventas y pedidos no generan asientos ni cuentan en la caja. Apáguelo al terminar la demostración.</span>
    </label>
    <label class="flex flex-col text-sm font-medium text-slate-700">Mensaje al pie del tiquete<input v-model="cfg.pieTiquete" type="text" maxlength="300" class="input mt-1" :disabled="!puedeEditar" /></label>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm text-green-600">{{ aviso }}</p>
    <button v-if="puedeEditar" type="button" class="btn-primary self-start" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
    <p class="text-xs text-slate-500">El encabezado del tiquete (razón social, cédula, teléfono, dirección) sale de Configuración → Datos de factura.</p>
  </div>
  <p v-else-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
</template>
