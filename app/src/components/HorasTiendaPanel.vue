<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, ApiError } from '../lib/api.js';
import { formatearFecha } from '../lib/format.js';

// Horas del personal de tienda: no marca en el reloj de la fábrica, así que se
// meten a mano, día por día, de lunes a sábado. Cada día queda como una
// decisión de administración y el archivo del reloj no lo pisa.
const props = defineProps({
  empleados: { type: Array, required: true }, // empleados de tienda activos
  empleadoIdInicial: { type: String, default: '' },
  desdeInicial: { type: String, default: '' },
});
const emit = defineEmits(['guardado']);

const NOMBRES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const empleadoId = ref(props.empleadoIdInicial || props.empleados[0]?.id || '');
const desde = ref('');
const filas = ref([]);
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');
const aviso = ref('');

const empleado = computed(() => props.empleados.find((e) => e.id === empleadoId.value));
const horarioBase = ref(null);
const CLAVES = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

function lunesDe(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const dow = d.getDay(); // 0 domingo
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
function sumar(fechaIso, dias) {
  const d = new Date(`${fechaIso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Valores de partida de un día según el horario del empleado.
function porDefecto(i) {
  const e = empleado.value;
  // Su horario por día (o el de la fábrica); si ese día no trabaja, queda como día libre.
  const h = (e?.horarioSemanal ?? horarioBase.value)?.[CLAVES[i]];
  const sinHorario = (e?.horarioSemanal ?? horarioBase.value) && !h;
  return {
    tipo: sinHorario ? 'libre' : 'trabajo',
    entrada: h?.entrada ?? e?.horarioEntrada ?? '08:00',
    salida: h?.salida ?? (i === 5 ? e?.horarioSalidaSabado : e?.horarioSalida) ?? (i === 5 ? '13:00' : '17:00'),
    almuerzo: i === 5 ? 0 : (e?.almuerzoMinutos ?? 60),
    motivo: '',
  };
}

async function cargar() {
  if (!empleadoId.value || !desde.value) return;
  cargando.value = true;
  error.value = '';
  aviso.value = '';
  const lunes = lunesDe(desde.value);
  try {
    const existentes = await api.get(`/planilla/asistencia/dias?empleadoId=${empleadoId.value}&desde=${lunes}&hasta=${sumar(lunes, 5)}`);
    filas.value = NOMBRES.map((nombre, i) => {
      const fecha = sumar(lunes, i);
      const d = existentes.find((x) => x.fecha === fecha);
      const base = { fecha, nombre, existente: Boolean(d), ...porDefecto(i) };
      if (!d) return base;
      if (d.resolucionTipo === 'ausencia_justificada' || (d.estado === 'ausencia' && !d.descuenta)) return { ...base, tipo: 'libre', motivo: d.resolucionMotivo ?? '' };
      if (d.estado === 'ausencia') return { ...base, tipo: 'ausencia', motivo: d.resolucionMotivo ?? '' };
      if (d.marcas.length >= 2) {
        return { ...base, tipo: 'trabajo', entrada: d.marcas[0], salida: d.marcas[d.marcas.length - 1], almuerzo: d.minutosAlmuerzo ?? 0, motivo: '' };
      }
      return base;
    });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar los días.';
  } finally {
    cargando.value = false;
  }
}
onMounted(async () => {
  try {
    horarioBase.value = await api.get('/planilla/horario-base');
  } catch {
    /* sin horario de la fábrica se usan los horarios simples */
  }
  desde.value = lunesDe(props.desdeInicial || hoyLocal());
  cargar();
});
watch([empleadoId, desde], cargar);

const minutos = (hhmm) => {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : 0;
};
const netos = (f) => (f.tipo === 'trabajo' ? Math.max(0, minutos(f.salida) - minutos(f.entrada) - (Number(f.almuerzo) || 0)) : 0);
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const total = computed(() => filas.value.reduce((a, f) => a + netos(f), 0));

function rellenar() {
  filas.value = filas.value.map((f, i) => ({ ...f, ...porDefecto(i) }));
}

async function guardar() {
  error.value = '';
  aviso.value = '';
  guardando.value = true;
  try {
    await api.post('/planilla/asistencia/horas-manuales', {
      empleadoId: empleadoId.value,
      dias: filas.value.map((f) => ({
        fecha: f.fecha,
        tipo: f.tipo,
        ...(f.tipo === 'trabajo' ? { entrada: f.entrada, salida: f.salida, almuerzoMinutos: Number(f.almuerzo) || 0 } : {}),
        ...(f.motivo.trim() ? { motivo: f.motivo.trim() } : {}),
      })),
    });
    aviso.value = `Horas de ${empleado.value?.nombre} guardadas (${hhmm(total.value)} h trabajadas en la semana).`;
    emit('guardado');
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron guardar las horas.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="empleados.length === 0" class="text-sm text-slate-500">
      Todavía no hay empleados de tienda. Marcalos en Planilla → Empleados, con «Dónde trabaja: Tienda».
    </p>
    <template v-else>
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-64">
          <label class="label">Empleado de tienda</label>
          <select v-model="empleadoId" class="input"><option v-for="e in empleados" :key="e.id" :value="e.id">{{ e.nombre }}</option></select>
        </div>
        <div>
          <label class="label">Semana (cualquier día de la semana)</label>
          <input v-model="desde" type="date" class="input" @change="desde = lunesDe(desde)" />
        </div>
        <p class="pb-2 text-xs text-slate-500">Semana del {{ desde && formatearFecha(desde) }} al {{ desde && formatearFecha(sumar(desde, 5)) }}</p>
      </div>

      <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
      <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr><th class="px-3 py-2">Día</th><th class="px-2">Qué pasó</th><th class="px-2">Entrada</th><th class="px-2">Salida</th><th class="px-2">Almuerzo (min)</th><th class="px-2">Horas</th><th class="px-2">Nota (opcional)</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in filas" :key="f.fecha" class="border-t border-slate-100">
              <td class="whitespace-nowrap px-3 py-1.5 font-medium">{{ f.nombre }} {{ formatearFecha(f.fecha).slice(0, 5) }}<span v-if="f.existente" class="ml-1 text-xs text-teal-700">· ya guardado</span></td>
              <td class="px-2 py-1">
                <select v-model="f.tipo" class="input">
                  <option value="trabajo">Trabajó</option>
                  <option value="libre">Día libre (se paga)</option>
                  <option value="ausencia">No vino (se descuenta)</option>
                </select>
              </td>
              <td class="px-2 py-1"><input v-model="f.entrada" type="time" class="input w-32" :disabled="f.tipo !== 'trabajo'" /></td>
              <td class="px-2 py-1"><input v-model="f.salida" type="time" class="input w-32" :disabled="f.tipo !== 'trabajo'" /></td>
              <td class="px-2 py-1"><input v-model="f.almuerzo" type="number" min="0" max="240" class="input w-24" :disabled="f.tipo !== 'trabajo'" /></td>
              <td class="px-2 tabular-nums">{{ f.tipo === 'trabajo' ? hhmm(netos(f)) : '—' }}</td>
              <td class="px-2 py-1"><input v-model="f.motivo" class="input min-w-40" /></td>
            </tr>
          </tbody>
          <tfoot class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <tr><td class="px-3 py-2" colspan="5">Total de la semana</td><td class="px-2 tabular-nums">{{ hhmm(total) }}</td><td /></tr>
          </tfoot>
        </table>
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <p v-if="aviso" class="text-sm font-medium text-teal-700">{{ aviso }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" @click="rellenar">Rellenar con su horario estándar</button>
        <button type="button" class="btn-primary" :disabled="guardando || cargando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar horas de la semana' }}</button>
      </div>
    </template>
  </div>
</template>
