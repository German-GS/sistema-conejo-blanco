<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../lib/api.js';
import { exito } from '../lib/avisos.js';
import { fechaHoyISO, formatearColones, formatearFecha } from '../lib/format.js';

// Préstamos del empleado en el Banco Popular. El banco manda cada mes cuánto descontar (la cuota mensual) y la planilla semanal la
// reparte entre los sábados del mes (4 o 5). Cuando el banco cambia la cuota, se edita aquí. No es plata prestada por la empresa.
const props = defineProps({ empleado: { type: Object, required: true } });
const emit = defineEmits(['cerrar']);

const lista = ref([]);
const error = ref('');
const editando = ref(null); // null = cerrado; {} = nuevo; objeto = editar
const guardando = ref(false);
const form = reactive({ descripcion: '', cuotaMensual: '', fechaDesde: '', fechaHasta: '', saldo: '', activa: true });

async function cargar() {
  error.value = '';
  try {
    lista.value = await api.get(`/planilla/empleados/${props.empleado.id}/deducciones-externas`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar.';
  }
}
onMounted(cargar);

function abrir(p) {
  editando.value = p ?? {};
  error.value = '';
  Object.assign(form, p
    ? { descripcion: p.descripcion, cuotaMensual: Number(p.cuotaMensual), fechaDesde: p.fechaDesde, fechaHasta: p.fechaHasta ?? '', saldo: p.saldo === null ? '' : Number(p.saldo), activa: p.activa }
    : { descripcion: '', cuotaMensual: '', fechaDesde: fechaHoyISO(), fechaHasta: '', saldo: '', activa: true });
}

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    const cuerpo = {
      descripcion: form.descripcion.trim(),
      cuotaMensual: Number(form.cuotaMensual),
      fechaDesde: form.fechaDesde,
      fechaHasta: form.fechaHasta || null,
      saldo: form.saldo === '' || form.saldo === null ? null : Number(form.saldo),
      activa: form.activa,
    };
    if (editando.value?.id) await api.patch(`/planilla/deducciones-externas/${editando.value.id}`, cuerpo);
    else await api.post(`/planilla/empleados/${props.empleado.id}/deducciones-externas`, cuerpo);
    exito('Préstamo guardado.');
    editando.value = null;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p class="text-sm font-semibold text-slate-800">Préstamos del Banco Popular de {{ empleado.nombre }}</p>
    <p class="mb-3 mt-1 text-xs leading-relaxed text-slate-600">
      El banco manda <strong>cada mes</strong> cuánto descontar: esa es la <strong>cuota mensual</strong>. En la planilla semanal se reparte entre los <strong>sábados del mes</strong> (4 o 5):
      cada semana se descuenta una parte, y el mes suma exactamente la cuota. Si el banco cambia la cuota, edítela aquí. Va después de la CCSS y la renta, y antes de las deudas con la empresa.
    </p>
    <p v-if="error" class="mb-2 text-sm font-medium text-red-600">{{ error }}</p>

    <ul v-if="lista.length" class="mb-3 flex flex-col gap-2 text-sm">
      <li v-for="p in lista" :key="p.id" class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-semibold text-slate-900">
            {{ p.descripcion }}
            <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="p.activa ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'">{{ p.activa ? 'Activo' : 'Inactivo' }}</span>
          </p>
          <button type="button" class="font-semibold text-blue-700 underline" @click="abrir(p)">Editar</button>
        </div>
        <p class="text-xs text-slate-600">
          Cuota mensual {{ formatearColones(p.cuotaMensual) }} · desde {{ formatearFecha(p.fechaDesde) }}<template v-if="p.fechaHasta"> hasta {{ formatearFecha(p.fechaHasta) }}</template>
          <template v-if="p.saldo !== null"> · saldo {{ formatearColones(p.saldo) }}</template>
        </p>
        <p class="mt-1 text-xs text-slate-700">
          Este mes ({{ p.semanasDelMes.length }} sábados):
          <span v-for="(s, i) in p.semanasDelMes" :key="s.sabado">{{ i ? ' · ' : '' }}{{ formatearFecha(s.sabado).slice(0, 5) }} {{ formatearColones(s.monto) }}</span>
        </p>
      </li>
    </ul>
    <p v-else-if="!editando" class="mb-3 text-sm text-slate-500">Sin préstamos registrados.</p>

    <div v-if="editando" class="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-blue-200 bg-white p-3 sm:grid-cols-2">
      <div class="sm:col-span-2"><label class="label">Número de operación o nota *</label><input v-model="form.descripcion" class="input" maxlength="160" placeholder="Ej. operación 123456" /></div>
      <div><label class="label">Cuota mensual que manda el banco (₡) *</label><input v-model="form.cuotaMensual" type="number" min="0" step="0.01" class="input" /></div>
      <div><label class="label">Saldo pendiente (₡, opcional)</label><input v-model="form.saldo" type="number" min="0" step="0.01" class="input" placeholder="vacío = sin control de saldo" /></div>
      <div><label class="label">Se descuenta desde *</label><input v-model="form.fechaDesde" type="date" class="input" /></div>
      <div><label class="label">Hasta (opcional)</label><input v-model="form.fechaHasta" type="date" class="input" /></div>
      <label v-if="editando.id" class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="form.activa" type="checkbox" class="size-4" /> Activo (se sigue descontando)</label>
      <div class="flex gap-2 sm:col-span-2">
        <button type="button" class="btn-secondary" @click="editando = null">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="guardando || form.descripcion.trim().length < 2 || !(Number(form.cuotaMensual) > 0) || !form.fechaDesde" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </div>

    <div class="flex gap-2">
      <button type="button" class="btn-secondary" @click="emit('cerrar')">Cerrar</button>
      <button v-if="!editando" type="button" class="btn-primary" @click="abrir()">Agregar préstamo</button>
    </div>
  </div>
</template>
