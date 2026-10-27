<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { PencilLine, Save } from '@lucide/vue';
import Cargando from '../../../components/Cargando.vue';
import { api, ApiError } from '../../../lib/api.js';
import { exito, fallo } from '../../../lib/avisos.js';
import { formatearFecha } from '../../../lib/format.js';

// Marcas anotadas a mano mientras el reloj de huella no funciona. Solo administrador del sistema y gerencia general.
// Cada día tiene hasta 4 horas: entrada, salida a almuerzo, regreso y salida. Pasan por las mismas reglas que las del reloj.
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLUMNAS = ['Entrada', 'Salida almuerzo', 'Regreso almuerzo', 'Salida'];

const empleados = ref([]);
const existentes = ref([]);
const cargando = ref(true);
const guardando = ref(false);
const error = ref('');
const filtroDepto = ref('');
const busqueda = ref('');
const resultados = ref(null);

const sumar = (iso, d) => {
  const f = new Date(`${iso}T12:00:00`);
  f.setDate(f.getDate() + d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const lunesDe = (iso) => {
  const f = new Date(`${iso}T12:00:00`);
  const dow = f.getDay();
  return sumar(iso, dow === 0 ? -6 : 1 - dow);
};
const hoy = () => {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
// Arranca en la semana pasada: es la que casi siempre falta anotar.
const lunes = ref(lunesDe(sumar(hoy(), -7)));

// Lo escrito: valores[empleadoId][fecha] = { m: ['', '', '', ''], ausente: false }
const valores = reactive({});
const original = reactive({});

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return empleados.value.filter((e) => (!filtroDepto.value || (e.departamento ?? 'Sin departamento') === filtroDepto.value) && (!q || e.nombre.toLowerCase().includes(q)));
});
const departamentos = computed(() => [...new Set(empleados.value.map((e) => e.departamento ?? 'Sin departamento'))].sort());
const fechas = computed(() => DIAS.map((_, i) => sumar(lunes.value, i)));

// «800» → 08:00, «1305» → 13:05, «8:5» → 08:05. Vacío si no se entiende.
function normalizarHora(texto) {
  const t = String(texto ?? '').trim().replace(/[.,;]/g, ':');
  if (!t) return '';
  let h;
  let m;
  if (t.includes(':')) [h, m] = t.split(':');
  else if (t.length <= 2) [h, m] = [t, '0'];
  else [h, m] = [t.slice(0, -2), t.slice(-2)];
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function alSalir(e, fecha, i, ev) {
  const n = normalizarHora(ev.target.value);
  const celda = celdaDe(e.id, fecha);
  celda.m[i] = n ?? '';
  if (n === null) fallo('Esa hora no se entiende. Escriba por ejemplo 8:00 o 1305.');
}

function celdaDe(empleadoId, fecha) {
  valores[empleadoId] ??= {};
  return (valores[empleadoId][fecha] ??= { m: ['', '', '', ''], ausente: false });
}
const esSabado = (i) => i === 5;

async function cargar() {
  cargando.value = true;
  error.value = '';
  resultados.value = null;
  try {
    const hasta = sumar(lunes.value, 5);
    const [lista, dias] = await Promise.all([api.get('/planilla/empleados'), api.get(`/planilla/asistencia/dias?desde=${lunes.value}&hasta=${hasta}`)]);
    // Quienes usan el reloj de la fábrica: activos, que no son de tienda ni de confianza.
    empleados.value = lista.filter((e) => e.activo && !e.fechaCese && !e.esDeTienda && !e.esConfianza && e.marcaReloj !== false);
    existentes.value = dias;
    for (const k of Object.keys(valores)) delete valores[k];
    for (const k of Object.keys(original)) delete original[k];
    for (const d of dias) {
      const c = celdaDe(d.empleadoId, d.fecha);
      c.m = [0, 1, 2, 3].map((i) => d.marcas?.[i] ?? '');
      // Con 2 o 3 marcas se ordenan a su lugar natural: entrada, …, salida.
      if (d.marcas?.length === 2) c.m = [d.marcas[0], '', '', d.marcas[1]];
      if (d.marcas?.length === 3) c.m = [d.marcas[0], d.marcas[1], '', d.marcas[2]];
      c.ausente = d.estado === 'ausencia' && d.marcas.length === 0 && !d.resolucionTipo;
      original[`${d.empleadoId}|${d.fecha}`] = JSON.stringify([c.m, c.ausente]);
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar los datos.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch(lunes, () => {
  if (lunes.value) lunes.value = lunesDe(lunes.value);
  cargar();
});

const diaGuardado = (empleadoId, fecha) => existentes.value.find((d) => d.empleadoId === empleadoId && d.fecha === fecha);
const ESTADOS = {
  ok: ['Correcto', 'text-green-700'],
  ok_faltante: ['Horas no trabajadas', 'text-orange-700'],
  ausencia: ['Ausencia', 'text-red-700'],
  marca_faltante: ['Marca faltante', 'text-amber-700'],
  marcas_ambiguas: ['Marcas ambiguas', 'text-amber-700'],
  feriado: ['Feriado', 'text-blue-700'],
};
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// Solo se manda lo que cambió o se escribió.
function cambios() {
  const dias = [];
  for (const e of empleados.value) {
    for (const f of fechas.value) {
      const c = valores[e.id]?.[f];
      if (!c) continue;
      const marcas = c.m.filter(Boolean);
      if (marcas.length === 0 && !c.ausente) continue;
      if (original[`${e.id}|${f}`] === JSON.stringify([c.m, c.ausente])) continue;
      dias.push({ empleadoId: e.id, fecha: f, marcas, ausente: c.ausente && marcas.length === 0 });
    }
  }
  return dias;
}
const porGuardar = computed(() => {
  // Dependencia reactiva sobre lo escrito.
  JSON.stringify(valores);
  return cambios().length;
});

async function guardar() {
  const dias = cambios();
  if (dias.length === 0) return;
  guardando.value = true;
  error.value = '';
  try {
    const r = await api.post('/planilla/asistencia/marcas-manuales', { dias });
    resultados.value = r;
    exito(`${r.guardados} día(s) guardados${r.omitidos ? `, ${r.omitidos} omitidos` : ''}.`);
    await cargar();
    resultados.value = r;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron guardar las marcas.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <PencilLine class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Marcas a mano</h1>
      </div>
      <button type="button" class="btn-primary" :disabled="guardando || porGuardar === 0" @click="guardar">
        <Save class="size-4" /> {{ guardando ? 'Guardando…' : `Guardar ${porGuardar} día(s)` }}
      </button>
    </div>
    <p class="text-sm text-slate-600">
      Mientras el reloj de huella no funcione, anote aquí las horas de cada día: <strong>entrada, salida a almuerzo, regreso y salida</strong>.
      Escriba la hora como 8:00 o 1305. Pasan por las mismas reglas que las del reloj (tolerancia, almuerzo fijo, marcas que faltan) y quedan
      registradas como anotadas a mano, con quién las anotó. Un día sin horas se ignora, salvo que marque «No vino». No se cambian los días que
      ya tienen una decisión ni los de planillas aprobadas.
    </p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div class="card flex flex-wrap items-end gap-3">
      <div>
        <label class="label">Semana (cualquier día de ella)</label>
        <input v-model="lunes" type="date" class="input" />
      </div>
      <div>
        <label class="label">Departamento</label>
        <select v-model="filtroDepto" class="input"><option value="">Todos</option><option v-for="d in departamentos" :key="d" :value="d">{{ d }}</option></select>
      </div>
      <div class="min-w-48 flex-1">
        <label class="label">Buscar colaborador</label>
        <input v-model="busqueda" type="search" class="input" placeholder="Nombre…" />
      </div>
      <p class="pb-2 text-xs text-slate-500">Semana del {{ formatearFecha(lunes) }} al {{ formatearFecha(sumar(lunes, 5)) }}</p>
    </div>

    <div v-if="resultados?.omitidos" class="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p class="font-semibold">No se guardaron {{ resultados.omitidos }} día(s):</p>
      <ul class="list-inside list-disc">
        <li v-for="x in resultados.resultados.filter((r) => r.resultado === 'omitido')" :key="x.empleadoId + x.fecha">{{ x.nombre }}, {{ formatearFecha(x.fecha) }}: {{ x.motivo }}</li>
      </ul>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <p v-else-if="filtrados.length === 0" class="text-sm text-slate-500">No hay colaboradores con ese filtro.</p>
    <section v-for="e in filtrados" v-else :key="e.id" class="card flex flex-col gap-2">
      <p class="text-base font-semibold text-slate-900">{{ e.nombre }} <span class="text-sm font-normal text-slate-500">· {{ e.departamento ?? 'Sin departamento' }}</span></p>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs font-semibold text-slate-600">
            <tr><th class="px-2 py-1">Día</th><th v-for="c in COLUMNAS" :key="c" class="px-2">{{ c }}</th><th class="px-2">No vino</th><th class="px-2">Resultado</th></tr>
          </thead>
          <tbody>
            <tr v-for="(dia, i) in DIAS" :key="dia" class="border-t border-slate-100">
              <td class="whitespace-nowrap px-2 py-1 font-medium">{{ dia }} {{ formatearFecha(fechas[i]).slice(0, 5) }}</td>
              <td v-for="(c, k) in COLUMNAS" :key="c" class="px-1 py-1">
                <input
                  :value="celdaDe(e.id, fechas[i]).m[k]"
                  type="text"
                  inputmode="numeric"
                  maxlength="5"
                  placeholder="--:--"
                  class="input w-20 text-center"
                  :class="esSabado(i) && (k === 1 || k === 2) ? 'bg-slate-100' : ''"
                  :disabled="celdaDe(e.id, fechas[i]).ausente"
                  :aria-label="`${e.nombre}, ${dia}, ${c}`"
                  @blur="alSalir(e, fechas[i], k, $event)"
                  @change="celdaDe(e.id, fechas[i]).m[k] = $event.target.value"
                />
              </td>
              <td class="px-2"><input v-model="celdaDe(e.id, fechas[i]).ausente" type="checkbox" class="size-4" :aria-label="`${e.nombre} no vino el ${dia}`" /></td>
              <td class="whitespace-nowrap px-2 text-xs">
                <template v-if="diaGuardado(e.id, fechas[i])">
                  <span :class="ESTADOS[diaGuardado(e.id, fechas[i]).estado]?.[1]">{{ ESTADOS[diaGuardado(e.id, fechas[i]).estado]?.[0] }}</span>
                  <template v-if="diaGuardado(e.id, fechas[i]).minutosNetos"> · {{ hhmm(diaGuardado(e.id, fechas[i]).minutosNetos) }} h</template>
                  <span v-if="diaGuardado(e.id, fechas[i]).origen === 'manual'" class="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700">a mano</span>
                  <span v-if="diaGuardado(e.id, fechas[i]).resolucionTipo" class="ml-1 text-slate-500">(decidido)</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
