<script setup>
import { exito } from '../../../lib/avisos.js';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';

// Datos de cada tienda para el encabezado de su tiquete: cada tienda tiene su propia cédula jurídica (régimen simplificado).
// Lo que se deja vacío usa los datos generales de la empresa (Configuración → Datos de factura).
const auth = useAuthStore();
const puedeEditar = auth.tienePermiso('pos.gestionar');
const datos = ref(null);
const tiendaId = ref('');
const form = ref({});
const error = ref('');
const aviso = ref('');
const guardando = ref(false);

const CAMPOS = [
  ['razonSocial', 'Razón social', 'Nombre legal (el que figura en la cédula jurídica)', 'razonSocial'],
  ['nombreComercial', 'Nombre comercial (opcional)', 'Si lo llena, sale en grande en el tiquete', null],
  ['cedulaJuridica', 'Cédula jurídica', 'Ej. 3-101-123456', 'cedulaJuridica'],
  ['telefono', 'Teléfono', 'Ej. 2222-3333', 'telefono'],
  ['correo', 'Correo', 'Opcional', 'correo'],
  ['direccion', 'Dirección de la tienda', 'Ej. Avenida 2, calle 4, San José', 'direccion'],
  ['pieTiquete', 'Mensaje al pie del tiquete', 'Si queda vacío se usa el general de abajo', null],
  ['leyenda', 'Leyenda legal', 'Si queda vacía sale: «Documento emitido bajo el régimen simplificado. No es factura electrónica.»', null],
];

async function cargar() {
  try {
    datos.value = await api.get('/pos/tiendas-perfil');
    if (!tiendaId.value) tiendaId.value = datos.value.tiendas[0]?.ubicacionId ?? '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer los datos de las tiendas.';
  }
}
onMounted(cargar);

const tienda = computed(() => datos.value?.tiendas.find((t) => t.ubicacionId === tiendaId.value) ?? null);
watch(tienda, (t) => {
  form.value = t ? Object.fromEntries(CAMPOS.map((c) => [c[0], t[c[0]] ?? ''])) : {};
  aviso.value = '';
  error.value = '';
}, { immediate: true });

// Vista previa del encabezado tal como sale en el tiquete (lo vacío cae en los datos de la empresa).
const emp = computed(() => datos.value?.empresa ?? {});
const o = (k) => form.value[k]?.trim() || emp.value[k] || '';
const previa = computed(() => ({
  titulo: form.value.nombreComercial?.trim() || o('razonSocial') || 'Conejo Blanco',
  razon: form.value.nombreComercial?.trim() ? o('razonSocial') : '',
  cedula: o('cedulaJuridica'),
  direccion: o('direccion'),
  telefono: o('telefono'),
  correo: o('correo'),
}));

async function guardar() {
  guardando.value = true;
  error.value = '';
  aviso.value = '';
  try {
    const t = await api.patch(`/pos/tiendas-perfil/${tiendaId.value}`, form.value);
    const i = datos.value.tiendas.findIndex((x) => x.ubicacionId === t.ubicacionId);
    if (i >= 0) datos.value.tiendas[i] = t;
    exito('Datos de la tienda guardados. La caja los recibe al actualizar el catálogo (cada 10 minutos o al reconectarse).');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div v-if="datos" class="card mb-4 flex flex-col gap-3">
    <div>
      <p class="text-base font-semibold text-slate-900">Datos de cada tienda (encabezado del tiquete)</p>
      <p class="text-sm text-slate-500">Cada tienda tiene su propia cédula jurídica: llene aquí los datos que salen impresos en su tiquete. Lo que deje vacío usa los datos generales de la empresa (Configuración → Datos de factura).</p>
    </div>
    <p v-if="!datos.tiendas.length" class="text-sm text-slate-500">No hay tiendas activas. Cree una tienda en Ubicaciones.</p>
    <template v-else>
      <label class="flex flex-col text-sm font-medium text-slate-700">Tienda
        <select v-model="tiendaId" class="input mt-1 sm:max-w-sm"><option v-for="t in datos.tiendas" :key="t.ubicacionId" :value="t.ubicacionId">{{ t.nombre }} ({{ t.codigo }})</option></select>
      </label>
      <div class="grid gap-3 lg:grid-cols-[1fr_18rem]">
        <div class="grid gap-3 sm:grid-cols-2">
          <label v-for="c in CAMPOS" :key="c[0]" class="flex flex-col text-sm font-medium text-slate-700" :class="['direccion', 'pieTiquete', 'leyenda'].includes(c[0]) ? 'sm:col-span-2' : ''">{{ c[1] }}
            <input v-model="form[c[0]]" type="text" class="input mt-1" :placeholder="(c[3] && emp[c[3]]) ? `Empresa: ${emp[c[3]]}` : c[2]" :disabled="!puedeEditar" :maxlength="c[0] === 'cedulaJuridica' ? 30 : 300" />
            <span class="mt-0.5 text-xs font-normal text-slate-500">{{ c[2] }}</span>
          </label>
        </div>
        <div class="rounded-xl border border-dashed border-slate-300 bg-white p-3 font-mono text-xs leading-snug text-slate-900">
          <p class="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-slate-500">Así sale el encabezado</p>
          <p class="text-center font-bold">{{ previa.titulo }}</p>
          <p v-if="previa.razon" class="text-center">{{ previa.razon }}</p>
          <p v-if="previa.cedula" class="text-center">Céd. jurídica {{ previa.cedula }}</p>
          <p v-if="previa.direccion" class="text-center">{{ previa.direccion }}</p>
          <p v-if="previa.telefono" class="text-center">Tel. {{ previa.telefono }}</p>
          <p v-if="previa.correo" class="text-center">{{ previa.correo }}</p>
          <p class="text-center">{{ tienda?.nombre }}</p>
          <p class="mt-2 text-center text-[10px]">{{ form.leyenda?.trim() || 'Documento emitido bajo el régimen simplificado. No es factura electrónica.' }}</p>
        </div>
      </div>
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <p v-if="aviso" class="text-sm text-green-600">{{ aviso }}</p>
      <button v-if="puedeEditar" type="button" class="btn-primary self-start" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar datos de la tienda' }}</button>
    </template>
  </div>
  <p v-else-if="error" class="mb-4 text-sm font-medium text-red-600">{{ error }}</p>
</template>
