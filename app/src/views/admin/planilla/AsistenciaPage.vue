<script setup>
import { exito } from '../../../lib/avisos.js';
import { computed, onMounted, reactive, ref } from 'vue';
import { FileSpreadsheet } from '@lucide/vue';
import { useRoute } from 'vue-router';
import HorasTiendaPanel from '../../../components/HorasTiendaPanel.vue';
import { abrirArchivoProtegido, api, ApiError, subirArchivo } from '../../../lib/api.js';
import { formatearFecha, formatearFechaHora } from '../../../lib/format.js';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const ESTADOS = {
  ok: { texto: 'Correcto', clase: 'bg-green-100 text-green-700' },
  ok_faltante: { texto: 'Horas no trabajadas', clase: 'bg-orange-100 text-orange-800' },
  ausencia: { texto: 'Ausencia', clase: 'bg-red-100 text-red-700' },
  marca_faltante: { texto: 'Marca faltante (estimado)', clase: 'bg-amber-100 text-amber-800' },
  marcas_ambiguas: { texto: 'Marcas ambiguas', clase: 'bg-amber-100 text-amber-800' },
  feriado: { texto: 'Feriado', clase: 'bg-blue-100 text-blue-700' },
};
const RESOLUCIONES = {
  horario_estandar: 'Se pagó con el horario estándar',
  hora_manual: 'Se anotó hora manual',
  ausencia_injustificada: 'Ausencia injustificada (se descuenta el día)',
  ausencia_justificada: 'Ausencia justificada (no se descuenta)',
  almuerzo_manual: 'El almuerzo fue de otra duración (ej. media hora)',
  horas_justificadas: 'Horas faltantes justificadas (no se descuentan)',
  horas_injustificadas: 'Horas faltantes injustificadas (se descuentan)',
};

const error = ref('');

// Horas de tienda: se meten a mano. Llega con ?tienda=<id>&desde=<fecha> desde la planilla.
const route = useRoute();
const empleadosTienda = ref([]);
const panelTienda = reactive({ abierto: Boolean(route.query.tienda), empleadoId: String(route.query.tienda ?? ''), desde: String(route.query.desde ?? '') });
async function cargarTienda() {
  try {
    empleadosTienda.value = (await api.get('/planilla/empleados')).filter((e) => e.esDeTienda && e.activo);
  } catch {
    empleadosTienda.value = [];
  }
}
const aviso = ref('');

// ---- 1. Importar el archivo del reloj ----
const archivo = ref(null);
const previa = ref(null);
const mapeo = ref(null);
const trabajando = ref(false);
const resultado = ref(null);

function elegirArchivo(ev) {
  archivo.value = ev.target.files?.[0] ?? null;
  previa.value = null;
  resultado.value = null;
}
// Archivo .xls del reloj: a cada empleado del reloj se le elige el empleado del sistema.
const vinculos = reactive({});
const sinVincular = computed(() => (previa.value?.empleadosReloj ?? []).filter((e) => !vinculos[e.numero]));

