<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../lib/api.js';
import { fechaHoyISO, formatearColones, formatearFecha } from '../lib/format.js';

// Cese de un empleado: se registra la fecha, la causa y el motivo, y se
// muestra la estimación de su liquidación (aguinaldo y vacaciones
// proporcionales). También sirve solo para ver la liquidación de alguien que
// ya está cesado (modo «liquidacion»).
const props = defineProps({
  empleadoId: { type: String, required: true },
  nombre: { type: String, required: true },
  modo: { type: String, default: 'cesar' }, // 'cesar' | 'liquidacion'
  fechaSugerida: { type: String, default: '' },
});
const emit = defineEmits(['hecho', 'cancelar']);

const TIPOS = [
  { valor: 'renuncia', etiqueta: 'Renuncia' },
  { valor: 'despido_con_responsabilidad', etiqueta: 'Despido con responsabilidad patronal (sin justa causa)' },
  { valor: 'despido_sin_responsabilidad', etiqueta: 'Despido sin responsabilidad patronal (con justa causa)' },
  { valor: 'mutuo_acuerdo', etiqueta: 'Mutuo acuerdo' },
  { valor: 'fin_contrato', etiqueta: 'Fin de contrato' },
];

const paso = ref(props.modo === 'liquidacion' ? 'liquidacion' : 'form');
const form = reactive({ fechaCese: props.fechaSugerida || fechaHoyISO(), tipoCese: 'renuncia', motivo: '' });
const trabajando = ref(false);
const error = ref('');
const liq = ref(null);
const vacacionesTomadas = ref(0);

async function cargarLiquidacion() {
  error.value = '';
  try {
    liq.value = await api.get(`/planilla/empleados/${props.empleadoId}/liquidacion?vacacionesTomadasDias=${Number(vacacionesTomadas.value) || 0}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo calcular la liquidación.';
  }
}
onMounted(() => {
  if (paso.value === 'liquidacion') cargarLiquidacion();
});

async function confirmar() {
  error.value = '';
  trabajando.value = true;
  try {
    await api.post(`/planilla/empleados/${props.empleadoId}/cesar`, { ...form, motivo: form.motivo.trim() });
    paso.value = 'liquidacion';
    await cargarLiquidacion();
    emit('hecho');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo registrar el cese.';
  } finally {
    trabajando.value = false;
  }
}
const dinero = (v) => formatearColones(v);
const imprimir = () => window.print();
</script>

<template>
  <div class="rounded-xl border border-slate-300 bg-slate-50 p-4">
    <template v-if="paso === 'form'">
      <p class="mb-1 text-sm font-semibold text-slate-800">Dar de baja a {{ nombre }}</p>
      <p class="mb-3 text-xs text-slate-500">
        El empleado deja de aparecer en las planillas desde el día siguiente al cese. Su historial, sus marcas y sus
        planillas anteriores se conservan. Después de confirmar vas a ver la estimación de su liquidación.
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label class="label">Último día de trabajo *</label><input v-model="form.fechaCese" type="date" class="input" /></div>
        <div class="sm:col-span-2">
          <label class="label">Causa del cese *</label>
          <select v-model="form.tipoCese" class="input"><option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option></select>
        </div>
        <div class="sm:col-span-3"><label class="label">Motivo *</label><input v-model="form.motivo" class="input" placeholder="Ej. Renunció por motivos personales, fin de la relación comercial…" /></div>
      </div>
      <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
      <div class="mt-3 flex gap-2">
        <button type="button" class="btn-secondary" @click="emit('cancelar')">Cancelar</button>
        <button type="button" class="btn-primary bg-red-600 hover:bg-red-700" :disabled="trabajando || !form.fechaCese || form.motivo.trim().length < 3" @click="confirmar">
          {{ trabajando ? 'Registrando…' : 'Confirmar el cese' }}
        </button>
      </div>
    </template>

    <template v-else>
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <p v-else-if="!liq" class="text-sm text-slate-500">Calculando…</p>
      <div v-else class="flex flex-col gap-3 text-sm text-slate-800">
        <div>
          <p class="text-base font-bold text-slate-900">Liquidación estimada — {{ liq.empleado.nombre }}</p>
          <p class="text-xs text-slate-500">
            Cese el {{ formatearFecha(liq.fechaCese) }} · {{ liq.etiquetaCese }} · «{{ liq.motivo }}»
            <template v-if="liq.empleado.fechaIngreso"> · ingresó el {{ formatearFecha(liq.empleado.fechaIngreso) }}</template>
          </p>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div class="rounded-lg bg-white p-3">
            <p class="text-xs text-slate-500">Aguinaldo proporcional</p>
            <p class="text-base font-bold">{{ dinero(liq.aguinaldo.monto) }}</p>
            <p class="text-xs text-slate-500">{{ liq.aguinaldo.meses }} meses desde {{ formatearFecha(liq.aguinaldo.periodoDesde) }}</p>
          </div>
          <div class="rounded-lg bg-white p-3">
            <p class="text-xs text-slate-500">Vacaciones proporcionales</p>
            <template v-if="liq.vacaciones">
              <p class="text-base font-bold">{{ dinero(liq.vacaciones.monto) }}</p>
              <p class="text-xs text-slate-500">{{ liq.vacaciones.semanasPendientes }} semanas de salario pendientes</p>
            </template>
            <p v-else class="text-xs text-amber-700">Falta la fecha de ingreso</p>
          </div>
          <div class="rounded-lg bg-white p-3">
            <p class="text-xs text-slate-500">Total estimado</p>
            <p class="text-base font-bold">{{ dinero(liq.total) }}</p>
            <p class="text-xs text-slate-500">sin preaviso ni cesantía</p>
          </div>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label class="label">Días de vacaciones que ya disfrutó o le pagaron</label>
            <input v-model="vacacionesTomadas" type="number" min="0" class="input w-32" @change="cargarLiquidacion" />
          </div>
          <p class="text-xs text-slate-500">Salario semanal usado: {{ dinero(liq.salarioSemanal) }} (mensual aprox. {{ dinero(liq.salarioMensual) }}).</p>
        </div>
        <p class="text-xs text-slate-500">
          Ya provisionado en el sistema ({{ liq.provisionadoEnElSistema.planillas }} planilla(s) aprobada(s)): aguinaldo
          {{ dinero(liq.provisionadoEnElSistema.aguinaldo) }} · vacaciones {{ dinero(liq.provisionadoEnElSistema.vacaciones) }} ·
          cesantía {{ dinero(liq.provisionadoEnElSistema.cesantia) }}.
        </p>
        <ul class="list-disc pl-5 text-xs text-amber-900">
          <li v-for="(n, i) in liq.notas" :key="i">{{ n }}</li>
        </ul>
        <p class="text-xs italic text-slate-500">Es una estimación con el salario actual: confirmala con la contadora antes de pagar.</p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="emit('cancelar')">Cerrar</button>
          <button type="button" class="btn-secondary" @click="imprimir">Imprimir</button>
        </div>
      </div>
    </template>
  </div>
</template>
