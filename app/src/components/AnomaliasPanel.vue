<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError, descargarArchivo } from '../lib/api.js';
import { exito, fallo } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { formatearFecha } from '../lib/format.js';
import Cargando from './Cargando.vue';

// Anomalías de un empleado. No cambian el pago por sí solas: dejan constancia para que gerencia decida si emite una carta de amonestación y,
// en los almuerzos que se pasaron de la tolerancia, si se descuenta el exceso.
// Salen solas de la asistencia ya registrada cuando tuvo consecuencia: ausencias injustificadas, llegadas tarde o salidas antes de la hora con rebajo, y almuerzos fuera de lo normal.
// Lo demás se anota a mano. Las que se justifican (o se corrigen la asistencia) desaparecen solas mientras estén pendientes.
const props = defineProps({ empleado: { type: Object, required: true } });
const emit = defineEmits(['cambio', 'cerrar']);

const TIPOS = [
  { valor: 'almuerzo_corto', etiqueta: 'Almuerzo más corto de lo debido' },
  { valor: 'almuerzo_largo', etiqueta: 'Almuerzo más largo de lo debido' },
  { valor: 'almuerzo_salida_temprana', etiqueta: 'Salió a almorzar antes de la hora' },
  { valor: 'almuerzo_regreso_tarde', etiqueta: 'Regresó tarde del almuerzo' },
  { valor: 'tardanza', etiqueta: 'Llegada tarde' },
  { valor: 'salida_temprana', etiqueta: 'Salida antes de la hora' },
  { valor: 'ausencia', etiqueta: 'Ausencia' },
  { valor: 'otro', etiqueta: 'Otro' },
];
const ESTADOS = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
  carta_emitida: { texto: 'Carta emitida', clase: 'bg-blue-100 text-blue-700' },
  descartada: { texto: 'Descartada', clase: 'bg-slate-100 text-slate-600' },
};
const etiqueta = (t) => TIPOS.find((x) => x.valor === t)?.etiqueta ?? t;
// Las que normalmente justifican una carta de amonestación (el almuerzo solo deja constancia).
const PUEDE_LLEVAR_CARTA = ['tardanza', 'salida_temprana', 'ausencia'];
const pendientes = computed(() => visibles.value.filter((a) => a.estado === 'pendiente'));
const resumenPendientes = computed(() => {
  const c = {};
  for (const a of pendientes.value) c[a.tipo] = (c[a.tipo] ?? 0) + 1;
  return Object.entries(c).map(([t, n]) => `${n} ${etiqueta(t).toLowerCase()}`).join(' · ');
});
const elegirPendientes = () => { for (const a of lista.value) elegidas[a.id] = a.estado === 'pendiente' && visibles.value.includes(a); };

const lista = ref([]);
const cargando = ref(true);
const trabajando = ref(false);
const elegidas = reactive({});
const nueva = reactive({ abierta: false, fecha: '', tipo: 'tardanza', detalle: '', minutos: '' });

// Se puede mirar solo un período (ej. la semana de la planilla): lo que no se ve tampoco entra a la carta.
const filtro = reactive({ desde: '', hasta: '' });
const visibles = computed(() => lista.value.filter((a) => (!filtro.desde || a.fecha >= filtro.desde) && (!filtro.hasta || a.fecha <= filtro.hasta)));
const marcadas = computed(() => visibles.value.filter((a) => elegidas[a.id]));