async function previsualizar() {
  error.value = '';
  trabajando.value = true;
  try {
    const f = new FormData();
    f.append('archivo', archivo.value);
    previa.value = await subirArchivo('/planilla/asistencia/previsualizar', f);
    if (previa.value.formato === 'tarjeta') {
      for (const k of Object.keys(vinculos)) delete vinculos[k];
      for (const e of previa.value.empleadosReloj) vinculos[e.numero] = e.deTienda ? '' : (e.empleadoId ?? '');
    } else {
      mapeo.value = JSON.parse(JSON.stringify(previa.value.mapeoSugerido));
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo leer el archivo.';
  } finally {
    trabajando.value = false;
  }
}
async function importar() {
  error.value = '';
  trabajando.value = true;
  try {
    const f = new FormData();
    f.append('archivo', archivo.value);
    if (previa.value?.formato === 'tarjeta') {
      // Solo se mandan los vínculos que cambian algo (número distinto al actual).
      const cambios = {};
      for (const e of previa.value.empleadosReloj) {
        const id = vinculos[e.numero];
        const actual = previa.value.empleadosSistema.find((s) => s.id === id);
        if (id && actual?.numeroReloj !== String(Number(e.numero))) cambios[e.numero] = id;
      }
      f.append('vinculos', JSON.stringify(cambios));
    } else {
      f.append('mapeo', JSON.stringify(mapeo.value));
    }
    resultado.value = await subirArchivo('/planilla/asistencia/importar', f);
    previa.value = null;
    // El rango a revisar pasa a ser el del archivo que se acaba de importar.
    filtro.desde = resultado.value.periodoDesde;
    filtro.hasta = resultado.value.periodoHasta;
    filtro.estado = 'revisar';
    await Promise.all([cargarDias(), cargarImportaciones()]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo importar el archivo.';
  } finally {
    trabajando.value = false;
  }
}
const colMarcas = computed({
  get: () => (mapeo.value?.horas ?? []).join(','),
  set: (v) => (mapeo.value.horas = v.split(',').map((x) => Number(x)).filter((x) => x > 0)),
});
const numCol = (campo) => ({
  get: () => mapeo.value[campo] ?? 0,
  set: (v) => (mapeo.value[campo] = Number(v) > 0 ? Number(v) : null),
});

// ---- 2. Revisar y resolver días ----
const dias = ref([]);
const filtro = reactive({ estado: 'revisar', desde: '', hasta: '' });
const importaciones = ref([]);

async function cargarDias() {
  const q = new URLSearchParams();
  if (filtro.estado) q.set('estado', filtro.estado);
  if (filtro.desde) q.set('desde', filtro.desde);
  if (filtro.hasta) q.set('hasta', filtro.hasta);
  dias.value = await api.get(`/planilla/asistencia/dias?${q}`);
  cargarResumen();
}

// Cuánto trabajó cada empleado en el rango contra lo que le toca.
const resumen = ref({});
async function cargarResumen() {
  if (!filtro.desde || !filtro.hasta) return;
  try {
    const filas = await api.get(`/planilla/asistencia/resumen?desde=${filtro.desde}&hasta=${filtro.hasta}`);
    resumen.value = Object.fromEntries(filas.map((r) => [r.empleadoId, r]));
  } catch {
    resumen.value = {};
  }
}
async function cargarImportaciones() {
  importaciones.value = await api.get('/planilla/asistencia/importaciones');
}
onMounted(async () => {
  cargarTienda();
  try {
    await cargarImportaciones();
    // Arranca en el período de la última importación del reloj.
    const ultima = importaciones.value[0];
    if (ultima) {
      filtro.desde = ultima.periodoDesde;
      filtro.hasta = ultima.periodoHasta;
    }
    await cargarDias();
  } catch (e) {
    error.value = e.message;
  }
});

// Comprobante (foto o PDF) de una justificación: se sube primero y la decisión
// guarda el nombre que devuelve el servidor.
async function subirComprobante(archivo) {
  const f = new FormData();
  f.append('archivo', archivo);
  return (await subirArchivo('/planilla/asistencia/justificantes', f)).archivo;
}
const elegirComprobante = (ev, destino) => (destino.archivo = ev.target.files?.[0] ?? null);
const verComprobante = (nombre) =>
  abrirArchivoProtegido(`/planilla/asistencia/justificantes/${nombre}`).catch((err) => (error.value = err instanceof ApiError ? err.message : 'No se pudo abrir el comprobante.'));
const esJustificacion = (tipo) => ['ausencia_justificada', 'horas_justificadas', 'almuerzo_manual'].includes(tipo);

// Faltas chicas: no se pide justificar, solo si completó el día.
const MINUTOS_PREGUNTA_RAPIDA = 25;
const esFaltaChica = (d) => tieneFaltante(d) && !d.resolucionTipo && d.minutosFaltantes <= MINUTOS_PREGUNTA_RAPIDA;
async function completoElDia(d, completo) {
  error.value = '';
  aviso.value = '';
  try {
    await api.post(`/planilla/asistencia/dias/${d.id}/resolver`, {
      tipo: completo ? 'horas_justificadas' : 'horas_injustificadas',
      motivo: completo ? 'Completó el día (confirmado al revisar)' : 'No completó el día (se descuentan los minutos)',
    });
    await cargarDias();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  }
}

// «Guardar revisión»: cada decisión ya se guarda al instante; este botón
// vuelve a leer todo del servidor para confirmar qué quedó y qué falta.
const revision = reactive({ trabajando: false, resultado: null });
async function guardarRevision() {
  revision.trabajando = true;
  error.value = '';
  try {
    await cargarDias();
    const todos = await api.get(`/planilla/asistencia/dias?desde=${filtro.desde}&hasta=${filtro.hasta}`);
    const sinResolver = todos.filter((d) => PROBLEMAS.includes(d.estado) && !d.resolucionTipo);
    const resueltos = todos.filter((d) => d.resolucionTipo);
    revision.resultado = {
      hora: new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      dias: todos.length,
      resueltos: resueltos.length,
      sinResolver: sinResolver.length,
      empleados: [...new Set(sinResolver.map((d) => d.empleado.nombre))],
    };
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo confirmar la revisión.';
  } finally {
    revision.trabajando = false;
  }
}

const abierto = ref(null);
const decision = reactive({ tipo: 'horario_estandar', justificarHoras: false, archivo: null, motivo: '', entrada: '', salida: '', almuerzoMinutos: 60, supervisor: '' });
const historial = ref([]);

async function abrir(d) {
  abierto.value = d.id;
  error.value = '';
  // Con una marca estimada se propone «hora manual» con la marca real y la hora del horario.
  const est = d.estimacion;
  const real = d.marcas ?? [];
  Object.assign(decision, {
    tipo: d.estado === 'ausencia' ? 'ausencia_justificada' : est ? 'hora_manual' : sePuedeAjustarAlmuerzo(d) ? 'almuerzo_manual' : tieneFaltante(d) ? 'horas_justificadas' : 'horario_estandar',
    justificarHoras: false,
    archivo: null,
    motivo: '',
    entrada: est ? (est.faltante === 'entrada' ? est.hora : (real[0] ?? '')) : '',
    salida: est ? (est.faltante === 'salida' ? est.hora : (real[real.length - 1] ?? '')) : '',
    almuerzoMinutos: sePuedeAjustarAlmuerzo(d) ? 30 : 60,
    supervisor: '',
  });
  historial.value = await api.get(`/planilla/asistencia/dias/${d.id}/resoluciones`);
}
async function resolver(d) {
  error.value = '';
  aviso.value = '';
  try {
    const cuerpo = { tipo: decision.tipo, motivo: decision.motivo.trim() };
    if (decision.archivo) cuerpo.justificante = await subirComprobante(decision.archivo);
    if (decision.tipo === 'almuerzo_manual') {
      cuerpo.almuerzoMinutos = Number(decision.almuerzoMinutos);
    }
    if (decision.tipo === 'hora_manual' || decision.tipo === 'horario_estandar') {
      if (decision.supervisor.trim()) cuerpo.supervisor = decision.supervisor.trim();
    }
    if (decision.tipo === 'hora_manual') {
      cuerpo.entrada = decision.entrada;
      cuerpo.salida = decision.salida;
      cuerpo.almuerzoMinutos = Number(decision.almuerzoMinutos);
      cuerpo.justificarHoras = decision.justificarHoras;
    }
    await api.post(`/planilla/asistencia/dias/${d.id}/resolver`, cuerpo);
    exito(`${d.empleado.nombre}, ${formatearFecha(d.fecha)}: decisión guardada.`);
    abierto.value = null;
    await cargarDias();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.';
  }
}
const tieneFaltante = (d) => d.estado === 'ok' && d.minutosFaltantes > 0;
const estadoVisual = (d) => (tieneFaltante(d) && d.minutosDescontar > 0 ? 'ok_faltante' : d.estado);
// El almuerzo solo se puede ajustar en días con entrada y salida (sin marcas de almuerzo).
const sePuedeAjustarAlmuerzo = (d) => d.estado === 'ok' && d.marcas.length === 2;
const opciones = (d) => {
  const almuerzo = sePuedeAjustarAlmuerzo(d) ? ['almuerzo_manual'] : [];
  if (tieneFaltante(d)) return [...almuerzo, 'horas_justificadas', 'horas_injustificadas', 'hora_manual'];
  if (d.estado === 'ausencia') return ['ausencia_justificada', 'ausencia_injustificada', 'hora_manual', 'horario_estandar'];
  if (d.estado === 'ok') return [...almuerzo, 'hora_manual', 'ausencia_injustificada', 'ausencia_justificada'];
  return ['horario_estandar', 'hora_manual', 'ausencia_injustificada', 'ausencia_justificada'];
};
// Los días por revisar se muestran agrupados por empleado.
const PROBLEMAS = ['ausencia', 'marca_faltante', 'marcas_ambiguas'];
// Particularidades del empleado que cambian cómo se leen sus marcas.
function configuracionDe(e) {
  const c = [];
  if (e.esConfianza) c.push('puesto de confianza (sin jornada fija)');
  if (e.horasSemana && Number(e.horasSemana) !== 48) c.push(`${Number(e.horasSemana)} h/semana`);
  if (e.almuerzoMarca === false) c.push(e.almuerzoMinutos === 0 ? 'no marca almuerzo (no se descuenta)' : `no marca almuerzo (${e.almuerzoMinutos ?? 60} min fijos)`);
  else if (e.almuerzoMinutos != null && e.almuerzoMinutos !== 60) c.push(`almuerzo ${e.almuerzoMinutos} min`);
  return c;
}
const grupos = computed(() => {
  const m = new Map();
  for (const d of dias.value) {
    if (!m.has(d.empleadoId)) m.set(d.empleadoId, { id: d.empleadoId, nombre: d.empleado.nombre, configuracion: configuracionDe(d.empleado), dias: [] });
    m.get(d.empleadoId).dias.push(d);
  }
  return [...m.values()].map((g) => ({ ...g, pendientes: g.dias.filter((d) => PROBLEMAS.includes(d.estado) && !d.resolucionTipo),
    conFaltantes: g.dias.filter((d) => d.estado === 'ok' && d.minutosDescontar > 0 && !d.resolucionTipo).length,
  }));
});

// Resolver de una vez todos los días pendientes de un empleado.
const masivo = reactive({ abierto: null, tipo: 'ausencia_justificada', motivo: '', archivo: null, trabajando: false, supervisor: '' });
function abrirMasivo(g) {
  Object.assign(masivo, { abierto: g.id, tipo: g.pendientes.every((d) => d.estado === 'ausencia') ? 'ausencia_justificada' : 'horario_estandar', motivo: '', archivo: null, supervisor: '' });
}
async function resolverMasivo(g) {
  error.value = '';
  aviso.value = '';
  masivo.trabajando = true;
  let hechos = 0;
  try {
    // El mismo comprobante (ej. una incapacidad) sirve para todos los días.
    const justificante = masivo.archivo ? await subirComprobante(masivo.archivo) : undefined;
    for (const d of g.pendientes) {
      await api.post(`/planilla/asistencia/dias/${d.id}/resolver`, { tipo: masivo.tipo, motivo: masivo.motivo.trim(), justificante, supervisor: masivo.tipo === 'horario_estandar' && masivo.supervisor.trim() ? masivo.supervisor.trim() : undefined });
      hechos++;
    }
    exito(`${g.nombre}: ${hechos} día(s) resueltos.`);
    masivo.abierto = null;
  } catch (err) {
    error.value = `${g.nombre}: se resolvieron ${hechos} de ${g.pendientes.length}. ` + (err instanceof ApiError ? err.message : 'No se pudo guardar.');
  } finally {
    masivo.trabajando = false;
    await cargarDias();
  }
}
// ---- 4. Bitácora de correcciones ----
const bitacora = reactive({ abierta: false, cargando: false, filas: [], desde: '', hasta: '' });
async function cargarBitacora() {
  bitacora.cargando = true;
  try {
    const q = new URLSearchParams();
    if (bitacora.desde) q.set('desde', bitacora.desde);
    if (bitacora.hasta) q.set('hasta', bitacora.hasta);
    bitacora.filas = await api.get(`/planilla/asistencia/bitacora?${q}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la bitácora.';
  } finally {
    bitacora.cargando = false;
  }
}
function alternarBitacora() {
  bitacora.abierta = !bitacora.abierta;
  if (bitacora.abierta) {
    bitacora.desde ||= filtro.desde;
    bitacora.hasta ||= filtro.hasta;
    cargarBitacora();
  }
}
const resumenAntes = (f) => {
  const a = f.detalle?.antes;
  if (!a) return 'Sin registro previo';
  const marcas = a.marcas ?? f.marcas;
  return `${marcas?.length ? marcas.join(' · ') : 'sin marcas'} → ${a.estado ?? ''}${a.estimacion ? ` (estimado ${a.estimacion.hora})` : ''}`;
};
const resumenDespues = (f) => {
  const d = f.detalle?.despues;
  if (!d) return '';
  const partes = [`${hhmm(d.minutosNetos ?? 0)} h`];
  if (d.minutosDescontar) partes.push(`rebajo ${hhmm(d.minutosDescontar)} h`);
  if (d.descuenta) partes.push('día descontado');
  if (d.verificado === false) partes.push('sin verificar');
  return partes.join(' · ');
};
const nombreDia = (f) => DIAS[new Date(`${f}T12:00:00`).getDay()];
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Asistencia (reloj de huella)</h1>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm font-medium text-teal-700">{{ aviso }}</p>

    <div class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">1. Importar el Excel del reloj</p>
      <p class="text-sm text-slate-500">
        Suba el archivo que exporta el reloj (la «Tarjeta de Tiempo» en .xls, o un .xlsx). El sistema revisa las marcas
        de cada empleado y, después de importar, le pide qué hacer con los días que no se pueden pagar solos (ausencias,
        marcas que faltan). Volver a importar el mismo período no pisa los días que ya resolviste.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <label
          class="flex min-w-72 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors"
          :class="archivo ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'"
        >
          <FileSpreadsheet class="size-8 shrink-0" :class="archivo ? 'text-blue-600' : 'text-slate-500'" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-slate-800">{{ archivo ? archivo.name : 'Elegir el archivo del reloj' }}</span>
            <span class="block text-xs text-slate-500">{{ archivo ? 'Haga clic para cambiar de archivo' : 'Excel .xls o .xlsx · la Tarjeta de Tiempo del reloj de huella' }}</span>
          </span>
          <input type="file" accept=".xls,.xlsx" class="hidden" @change="elegirArchivo" />
        </label>
        <button v-if="archivo && !previa" type="button" class="btn-primary" :disabled="trabajando" @click="previsualizar">
          {{ trabajando ? 'Leyendo…' : 'Leer archivo' }}
        </button>
      </div>

      <div v-if="previa?.formato === 'tarjeta'" class="flex flex-col gap-3">
        <p class="text-sm text-slate-600">
          Tarjeta de Tiempo del {{ formatearFecha(previa.periodoDesde) }} al {{ formatearFecha(previa.periodoHasta) }}:
          {{ previa.empleadosReloj.length }} empleados y {{ previa.marcas }} marcas. Confirme quién es quién:
        </p>
        <div class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr><th class="px-3 py-2">N.º reloj</th><th class="px-3">Nombre en el reloj</th><th class="px-3">Marcas</th><th class="px-3">Empleado en el sistema</th></tr>
            </thead>
            <tbody>
              <tr v-for="e in previa.empleadosReloj" :key="e.numero" class="border-t border-slate-100">
                <td class="px-3 py-1.5 tabular-nums">{{ e.numero }}</td>
                <td class="px-3">{{ e.nombre }}</td>
                <td class="px-3 text-xs text-slate-500">{{ e.marcas }} marcas<template v-if="e.ausencias"> · {{ e.ausencias }} día(s) sin marcas</template></td>
                <td class="px-3 py-1">
                  <p v-if="e.deTienda" class="text-xs font-semibold text-emerald-700">De tienda: no se importa (sus horas se meten a mano)</p>
                  <select v-else v-model="vinculos[e.numero]" class="input">
                    <option value="">No importar (no está en el sistema)</option>
                    <option v-for="s in previa.empleadosSistema" :key="s.id" :value="s.id">{{ s.nombre }} (reloj {{ s.numeroReloj }})</option>
                  </select>
                  <p v-if="e.sugerido && vinculos[e.numero] === e.empleadoId" class="mt-0.5 text-xs text-amber-700">Sugerido por el nombre: confirmalo.</p>
                  <p v-else-if="e.nombreDistinto && vinculos[e.numero] === e.empleadoId" class="mt-0.5 text-xs text-amber-700">El número coincide, pero el nombre no se parece: verifique que sea la misma persona.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="sinVincular.length" class="text-xs text-slate-500">
          Sin vincular ({{ sinVincular.length }}): no se importan. Si alguno debe cobrar, créelo primero en Planilla → Empleados.
        </p>
        <p class="text-xs text-slate-500">Al importar, el número del reloj de cada empleado vinculado queda guardado en el sistema para las próximas semanas.</p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="previa = null">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="trabajando || sinVincular.length === previa.empleadosReloj.length" @click="importar">
            {{ trabajando ? 'Importando…' : 'Importar marcas' }}
          </button>
        </div>
      </div>

      <div v-else-if="previa" class="flex flex-col gap-3">
        <p class="text-sm text-slate-600">Hoja «{{ previa.hoja }}», {{ previa.totalFilas }} filas. Así se ven las primeras:</p>
        <div class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50">
              <tr><th v-for="c in previa.columnas" :key="c.indice" class="px-2 py-1 text-left font-semibold">{{ c.indice }}. {{ c.encabezado }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(fila, i) in previa.muestra" :key="i" class="border-t border-slate-100">
                <td v-for="(celda, j) in fila" :key="j" class="px-2 py-1">{{ celda }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">Formato del archivo</label>
            <select v-model="mapeo.diseno" class="input">
              <option value="por_dia">Una fila por día (Entrada / Comida / Salida)</option>
              <option value="registro">Una fila por marca (fecha y hora)</option>
            </select>
          </div>
          <div><label class="label">Fila de encabezados</label><input v-model.number="mapeo.filaEncabezado" type="number" min="1" class="input" /></div>
          <div><label class="label">Columna del N.º de empleado</label><input :value="mapeo.numero" type="number" min="1" class="input" @input="mapeo.numero = Number($event.target.value)" /></div>
          <div><label class="label">Columna del nombre (opcional)</label><input :value="numCol('nombre').get()" type="number" min="0" class="input" @input="numCol('nombre').set($event.target.value)" /></div>
          <template v-if="mapeo.diseno === 'por_dia'">
            <div><label class="label">Columna de la fecha</label><input :value="numCol('fecha').get()" type="number" min="0" class="input" @input="numCol('fecha').set($event.target.value)" /></div>
            <div><label class="label">Columnas de marcas (separadas por coma)</label><input v-model="colMarcas" class="input" placeholder="4,5,6" /></div>
          </template>
          <template v-else>
            <div><label class="label">Columna de fecha (y hora)</label><input :value="numCol('fechaHora').get()" type="number" min="0" class="input" @input="numCol('fechaHora').set($event.target.value)" /></div>
            <div><label class="label">Columna de hora (si va aparte)</label><input :value="numCol('hora').get()" type="number" min="0" class="input" @input="numCol('hora').set($event.target.value)" /></div>
          </template>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="previa = null">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="trabajando" @click="importar">
            {{ trabajando ? 'Importando…' : 'Importar marcas' }}
          </button>
        </div>
      </div>

      <div v-if="resultado" class="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-slate-700">
        <p class="font-semibold text-teal-800">Importación lista: {{ resultado.periodoDesde }} al {{ resultado.periodoHasta }}</p>
        <p>
          {{ resultado.resumen.empleados }} empleados · {{ resultado.resumen.dias }} días procesados ·
          {{ resultado.resumen.correctos }} correctos · {{ resultado.resumen.ausencias }} ausencias ·
          {{ resultado.resumen.pendientes }} por resolver · {{ resultado.resumen.feriados }} feriados ·
          {{ resultado.resumen.yaResueltos }} ya resueltos antes.
        </p>
        <p v-if="resultado.resumen.desconocidos?.length" class="mt-1 text-amber-800">
          En el archivo hay números sin empleado registrado (no se importaron):
          {{ resultado.resumen.desconocidos.map((d) => `${d.numero}${d.nombre ? ' ' + d.nombre : ''}`).join(', ') }}.
          Créelos en Empleados con ese número de reloj y vuelva a importar.
        </p>
        <p v-if="resultado.resumen.omitidosTienda?.length" class="mt-1 text-emerald-800">
          Personal de tienda omitido (sus horas se meten a mano): {{ resultado.resumen.omitidosTienda.join(', ') }}.
        </p>
        <p v-if="resultado.resumen.activosSinArchivo?.length" class="mt-1 text-amber-800">
          Empleados activos que no aparecen en el archivo:
          {{ resultado.resumen.activosSinArchivo.map((d) => d.nombre).join(', ') }}.
        </p>
      </div>
    </div>

    <div class="card flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-base font-semibold text-slate-900">Horas de tienda <span class="text-sm font-normal text-slate-500">(se meten a mano)</span></p>
          <p class="text-sm text-slate-500">El personal de tienda no marca en este reloj: acá se anotan sus horas por día. El archivo del reloj los omite.</p>
        </div>
        <button type="button" class="btn-secondary" @click="panelTienda.abierto = !panelTienda.abierto">{{ panelTienda.abierto ? 'Cerrar' : 'Meter horas de tienda' }}</button>
      </div>
      <HorasTiendaPanel
        v-if="panelTienda.abierto"
        :empleados="empleadosTienda"
        :empleado-id-inicial="panelTienda.empleadoId"
        :desde-inicial="panelTienda.desde || filtro.desde"
        @guardado="cargarDias"
      />
    </div>

    <div class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">2. Revisar días</p>
      <p class="text-sm text-slate-500">
        Las ausencias descuentan el día completo, salvo que las justifiques (anotando la razón). Los días con marcas
        faltantes o ambiguas hay que resolverlos antes de aprobar la planilla.
      </p>
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="label">Mostrar</label>
          <select v-model="filtro.estado" class="input" @change="cargarDias">
            <option value="revisar">Por revisar (ausencias y marcas con problema)</option>
            <option value="">Todos</option>
            <option value="almuerzo">Con almuerzo estimado (solo entrada y salida)</option>
            <option value="ok">Correctos</option>
          </select>
        </div>
        <div><label class="label">Desde</label><input v-model="filtro.desde" type="date" class="input" @change="cargarDias" /></div>
        <div><label class="label">Hasta</label><input v-model="filtro.hasta" type="date" class="input" @change="cargarDias" /></div>
      </div>

      <p v-if="dias.length === 0" class="text-sm text-slate-500">No hay días para mostrar con ese filtro.</p>
      <section v-for="g in grupos" :key="g.id" class="flex flex-col gap-2 rounded-xl border border-slate-300 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-base font-bold text-slate-900">
            {{ g.nombre }}
            <span v-if="g.pendientes.length" class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{{ g.pendientes.length }} por resolver</span>
            <span v-else-if="g.conFaltantes" class="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{{ g.conFaltantes }} con horas faltantes</span>
            <span v-else class="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Al día</span>
            <span v-for="c in g.configuracion" :key="c" class="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{{ c }}</span>
            <router-link :to="{ name: 'planilla-empleados' }" class="ml-2 text-xs font-semibold text-slate-500 underline">cambiar su jornada o almuerzo</router-link>
          </p>
          <p v-if="resumen[g.id]?.esConfianza" class="w-full text-xs text-violet-700">
            Puesto de confianza: sus marcas son informativas (trabajó {{ hhmm(resumen[g.id].trabajadoMin) }} h en el período); no hay horas extra ni descuento por horas faltantes.
          </p>
          <p v-else-if="resumen[g.id]" class="w-full text-xs" :class="resumen[g.id].trabajadoMin >= resumen[g.id].esperadoMin ? 'text-teal-700' : 'text-amber-800'">
            En el período trabajó <strong>{{ hhmm(resumen[g.id].trabajadoMin) }} h</strong> de {{ hhmm(resumen[g.id].esperadoMin) }} h de su jornada habitual
            ({{ resumen[g.id].horasSemanaOrdinarias }} h ordinarias pagadas por semana) ·
            {{ resumen[g.id].diasTrabajados }} día(s) con trabajo<template v-if="resumen[g.id].diasSinMarcas"> · {{ resumen[g.id].diasSinMarcas }} sin marcas</template>
            <template v-if="resumen[g.id].trabajadoMin < resumen[g.id].esperadoMin"> · le faltan {{ hhmm(resumen[g.id].esperadoMin - resumen[g.id].trabajadoMin) }} h</template>
          </p>
          <button v-if="g.pendientes.length > 1" type="button" class="text-sm font-semibold text-blue-700 underline" @click="masivo.abierto === g.id ? (masivo.abierto = null) : abrirMasivo(g)">
            Resolver los {{ g.pendientes.length }} días juntos
          </button>
        </div>
        <div v-if="masivo.abierto === g.id" class="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
          <p class="text-xs text-slate-600">La misma decisión se aplica a: {{ g.pendientes.map((d) => `${nombreDia(d.fecha)} ${formatearFecha(d.fecha).slice(0, 5)}`).join(', ') }}.</p>
          <div class="flex flex-col gap-1">
            <label v-for="t in ['ausencia_justificada', 'ausencia_injustificada', 'horario_estandar']" :key="t" class="flex items-center gap-2 text-sm text-slate-700">
              <input v-model="masivo.tipo" type="radio" :value="t" class="size-4" /> {{ RESOLUCIONES[t] }}
            </label>
          </div>
          <div><label class="label">Motivo *</label><input v-model="masivo.motivo" class="input" placeholder="Ej. vacaciones, incapacidad con comprobante…" /></div>
          <div v-if="masivo.tipo === 'horario_estandar'">
            <label class="label">Supervisor que confirma (opcional)</label>
            <input v-model="masivo.supervisor" class="input" placeholder="Nombre de quien confirma que cumplió el horario" />
            <p class="mt-1 text-xs text-slate-500">Se paga el horario completo en ambos casos. El supervisor solo deja constancia de que las horas son verificadas.</p>
          </div>
          <div v-if="masivo.tipo === 'ausencia_justificada'">
            <label class="label">Comprobante (opcional): foto o PDF, se adjunta a todos los días</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="text-sm" @change="elegirComprobante($event, masivo)" />
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" @click="masivo.abierto = null">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="masivo.trabajando || masivo.motivo.trim().length < 3" @click="resolverMasivo(g)">{{ masivo.trabajando ? 'Guardando…' : 'Aplicar a todos' }}</button>
          </div>
        </div>
      <ul class="flex flex-col gap-2">
        <li v-for="d in g.dias" :key="d.id" class="rounded-xl border border-slate-200 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-slate-900">
                {{ nombreDia(d.fecha) }} {{ formatearFecha(d.fecha) }}
                <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[estadoVisual(d)].clase">{{ ESTADOS[estadoVisual(d)].texto }}</span>
              </p>
              <p class="text-xs text-slate-500">
                Marcas: {{ d.marcas.length ? d.marcas.join(' · ') : 'ninguna' }}
                <template v-if="d.estado === 'ok'"> · trabajó {{ hhmm(d.minutosNetos) }}<template v-if="d.minutosExtra"> (+{{ hhmm(d.minutosExtra) }} extra)</template><template v-if="d.almuerzoEstimado"> · almuerzo estimado</template></template>
                <template v-if="tieneFaltante(d)"> · <strong class="text-orange-800">no trabajadas {{ hhmm(d.minutosFaltantes) }} h<template v-if="d.minutosDescontar === 0"> ({{ !d.verificado ? 'sin verificar' : d.resolucionTipo ? 'justificadas' : 'dentro de la tolerancia' }})</template><template v-else> (se descuentan)</template></strong></template>
              </p>
              <p v-if="d.motivoRevision" class="text-xs text-amber-800">{{ d.motivoRevision }}</p>
              <p v-if="d.estimacion" class="text-xs text-amber-800">
                Sin confirmar: se estimó {{ d.estimacion.faltante === 'entrada' ? 'la entrada' : 'la salida' }} a las {{ d.estimacion.hora }}
                (≈ {{ hhmm(d.minutosNetos) }} h). No se rebaja ni se pagan extras hasta que se resuelva; es una marca faltante del reloj, no horas no trabajadas.
              </p>
              <p v-else-if="d.estado === 'ok' && !d.verificado && d.minutosFaltantes > 0" class="text-xs text-amber-800">
                Horas sin verificar (no vienen del reloj): no se rebaja nada. Para rebajar, el supervisor debe confirmar las horas.
              </p>
              <p v-if="d.supervisor" class="text-xs text-teal-700">Confirmado por el supervisor: {{ d.supervisor }}</p>
              <p v-if="d.resolucionTipo" class="text-xs text-slate-600">
                {{ RESOLUCIONES[d.resolucionTipo] }} — «{{ d.resolucionMotivo }}»
                <button v-if="d.justificante" type="button" class="ml-1 font-semibold text-blue-700 underline" @click="verComprobante(d.justificante)">Ver comprobante</button>
              </p>
              <div v-if="esFaltaChica(d)" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span class="font-semibold text-slate-700">¿Completó el día?</span>
                <button type="button" class="rounded-md border border-teal-300 bg-teal-50 px-3 py-1 font-semibold text-teal-800" @click="completoElDia(d, true)">Sí (no se descuenta)</button>
                <button type="button" class="rounded-md border border-red-300 bg-red-50 px-3 py-1 font-semibold text-red-800" @click="completoElDia(d, false)">No (descontar {{ hhmm(d.minutosFaltantes) }} h)</button>
              </div>
            </div>
            <button type="button" class="text-sm font-semibold text-blue-700 underline" @click="abierto === d.id ? (abierto = null) : abrir(d)">
              {{ d.resolucionTipo ? 'Cambiar decisión' : 'Resolver' }}
            </button>
          </div>

          <div v-if="abierto === d.id" class="mt-3 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
            <div class="flex flex-col gap-1">
              <label v-for="t in opciones(d)" :key="t" class="flex items-center gap-2 text-sm text-slate-700">
                <input v-model="decision.tipo" type="radio" :value="t" class="size-4" /> {{ RESOLUCIONES[t] }}
              </label>
            </div>
            <div v-if="decision.tipo === 'almuerzo_manual'" class="flex flex-wrap items-end gap-3">
              <div>
                <label class="label">Minutos de almuerzo</label>
                <div class="flex items-center gap-1">
                  <button v-for="m in [0, 30, 45, 60]" :key="m" type="button" class="rounded-md border px-2.5 py-1.5 text-sm font-semibold" :class="Number(decision.almuerzoMinutos) === m ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'" @click="decision.almuerzoMinutos = m">{{ m }}</button>
                  <input v-model="decision.almuerzoMinutos" type="number" min="0" max="240" class="input w-24" />
                </div>
              </div>
              <p class="max-w-md text-xs text-slate-500">Se descuenta ese almuerzo de las horas del día (el reloj solo marcó entrada y salida). 0 = no se descuenta almuerzo.</p>
            </div>
            <div v-if="decision.tipo === 'hora_manual'" class="grid grid-cols-3 gap-2">
              <div><label class="label">Entrada</label><input v-model="decision.entrada" type="time" class="input" /></div>
              <div><label class="label">Salida</label><input v-model="decision.salida" type="time" class="input" /></div>
              <div><label class="label">Almuerzo (min)</label><input v-model="decision.almuerzoMinutos" type="number" min="0" class="input" /></div>
              <label class="col-span-3 flex items-center gap-2 text-sm text-slate-700">
                <input v-model="decision.justificarHoras" type="checkbox" class="size-4" /> Si faltan horas para completar la jornada, no descontarlas (justificadas)
              </label>
            </div>
            <div v-if="decision.tipo === 'hora_manual' || decision.tipo === 'horario_estandar'">
              <label class="label">Supervisor que confirma las horas (opcional)</label>
              <input v-model="decision.supervisor" class="input" placeholder="Nombre de quien vio al empleado trabajar esas horas" />
              <p class="mt-1 text-xs text-slate-500">
                Estas horas no vienen del reloj. Se pagan, pero solo se rebajan las horas faltantes si un supervisor las confirma; sin supervisor no se descuenta nada.
              </p>
            </div>
            <div>
              <label class="label">{{ decision.tipo === 'ausencia_justificada' ? 'Razón de la justificación *' : 'Motivo de la decisión *' }}</label>
              <input v-model="decision.motivo" class="input" :placeholder="decision.tipo === 'ausencia_justificada' ? 'Ej. cita médica con comprobante' : 'Ej. el reloj no tomó la salida'" />
            </div>
            <div v-if="esJustificacion(decision.tipo)">
              <label class="label">Comprobante (opcional): foto o PDF</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="text-sm" @change="elegirComprobante($event, decision)" />
              <p class="mt-1 text-xs text-slate-500">Foto de la incapacidad, cita médica u otro documento. Solo lo ve Administración. Se aceptan JPG, PNG, WEBP o PDF (si la foto es HEIC del iPhone, mandala como JPG).</p>
            </div>
            <div v-if="historial.length" class="text-xs text-slate-500">
              Decisiones anteriores:
              <span v-for="h in historial" :key="h.id" class="block">{{ formatearFechaHora(h.creadoEn) }} — {{ RESOLUCIONES[h.tipo] }}: «{{ h.motivo }}»<template v-if="h.supervisor"> · supervisor: {{ h.supervisor }}</template></span>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary" @click="abierto = null">Cancelar</button>
              <button type="button" class="btn-primary" :disabled="decision.motivo.trim().length < 3" @click="resolver(d)">Guardar decisión</button>
            </div>
          </div>
        </li>
      </ul>
      </section>
    </div>

    <div class="card flex flex-col gap-3">
      <div>
        <p class="text-base font-semibold text-slate-900">3. Guardar la revisión</p>
        <p class="text-sm text-slate-500">
          Cada decisión se guarda en el momento en que la toma. Este botón lo confirma: vuelve a leer todo del servidor
          y le dice cuántos días quedaron resueltos y si falta alguno antes de calcular la planilla.
        </p>
      </div>
      <button type="button" class="btn-primary w-fit" :disabled="revision.trabajando || !filtro.desde" @click="guardarRevision">
        {{ revision.trabajando ? 'Confirmando…' : 'Guardar revisión' }}
      </button>
      <div v-if="revision.resultado" class="rounded-xl border p-3 text-sm" :class="revision.resultado.sinResolver ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-teal-300 bg-teal-50 text-teal-900'">
        <p class="font-semibold">
          {{ revision.resultado.sinResolver ? 'Revisión guardada, pero faltan días por resolver' : 'Revisión guardada' }} ({{ revision.resultado.hora }})
        </p>
        <p>
          {{ revision.resultado.dias }} días en el período · {{ revision.resultado.resueltos }} con decisión tuya ·
          {{ revision.resultado.sinResolver }} sin resolver<template v-if="revision.resultado.empleados.length">: {{ revision.resultado.empleados.join(', ') }}</template>.
        </p>
        <router-link v-if="!revision.resultado.sinResolver" :to="{ name: 'planilla-planillas' }" class="mt-1 inline-block font-semibold underline">Seguir a Planillas →</router-link>
      </div>
    </div>

    <div class="card flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-base font-semibold text-slate-900">4. Bitácora de correcciones</p>
          <p class="text-sm text-slate-500">Quién cambió cada día, cuándo, por qué y cómo estaba antes. No se puede editar ni borrar.</p>
        </div>
        <button type="button" class="btn-secondary" @click="alternarBitacora">{{ bitacora.abierta ? 'Cerrar' : 'Ver bitácora' }}</button>
      </div>
      <template v-if="bitacora.abierta">
        <div class="flex flex-wrap items-end gap-2">
          <div><label class="label">Desde</label><input v-model="bitacora.desde" type="date" class="input" @change="cargarBitacora" /></div>
          <div><label class="label">Hasta</label><input v-model="bitacora.hasta" type="date" class="input" @change="cargarBitacora" /></div>
        </div>
        <p v-if="bitacora.cargando" class="text-sm text-slate-500">Cargando…</p>
        <p v-else-if="!bitacora.filas.length" class="text-sm text-slate-500">No hay correcciones en ese período.</p>
        <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="tabla-fija min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr><th class="px-3 py-2">Cuándo</th><th class="px-3">Empleado y día</th><th class="px-3">Antes</th><th class="px-3">Decisión</th><th class="px-3">Quedó</th><th class="px-3">Por</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in bitacora.filas" :key="f.id" class="border-t border-slate-100 align-top">
                <td class="px-3 py-1.5 text-xs text-slate-500">{{ formatearFechaHora(f.creadoEn) }}</td>
                <td class="px-3">{{ f.empleado.nombre }}<span class="block text-xs text-slate-500">{{ nombreDia(f.fecha) }} {{ formatearFecha(f.fecha) }}</span></td>
                <td class="px-3 text-xs text-slate-600">{{ resumenAntes(f) }}</td>
                <td class="px-3 text-xs">{{ RESOLUCIONES[f.tipo] }}<span class="block text-slate-500">«{{ f.motivo }}»</span><span v-if="f.supervisor" class="block text-teal-700">Supervisor: {{ f.supervisor }}</span></td>
                <td class="px-3 text-xs text-slate-600">{{ resumenDespues(f) }}</td>
                <td class="px-3 text-xs">{{ f.usuario.nombre }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <div v-if="importaciones.length" class="card">
      <p class="mb-2 text-base font-semibold text-slate-900">Importaciones anteriores</p>
      <ul class="flex flex-col gap-1 text-sm text-slate-600">
        <li v-for="i in importaciones" :key="i.id">
          {{ formatearFechaHora(i.creadoEn) }} — {{ i.nombreArchivo }} ({{ formatearFecha(i.periodoDesde) }} al {{ formatearFecha(i.periodoHasta) }})
        </li>
      </ul>
    </div>
  </div>
</template>
