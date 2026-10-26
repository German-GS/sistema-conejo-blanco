<script setup>
import { computed } from 'vue';

// Editor del horario por día (lunes a domingo). Cada día tiene entrada y
// salida, o queda como día libre. Muestra las horas ordinarias netas de cada
// día (restando el almuerzo de lunes a viernes) y el total de la semana: a
// partir de esas horas empieza la hora extra de ese día.
const props = defineProps({
  modelValue: { type: Object, required: true }, // { lun: {entrada, salida}|null, ... }
  almuerzoMin: { type: Number, default: 60 },
  deshabilitado: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const DIAS = [
  { clave: 'lun', nombre: 'Lunes' },
  { clave: 'mar', nombre: 'Martes' },
  { clave: 'mie', nombre: 'Miércoles' },
  { clave: 'jue', nombre: 'Jueves' },
  { clave: 'vie', nombre: 'Viernes' },
  { clave: 'sab', nombre: 'Sábado' },
  { clave: 'dom', nombre: 'Domingo' },
];

const minutos = (h) => {
  const [hh, mm] = (h || '').split(':').map(Number);
  return Number.isFinite(hh) ? hh * 60 + (mm || 0) : 0;
};
const netos = (clave) => {
  const t = props.modelValue[clave];
  if (!t) return 0;
  return Math.max(0, minutos(t.salida) - minutos(t.entrada) - (clave === 'sab' ? 0 : props.almuerzoMin));
};
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const total = computed(() => DIAS.reduce((a, d) => a + netos(d.clave), 0));

function cambiar(clave, campo, valor) {
  emit('update:modelValue', { ...props.modelValue, [clave]: { ...props.modelValue[clave], [campo]: valor } });
}
function alternar(clave, trabaja) {
  emit('update:modelValue', { ...props.modelValue, [clave]: trabaja ? { entrada: '08:00', salida: clave === 'sab' ? '13:00' : '17:00' } : null });
}
</script>

<template>
  <div>
    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
          <tr><th class="px-3 py-2">Día</th><th class="px-2">Trabaja</th><th class="px-2">Entrada</th><th class="px-2">Salida</th><th class="px-2 text-right">Horas ordinarias</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in DIAS" :key="d.clave" class="border-t border-slate-100">
            <td class="px-3 py-1.5 font-medium">{{ d.nombre }}</td>
            <td class="px-2"><input type="checkbox" class="size-4" :checked="Boolean(modelValue[d.clave])" :disabled="deshabilitado" @change="alternar(d.clave, $event.target.checked)" /></td>
            <td class="px-2 py-1"><input type="time" class="input w-32" :value="modelValue[d.clave]?.entrada" :disabled="deshabilitado || !modelValue[d.clave]" @input="cambiar(d.clave, 'entrada', $event.target.value)" /></td>
            <td class="px-2 py-1"><input type="time" class="input w-32" :value="modelValue[d.clave]?.salida" :disabled="deshabilitado || !modelValue[d.clave]" @input="cambiar(d.clave, 'salida', $event.target.value)" /></td>
            <td class="px-2 text-right tabular-nums">{{ modelValue[d.clave] ? hhmm(netos(d.clave)) : '—' }}</td>
          </tr>
        </tbody>
        <tfoot class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
          <tr><td class="px-3 py-2" colspan="4">Total de la semana</td><td class="px-2 text-right tabular-nums" :class="total === 2880 ? 'text-teal-700' : 'text-amber-700'">{{ hhmm(total) }} h</td></tr>
        </tfoot>
      </table>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      Las horas ordinarias salen de la entrada a la salida menos {{ almuerzoMin }} min de almuerzo (el sábado no lleva). Lo que se trabaje
      de más en un día es hora extra. {{ total === 2880 ? 'La semana suma 48 horas.' : 'La jornada ordinaria normal es de 48 horas por semana.' }}
      El <strong>día sin horario es su día libre</strong>: en comercio se paga (por eso se pagan 56 horas) y en industria no.
      Marque el <strong>domingo</strong> solo para quien lo trabaja como un día normal de su semana (ej. comercio, con otro día libre);
      si el domingo queda sin horario es su descanso y trabajarlo se paga como día especial.
    </p>
  </div>
</template>
