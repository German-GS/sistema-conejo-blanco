<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError, descargarArchivo } from '../lib/api.js';
import { exito, fallo } from '../lib/avisos.js';
import { formatearFecha } from '../lib/format.js';
import Cargando from './Cargando.vue';

// Anomalías de un empleado (almuerzos fuera de lo normal, tardanzas…). No cambian el pago: dejan constancia para que gerencia decida
// si emite una carta de amonestación. Las de almuerzo salen solas de las marcas; las demás se anotan a mano.
const props = defineProps({ empleado: { type: Object, required: true } });
const emit = defineEmits(['cambio', 'cerrar']);

const TIPOS = [
  { valor: 'almuerzo_corto', etiqueta: 'Almuerzo más corto de lo debido' },
  { valor: 'almuerzo_largo', etiqueta: 'Almuerzo más largo de lo debido' },
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

const lista = ref([]);
const cargando = ref(true);
const trabajando = ref(false);
const elegidas = reactive({});
const nueva = reactive({ abierta: false, fecha: '', tipo: 'tardanza', detalle: '', minutos: '' });

const marcadas = computed(() => lista.value.filter((a) => elegidas[a.id]));

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
        <p class="text-xs text-slate-600">Dejan constancia, no cambian el pago. Elija las que lleve la carta de amonestación (es un borrador: revíselo con el asesor legal antes de entregarlo).</p>
      </div>
      <button type="button" class="text-sm font-semibold text-slate-500 underline" @click="emit('cerrar')">Cerrar</button>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="lista.length === 0" class="text-sm text-slate-500">Sin anomalías registradas.</p>
    <ul v-else class="flex flex-col gap-1.5">
      <li v-for="a in lista" :key="a.id" class="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
        <input v-model="elegidas[a.id]" type="checkbox" class="mt-1 size-4" :disabled="a.estado === 'descartada'" :aria-label="`Incluir en la carta: ${etiqueta(a.tipo)} ${a.fecha}`" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900">
            {{ formatearFecha(a.fecha) }} · {{ etiqueta(a.tipo) }}
            <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[a.estado].clase">{{ ESTADOS[a.estado].texto }}</span>
            <span v-if="a.origen === 'automatica'" class="ml-1 text-xs font-normal text-slate-500">(detectada de las marcas)</span>
          </p>
          <p class="text-xs text-slate-600">{{ a.detalle }}</p>
          <p v-if="a.nota" class="text-xs text-slate-500">{{ a.nota }}</p>
        </div>
        <div class="flex gap-2 text-xs font-semibold">
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