async function cargar() {
  cargando.value = true;
  try {
    lista.value = await api.get(`/planilla/anomalias?empleadoId=${props.empleado.id}`);
    for (const a of lista.value) if (elegidas[a.id] === undefined) elegidas[a.id] = a.estado === 'pendiente';
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudieron cargar las anomalías.');
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

async function agregar() {
  trabajando.value = true;
  try {
    await api.post('/planilla/anomalias', {
      empleadoId: props.empleado.id,
      fecha: nueva.fecha,
      tipo: nueva.tipo,
      detalle: nueva.detalle.trim(),
      ...(nueva.minutos !== '' ? { minutos: Number(nueva.minutos) } : {}),
    });
    Object.assign(nueva, { abierta: false, fecha: '', tipo: 'tardanza', detalle: '', minutos: '' });
    await cargar();
    emit('cambio');
    exito('Anomalía anotada.');
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo anotar.');
  } finally {
    trabajando.value = false;
  }
}

async function cambiarEstado(a, estado) {
  let nota;
  if (estado === 'descartada') {
    nota = window.prompt('¿Por qué se descarta? (queda anotado)');
    if (!nota || nota.trim().length < 3) return;
  }
  trabajando.value = true;
  try {
    await api.patch(`/planilla/anomalias/${a.id}`, { estado, ...(nota ? { nota } : {}) });
    await cargar();
    emit('cambio');
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
  } finally {
    trabajando.value = false;
  }
}

// Los almuerzos que se pasaron de lo establecido: administración decide si se descuenta el exceso (el día queda con esa decisión).
const PUEDE_DESCONTAR = ['almuerzo_regreso_tarde', 'almuerzo_largo'];
async function descontarAlmuerzo(a) {
  if (!(await confirmar(`¿Descontar el exceso del almuerzo del ${formatearFecha(a.fecha)}? Queda como decisión del día y se rebaja en la planilla (con la compensación de la semana).`, { aceptar: 'Sí, descontar' }))) return;
  trabajando.value = true;
  try {
    await api.post(`/planilla/anomalias/${a.id}/descontar-almuerzo`, {});
    exito('Exceso del almuerzo descontado: el día quedó con esa decisión.');
    await cargar();
    emit('cambio');
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo descontar.');
  } finally {
    trabajando.value = false;
  }
}

async function carta() {
  trabajando.value = true;
  try {
    const ids = marcadas.value.filter((a) => a.estado !== 'descartada').map((a) => a.id).join(',');
    await descargarArchivo(`/planilla/anomalias/carta/${props.empleado.id}?ids=${ids}`, `carta-amonestacion-${props.empleado.nombre}.pdf`);
    exito('Borrador de carta generado. Las anomalías incluidas quedaron como «carta emitida».');
    await cargar();
    emit('cambio');
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo generar la carta.');
  } finally {
    trabajando.value = false;
  }
}
</script>

<template>
  <div class="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-sm font-semibold text-slate-800">Anomalías de {{ empleado.nombre }}</p>
        <p class="text-xs text-slate-600">
          Salen solas de la asistencia, pero solo lo que tuvo consecuencia: <strong>ausencias injustificadas</strong> y <strong>llegadas tarde o salidas antes de la hora con rebajo</strong> (si no hubo rebajo, o se compensó o se justificó, no se anota), más los almuerzos fuera de la tolerancia (salir antes de la hora o regresar tarde). Dejan constancia: el pago solo cambia si usted decide descontar el exceso de un almuerzo.
          Marque las que lleve la <strong>carta de amonestación</strong> (es un borrador: revíselo con el asesor legal antes de entregarlo) o descarte las que no correspondan.
        </p>
      </div>
      <button type="button" class="text-sm font-semibold text-slate-500 underline" @click="emit('cerrar')">Cerrar</button>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-if="!cargando && lista.length === 0" class="text-sm text-slate-500">Sin anomalías: en la asistencia registrada no hay llegadas tarde, salidas antes de hora ni ausencias injustificadas.</p>
    <div v-if="!cargando && lista.length" class="flex flex-wrap items-end gap-2 text-xs">
      <div><label class="label">Ver desde</label><input v-model="filtro.desde" type="date" class="input" /></div>
      <div><label class="label">Hasta</label><input v-model="filtro.hasta" type="date" class="input" /></div>
      <button v-if="filtro.desde || filtro.hasta" type="button" class="pb-2 font-semibold text-blue-700 underline" @click="filtro.desde = filtro.hasta = ''">Ver todas</button>
      <p class="pb-2 text-slate-500">{{ visibles.length }} de {{ lista.length }}</p>
    </div>
    <p v-if="!cargando && pendientes.length" class="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-900">
      {{ pendientes.length }} pendiente(s) por decidir: {{ resumenPendientes }}. Puede generar una carta de amonestación con las que marque.
      <button type="button" class="ml-1 font-semibold underline" @click="elegirPendientes">Marcar todas las pendientes</button>
    </p>
    <ul v-if="!cargando && lista.length" class="flex flex-col gap-1.5">
      <li v-for="a in visibles" :key="a.id" class="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
        <input v-model="elegidas[a.id]" type="checkbox" class="mt-1 size-4" :disabled="a.estado === 'descartada'" :aria-label="`Incluir en la carta: ${etiqueta(a.tipo)} ${a.fecha}`" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900">
            {{ formatearFecha(a.fecha) }} · {{ etiqueta(a.tipo) }}
            <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[a.estado].clase">{{ ESTADOS[a.estado].texto }}</span>
            <span v-if="a.origen === 'automatica'" class="ml-1 text-xs font-normal text-slate-500">(detectada de la asistencia)</span>
            <span v-if="a.estado === 'pendiente' && PUEDE_LLEVAR_CARTA.includes(a.tipo)" class="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Puede llevar carta</span>
          </p>
          <p class="text-xs text-slate-600">{{ a.detalle }}</p>
          <p v-if="a.nota" class="text-xs text-slate-500">{{ a.nota }}</p>
        </div>
        <div class="flex gap-2 text-xs font-semibold">
          <button v-if="a.estado === 'pendiente' && PUEDE_DESCONTAR.includes(a.tipo)" type="button" class="text-red-700 underline" :disabled="trabajando" @click="descontarAlmuerzo(a)">Descontar el exceso</button>
          <button v-if="a.estado === 'pendiente'" type="button" class="text-slate-600 underline" :disabled="trabajando" @click="cambiarEstado(a, 'descartada')">Descartar</button>
          <button v-else type="button" class="text-blue-700 underline" :disabled="trabajando" @click="cambiarEstado(a, 'pendiente')">Reabrir</button>
        </div>
      </li>
    </ul>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-primary" :disabled="trabajando || marcadas.length === 0" @click="carta">Generar carta de amonestación ({{ marcadas.length }})</button>
      <button type="button" class="btn-secondary" @click="nueva.abierta = !nueva.abierta">Anotar otra anomalía</button>
    </div>

    <div v-if="nueva.abierta" class="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
      <div><label class="label">Fecha *</label><input v-model="nueva.fecha" type="date" class="input" /></div>
      <div><label class="label">Tipo *</label><select v-model="nueva.tipo" class="input"><option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option></select></div>
      <div><label class="label">Minutos (opcional)</label><input v-model="nueva.minutos" type="number" min="0" class="input" /></div>
      <div class="sm:col-span-4"><label class="label">Qué ocurrió *</label><input v-model="nueva.detalle" class="input" placeholder="Ej. llegó 40 minutos tarde sin avisar" /></div>
      <div class="sm:col-span-4"><button type="button" class="btn-primary" :disabled="trabajando || !nueva.fecha || nueva.detalle.trim().length < 3" @click="agregar">Guardar anomalía</button></div>
    </div>
  </div>
</template>
