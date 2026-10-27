<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../lib/api.js';
import { exito } from '../lib/avisos.js';
import { formatearColones, formatearFecha } from '../lib/format.js';

// Préstamos del Banco Popular y embargos del empleado: se anota solo cuánto se descuenta y cada cuánto (semana, quincena o mes), tal como lo
// manda el banco o el juzgado. La planilla lo reparte sola entre las semanas (los sábados del mes o de la quincena). No es plata de la empresa.
const props = defineProps({ empleado: { type: Object, required: true } });
const emit = defineEmits(['cerrar']);

const TIPOS = { prestamo_banco_popular: 'Préstamo Banco Popular', embargo: 'Embargo' };
const PERIODOS = { semana: 'por semana', quincena: 'por quincena', mes: 'por mes' };

const lista = ref([]);
const error = ref('');
const editando = ref(null); // null = cerrado; {} = nuevo; objeto = editar
const guardando = ref(false);
const form = reactive({ tipo: 'prestamo_banco_popular', monto: '', periodicidad: 'mes', descripcion: '', fechaDesde: '', fechaHasta: '', saldo: '', activa: true });

// Un préstamo del banco se descuenta por semana o por mes; un embargo, también por quincena.
const periodosPermitidos = computed(() => (form.tipo === 'embargo' ? ['semana', 'quincena', 'mes'] : ['semana', 'mes']));
function alCambiarTipo() {
  if (!periodosPermitidos.value.includes(form.periodicidad)) form.periodicidad = 'mes';
}

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
    ? { tipo: p.tipo, monto: Number(p.monto), periodicidad: p.periodicidad, descripcion: p.descripcion ?? '', fechaDesde: p.fechaDesde ?? '', fechaHasta: p.fechaHasta ?? '', saldo: p.saldo === null ? '' : Number(p.saldo), activa: p.activa }
    : { tipo: 'prestamo_banco_popular', monto: '', periodicidad: 'mes', descripcion: '', fechaDesde: '', fechaHasta: '', saldo: '', activa: true });
}

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    const cuerpo = {
      tipo: form.tipo,
      monto: Number(form.monto),
      periodicidad: form.periodicidad,
      descripcion: form.descripcion.trim(),
      fechaDesde: form.fechaDesde || null,
      fechaHasta: form.fechaHasta || null,
      saldo: form.saldo === '' || form.saldo === null ? null : Number(form.saldo),
      activa: form.activa,
    };
    if (editando.value?.id) await api.patch(`/planilla/deducciones-externas/${editando.value.id}`, cuerpo);
    else await api.post(`/planilla/empleados/${props.empleado.id}/deducciones-externas`, cuerpo);
    exito('Descuento guardado.');
    editando.value = null;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}

// Cómo se reparte, dicho con palabras, para que quien digita vea el efecto antes de guardar.
const explicacion = computed(() => {
  const m = Number(form.monto);
  if (!(m > 0)) return '';
  if (form.periodicidad === 'semana') return `Se descuentan ${formatearColones(m)} cada semana.`;
  if (form.periodicidad === 'quincena') return `Se descuentan ${formatearColones(m)} cada quincena: en la planilla semanal se reparten entre los sábados de esa quincena.`;
  return `Se descuentan ${formatearColones(m)} cada mes: en la planilla semanal se reparten entre los sábados del mes (4 o 5).`;
});
</script>

<template>
  <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p class="text-sm font-semibold text-slate-800">Préstamos y embargos de {{ empleado.nombre }}</p>
    <p class="mb-3 mt-1 text-xs leading-relaxed text-slate-600">
      Anote <strong>solo el monto y cada cuánto se descuenta</strong> (por semana, por quincena o por mes), como lo manda el banco o el juzgado. La planilla lo reparte sola.
      Va después de la CCSS y la renta: primero los embargos, luego los préstamos del banco y al final las deudas con la empresa. No es plata de la empresa.
    </p>
    <p v-if="error" class="mb-2 text-sm font-medium text-red-600">{{ error }}</p>

    <ul v-if="lista.length" class="mb-3 flex flex-col gap-2 text-sm">
      <li v-for="p in lista" :key="p.id" class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-semibold text-slate-900">
            {{ TIPOS[p.tipo] }}<template v-if="p.descripcion"> · {{ p.descripcion }}</template>
            <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="p.activa ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'">{{ p.activa ? 'Activo' : 'Inactivo' }}</span>
          </p>
          <button type="button" class="font-semibold text-blue-700 underline" @click="abrir(p)">Editar</button>
        </div>
        <p class="text-xs text-slate-700">
          <strong>{{ formatearColones(p.monto) }} {{ PERIODOS[p.periodicidad] }}</strong><template v-if="p.fechaDesde"> · desde {{ formatearFecha(p.fechaDesde) }}</template><template v-else> · desde siempre</template><template v-if="p.fechaHasta"> hasta {{ formatearFecha(p.fechaHasta) }}</template>
          <template v-if="p.saldo !== null"> · saldo {{ formatearColones(p.saldo) }}</template>
        </p>
        <p class="mt-1 text-xs text-slate-600">
          Este mes ({{ p.semanasDelMes.length }} sábados):
          <span v-for="(s, i) in p.semanasDelMes" :key="s.sabado">{{ i ? ' · ' : '' }}{{ formatearFecha(s.sabado).slice(0, 5) }} {{ formatearColones(s.monto) }}</span>
        </p>
      </li>
    </ul>
    <p v-else-if="!editando" class="mb-3 text-sm text-slate-500">Sin préstamos ni embargos registrados.</p>

    <div v-if="editando" class="mb-3 flex flex-col gap-3 rounded-lg border border-blue-200 bg-white p-3">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label class="label">Qué es</label>
          <select v-model="form.tipo" class="input" @change="alCambiarTipo">
            <option value="prestamo_banco_popular">Préstamo del Banco Popular</option>
            <option value="embargo">Embargo</option>
          </select>
        </div>
        <div>
          <label class="label">Monto a descontar (₡) *</label>
          <input v-model="form.monto" type="number" min="0" step="0.01" class="input" inputmode="decimal" />
        </div>
        <div>
          <label class="label">Se descuenta *</label>
          <select v-model="form.periodicidad" class="input">
            <option v-for="k in periodosPermitidos" :key="k" :value="k">{{ PERIODOS[k] }}</option>
          </select>
        </div>
      </div>
      <p v-if="explicacion" class="text-xs text-slate-600">{{ explicacion }}</p>

      <details class="text-sm">
        <summary class="cursor-pointer font-semibold text-slate-700">Más opciones (referencia, fechas, saldo)</summary>
        <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="label">Número de operación o expediente</label><input v-model="form.descripcion" class="input" maxlength="160" placeholder="opcional" /></div>
          <div>
            <label class="label">Se descuenta desde (opcional)</label>
            <input v-model="form.fechaDesde" type="date" class="input" />
            <p class="mt-1 text-xs text-slate-500">Vacío = aplica a cualquier planilla que se arme, también a la semana pasada. Ponga una fecha solo si el descuento empieza después.</p>
          </div>
          <div><label class="label">Hasta (opcional)</label><input v-model="form.fechaHasta" type="date" class="input" /></div>
          <div><label class="label">Saldo pendiente (₡, opcional)</label><input v-model="form.saldo" type="number" min="0" step="0.01" class="input" placeholder="vacío = sin control de saldo" /></div>
          <label v-if="editando.id" class="flex items-center gap-2 self-end text-sm"><input v-model="form.activa" type="checkbox" class="size-4" /> Activo (se sigue descontando)</label>
        </div>
      </details>

      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="editando = null">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="guardando || !(Number(form.monto) > 0)" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </div>

    <div class="flex gap-2">
      <button type="button" class="btn-secondary" @click="emit('cerrar')">Cerrar</button>
      <button v-if="!editando" type="button" class="btn-primary" @click="abrir()">Agregar</button>
    </div>
  </div>
</template>
