<script setup>
import { confirmar } from '../../../lib/confirmar.js';
import Cargando from '../../../components/Cargando.vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api, ApiError, subirArchivo } from '../../../lib/api.js';
import { exito, fallo } from '../../../lib/avisos.js';
import { useAuthStore } from '../../../stores/auth.js';
import { FileSpreadsheet, Search, Upload, X } from '@lucide/vue';
import CesePanel from '../../../components/CesePanel.vue';
import AnomaliasPanel from '../../../components/AnomaliasPanel.vue';
import HorarioSemanalEditor from '../../../components/HorarioSemanalEditor.vue';
import { formatearColones, formatearFecha, fechaHoyISO } from '../../../lib/format.js';

const auth = useAuthStore();

// Anomalías pendientes por empleado (aviso en la lista) y el panel abierto.
const anomaliasPendientes = ref({});
const anomaliasDe = ref(null);
async function cargarAnomaliasPendientes() {
  try {
    anomaliasPendientes.value = await api.get('/planilla/anomalias/pendientes-por-empleado');
  } catch {
    anomaliasPendientes.value = {};
  }
}
onMounted(cargarAnomaliasPendientes);

// Solo el administrador del sistema: borra al empleado con todo su historial (datos de prueba).
async function eliminarEmpleado(e) {
  if (!await confirmar(`¿Eliminar a ${e.nombre} con todo su historial (asistencia, líneas de planillas en borrador o anuladas y deudas)? No se puede deshacer.`)) return;
  try {
    await api.delete(`/planilla/empleados/${e.id}`);
    exito(`${e.nombre} eliminado.`);
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudo eliminar.');
  }
}

// ---- Importar empleados desde Excel ----
// Se sube el archivo, se ve una vista previa (qué se crea, qué cambia, qué está mal) y recién ahí se aplica.
const importacion = reactive({ abierta: false, archivo: null, vista: null, trabajando: false, error: '', decisiones: {} });
const TIPOS_CESE = [
  { valor: 'renuncia', etiqueta: 'Renuncia' },
  { valor: 'mutuo_acuerdo', etiqueta: 'Mutuo acuerdo' },
  { valor: 'fin_contrato', etiqueta: 'Fin de contrato' },
  { valor: 'despido_sin_responsabilidad', etiqueta: 'Despido sin responsabilidad' },
  { valor: 'despido_con_responsabilidad', etiqueta: 'Despido con responsabilidad' },
];
const decisionDe = (id) => (importacion.decisiones[id] ??= { accion: 'conservar', fechaCese: '', tipoCese: 'renuncia', motivo: '' });
const resumenHistorial = (h) => h.detalle.map((d) => `${d.cantidad} en ${d.tabla.replace(/^planilla_/, '')}`).join(', ');
const ESTADO_IMPORT = {
  crear: { texto: 'Nuevo', clase: 'bg-green-100 text-green-700' },
  actualizar: { texto: 'Cambia', clase: 'bg-blue-100 text-blue-700' },
  sin_cambios: { texto: 'Sin cambios', clase: 'bg-slate-100 text-slate-600' },
  error: { texto: 'Error', clase: 'bg-red-100 text-red-700' },
};
// Cierra el panel y deja todo limpio para la próxima vez.
function cerrarImport() {
  Object.assign(importacion, { abierta: false, archivo: null, vista: null, error: '', decisiones: {} });
}
// Atajos para quien no está en el archivo: marcar de una vez a todos los que se pueden eliminar.
const eliminables = computed(() => (importacion.vista?.ausentes ?? []).filter((a) => !a.bloqueos.length && (a.historial.total === 0 || auth.esSistema)));
function marcarEliminarTodos() {
  for (const a of eliminables.value) decisionDe(a.id).accion = a.historial.total === 0 ? 'eliminar' : 'eliminar_todo';
}
function dejarTodos() {
  for (const a of importacion.vista?.ausentes ?? []) decisionDe(a.id).accion = 'conservar';
}
const cuantosMarcados = computed(() => Object.values(importacion.decisiones).filter((d) => d.accion !== 'conservar').length);
// Tras guardar, si alguien quedó sin decidir se vuelve a revisar con el mismo archivo.
async function decidirAusentes() {
  importacion.vista = null;
  importacion.decisiones = {};
  await enviarImport(false);
}
function otroArchivoImport() {
  Object.assign(importacion, { archivo: null, vista: null, error: '', decisiones: {} });
}
function elegirArchivoImport(ev) {
  importacion.archivo = ev.target.files?.[0] ?? null;
  importacion.vista = null;
  importacion.error = '';
}
async function enviarImport(aplicar) {
  importacion.trabajando = true;
  importacion.error = '';
  try {
    const f = new FormData();
    f.append('archivo', importacion.archivo);
    if (aplicar) {
      const hechas = Object.fromEntries(Object.entries(importacion.decisiones).filter(([, d]) => d.accion !== 'conservar'));
      f.append('decisiones', JSON.stringify(hechas));
    }
    importacion.vista = await subirArchivo(`/planilla/empleados/importar${aplicar ? '?aplicar=true' : ''}`, f);
    if (aplicar) {
      const v = importacion.vista;
      exito(`Importación lista: ${v.resumen.crear} nuevos, ${v.resumen.actualizar} actualizados, ${v.bajas.length} dados de baja, ${v.borrados.length} eliminados.`);
      await cargar();
    }
  } catch (err) {
    importacion.error = err instanceof ApiError ? err.message : 'No se pudo procesar el archivo.';
  } finally {
    importacion.trabajando = false;
  }
}
async function aplicarImport() {
  const r = importacion.vista.resumen;
  const decisiones = Object.entries(importacion.decisiones).filter(([, d]) => d.accion !== 'conservar');
  const aEliminar = decisiones.filter(([, d]) => d.accion === 'eliminar' || d.accion === 'eliminar_todo').length;
  const aBaja = decisiones.length - aEliminar;
  const detalle = `Se van a crear ${r.crear} empleados, actualizar ${r.actualizar}, dar de baja ${aBaja} y eliminar ${aEliminar}.`;
  if (!await confirmar(`${detalle} ¿Continuar?`)) return;
  await enviarImport(true);
}

const TIPOS = [
  { valor: 'mensual', etiqueta: 'Salario mensual' },
  { valor: 'semanal', etiqueta: 'Salario semanal' },
  { valor: 'por_hora', etiqueta: 'Por hora' },
];
const FRECUENCIAS = [
  { valor: 'semanal', etiqueta: 'Semanal' },
  { valor: 'quincenal', etiqueta: 'Quincenal' },
  { valor: 'mensual', etiqueta: 'Mensual' },
];

const empleados = ref([]);
const cargando = ref(true);
const error = ref('');
const guardando = ref(false);
const editandoId = ref(null); // null = formulario cerrado, 'nuevo' = crear
const verInactivos = ref(false);

// Horario de la fábrica (Parámetros): punto de partida de un horario propio.
const horarioBase = ref(null);
const horarioBaseCopia = () => JSON.parse(JSON.stringify(horarioBase.value ?? { lun: { entrada: '08:00', salida: '17:00' }, mar: { entrada: '08:00', salida: '17:00' }, mie: { entrada: '08:00', salida: '17:00' }, jue: { entrada: '08:00', salida: '17:00' }, vie: { entrada: '08:00', salida: '17:00' }, sab: { entrada: '08:00', salida: '13:00' } }));
async function cargarHorarioBase() {
  try {
    horarioBase.value = await api.get('/planilla/horario-base');
  } catch {
    /* se usa un horario estándar de respaldo */
  }
}

// ¿El horario de la tabla es distinto del de la fábrica? Si no, el empleado sigue
// el de la fábrica; si sí, queda con horario propio.
const normalizarHorario = (h) => JSON.stringify(['lun', 'mar', 'mie', 'jue', 'vie', 'sab'].map((d) => (h?.[d] ? [h[d].entrada, h[d].salida] : null)));
const horarioDistinto = computed(() => normalizarHorario(form.horarioSemanal) !== normalizarHorario(horarioBaseCopia()));

function formVacio() {
  return {
    numeroReloj: '',
    nombre: '',
    cedula: '',
    puesto: '',
    puestoId: '',
    departamento: '',
    esConfianza: false,
    esPrueba: false,
    cotizaIvm: true,
    horarioSemanal: horarioBaseCopia(),
    sector: 'industria',
    fechaIngreso: fechaHoyISO(),
    tipoSalario: 'semanal',
    montoSalario: '',
    frecuenciaPago: 'semanal',
    horarioEntrada: '08:00',
    horarioSalida: '17:00',
    horarioSalidaSabado: '13:00',
    tieneConyuge: false,
    cantidadHijos: 0,
    iban: '',
    formaPago: 'banco_popular',
    identificadorBp: '',
    horasSemana: '',
    almuerzoMarca: true,
    almuerzoMinutos: '',
    marcaReloj: true,
    esDeTienda: false,
    activo: true,
  };
}
const form = reactive(formVacio());

// Búsqueda: cada palabra escrita tiene que aparecer en algún dato del empleado
// (nombre, apellidos, N.º de reloj, cédula, puesto, IBAN…), sin importar
// mayúsculas ni tildes. Si se busca algo, también salen los inactivos y cesados.
const busqueda = ref('');
const limpiar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
function coincide(e, texto) {
  const palabras = limpiar(texto).split(/\s+/).filter(Boolean);
  const heno = limpiar(
    [e.nombre, e.puesto, e.departamento, e.cedula, e.numeroReloj, e.iban, e.identificadorBp, e.esDeTienda ? 'tienda' : '', e.fechaCese ? 'cesado' : ''].join(' '),
  );
  const cedula = soloDigitos(e.cedula);
  return palabras.every((p) => {
    if (heno.includes(p)) return true;
    // «1-0234-0567» ↔ «102340567»; «003» ↔ reloj «3».
    const d = soloDigitos(p);
    return d.length > 0 && (cedula.includes(d) || e.numeroReloj === String(Number(d)));
  });
}
const visibles = computed(() => {
  const q = busqueda.value.trim();
  return empleados.value.filter((e) => {
    if (q) return coincide(e, q);
    return verInactivos.value || e.activo || ceseDe.value?.id === e.id;
  });
});

async function cargar() {
  cargando.value = true;
  try {
    empleados.value = await api.get('/planilla/empleados');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar los empleados.';
  } finally {
    cargando.value = false;
  }
}
// Montos vigentes de los créditos fiscales (se editan en Parámetros).
const creditos = reactive({ conyuge: null, hijo: null });
async function cargarCreditos() {
  try {
    const parametros = await api.get('/planilla/parametros');
    creditos.conyuge = Number(parametros.find((x) => x.nombre === 'RENTA_CREDITO_CONYUGE')?.valor ?? 0) || null;
    creditos.hijo = Number(parametros.find((x) => x.nombre === 'RENTA_CREDITO_HIJO')?.valor ?? 0) || null;
  } catch {
    /* la nota se muestra igual, solo sin los montos */
  }
}
onMounted(() => {
  cargarHorarioBase();
  cargarPuestos();
  cargar();
  cargarCreditos();
});

function nuevo() {
  Object.assign(form, formVacio());
  error.value = '';
  editandoId.value = 'nuevo';
  irAlFormulario();
}
// El formulario está arriba de la lista: al editar a alguien que está más abajo
// hay que llevar la pantalla hasta él, si no parece que «Editar» no hace nada.
const formRef = ref(null);
async function irAlFormulario() {
  await nextTick();
  formRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function editar(e) {
  Object.assign(form, formVacio(), {
    ...e,
    cedula: e.cedula ?? '',
    puesto: e.puesto ?? '',
    departamento: e.departamento ?? '',
    puestoId: e.puestoId ?? '',
    esConfianza: e.esConfianza === true,
    esPrueba: e.esPrueba === true,
    cotizaIvm: e.cotizaIvm !== false,
    horarioSemanal: e.horarioSemanal ? { lun: null, mar: null, mie: null, jue: null, vie: null, sab: null, ...e.horarioSemanal } : horarioBaseCopia(),
    sector: e.sector ?? 'industria',
    iban: e.iban ?? '',
    identificadorBp: e.identificadorBp ?? '',
    horasSemana: e.horasSemana != null ? Number(e.horasSemana) : '',
    almuerzoMarca: e.almuerzoMarca !== false,
    almuerzoMinutos: e.almuerzoMinutos ?? '',
    marcaReloj: e.marcaReloj !== false,
    esDeTienda: e.esDeTienda === true,
    montoSalario: Number(e.montoSalario),
  });
  error.value = '';
  editandoId.value = e.id;
  irAlFormulario();
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    const cuerpo = {
      numeroReloj: form.numeroReloj,
      nombre: form.nombre.trim(),
      cedula: form.cedula.trim() || undefined,
      // Puesto de la lista (el servidor copia su nombre) o, si es otro, el texto escrito.
      ...(form.puestoId ? { puestoId: form.puestoId } : { puesto: form.puesto.trim() || undefined }),
      departamento: form.departamento.trim(),
      esConfianza: form.esConfianza,
      esPrueba: form.esPrueba,
      cotizaIvm: form.cotizaIvm,
      sector: form.sector,
      // null = sigue el horario de la fábrica (si no se tocó la tabla)
      horarioSemanal: form.esConfianza || !horarioDistinto.value ? null : form.horarioSemanal,
      fechaIngreso: form.fechaIngreso || undefined,
      tipoSalario: form.tipoSalario,
      montoSalario: Number(form.montoSalario),
      frecuenciaPago: form.frecuenciaPago,
      tieneConyuge: form.tieneConyuge,
      cantidadHijos: Number(form.cantidadHijos),
      iban: form.iban.trim() || undefined,
      formaPago: form.formaPago,
      identificadorBp: form.identificadorBp.trim() || undefined,
      horasSemana: form.horasSemana === '' || form.horasSemana === null ? null : Number(form.horasSemana),
      almuerzoMarca: form.almuerzoMarca,
      marcaReloj: form.marcaReloj,
      esDeTienda: form.esDeTienda,
      almuerzoMinutos: form.almuerzoMinutos === '' || form.almuerzoMinutos === null ? null : Number(form.almuerzoMinutos),
    };
    if (editandoId.value === 'nuevo') await api.post('/planilla/empleados', cuerpo);
    else await api.patch(`/planilla/empleados/${editandoId.value}`, { ...cuerpo, activo: form.activo });
    editandoId.value = null;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar el empleado.';
  } finally {
    guardando.value = false;
  }
}

// ---- Cese ----
const ceseDe = ref(null);
const puestos = ref([]);
async function cargarPuestos() {
  try {
    puestos.value = await api.get('/planilla/puestos');
  } catch {
    /* sin lista de puestos se puede escribir el puesto a mano */
  }
}
// Al elegir un puesto, su indicador de confianza pasa al empleado (se puede ajustar).
function elegirPuesto() {
  const p = puestos.value.find((x) => x.id === form.puestoId);
  if (p) {
    form.puesto = p.nombre;
    form.esConfianza = p.esConfianza;
    form.sector = p.sector ?? 'industria';
  }
}

// El personal de tienda es de comercio: al marcarlo se propone ese sector.
function alCambiarLugar() {
  if (form.esDeTienda) form.sector = 'comercio';
}

// Explicación de cómo se le va a calcular el pago, según lo que se eligió, y el
// valor de la hora que resulta. Es lo que la persona que digita tiene que leer.
const explicacionPago = computed(() => {
  const monto = Number(form.montoSalario) || 0;
  const horas = Number(form.horasSemana) || 0;
  // Días que trabaja por semana: los de su horario propio (ej. 5 de lunes a viernes) o, sin horario propio, de lunes a sábado.
  const diasTrabajo = horarioDistinto.value ? Object.values(form.horarioSemanal ?? {}).filter(Boolean).length || 6 : 6;
  const horasDia = horas > 0 ? horas / diasTrabajo : 8;
  const contrato = horas > 0 ? ` Tiene pactada una jornada ordinaria de ${horas} horas por semana (${diasTrabajo} días de ${Math.floor(horasDia)}:${String(Math.round((horasDia % 1) * 60)).padStart(2, '0')} h): esas horas son ordinarias, no extra; solo lo que pase de ${horas} horas en la semana se paga como extra.` : '';
  const comercio = form.sector === 'comercio';
  let hora = 0;
  let texto = '';
  if (form.tipoSalario === 'por_hora') {
    hora = monto;
    texto = 'Se le pagan solo las horas trabajadas. El domingo no se paga si no se trabaja; si se trabaja, se paga doble. Los feriados trabajados también se pagan doble.';
  } else if (form.frecuenciaPago !== 'semanal' || form.tipoSalario === 'mensual') {
    hora = monto / 30 / horasDia;
    texto = 'El salario es mensual o quincenal: el domingo y el día libre ya vienen incluidos y se pagan aunque no se trabajen. Si trabaja un domingo o feriado se le suma un pago adicional, hasta completar el doble.';
  } else if (comercio) {
    hora = monto / (horas > 0 ? horas : 56);
    texto = `Salario semanal del comercio: el día de descanso (domingo) está incluido en el pago semanal y se paga aunque no se trabaje. La hora vale el salario semanal ÷ ${horas > 0 ? horas : '56 (7 días × 8 horas)'}. Si trabaja un domingo se le suma un pago adicional, hasta completar el doble.`;
  } else {
    hora = monto / (horas > 0 ? horas : 48);
    texto = `Salario semanal por el tiempo efectivamente laborado (industria): se le paga de lunes a sábado; el domingo NO se paga si no se trabaja. La hora vale el salario semanal ÷ ${horas > 0 ? horas : 48}. Si trabaja un domingo se le paga doble.`;
  }
  return { texto: texto + contrato, hora: hora > 0 ? hora : null };
});
async function reactivar(e) {
  if (!await confirmar(`¿Reactivar a ${e.nombre}? Vuelve a aparecer en las planillas.`)) return;
  try {
    await api.post(`/planilla/empleados/${e.id}/reactivar`, {});
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo reactivar.';
  }
}

// ---- Deudas con la empresa ----
const deudasDe = ref(null);
const deudas = ref([]);
const formDeuda = reactive({ descripcion: '', monto: '', cuotaPorPlanilla: '', autorizacionNota: '', cuentaBancariaId: '' });
const cuentasPrestamo = ref([]);
const errorDeuda = ref('');

async function abrirDeudas(e) {
  deudasDe.value = e;
  errorDeuda.value = '';
  if (cuentasPrestamo.value.length === 0) cuentasPrestamo.value = await api.get('/cuentas-bancarias?activas=true').catch(() => []);
  deudas.value = await api.get(`/planilla/empleados/${e.id}/deudas`);
}
async function crearDeuda() {
  errorDeuda.value = '';
  try {
    await api.post(`/planilla/empleados/${deudasDe.value.id}/deudas`, {
      descripcion: formDeuda.descripcion.trim(),
      monto: Number(formDeuda.monto),
      cuotaPorPlanilla: Number(formDeuda.cuotaPorPlanilla),
      autorizacionNota: formDeuda.autorizacionNota.trim(),
      ...(formDeuda.cuentaBancariaId ? { cuentaBancariaId: formDeuda.cuentaBancariaId } : {}),
    });
    Object.assign(formDeuda, { descripcion: '', monto: '', cuotaPorPlanilla: '', autorizacionNota: '', cuentaBancariaId: '' });
    deudas.value = await api.get(`/planilla/empleados/${deudasDe.value.id}/deudas`);
  } catch (err) {
    errorDeuda.value = err instanceof ApiError ? err.message : 'No se pudo registrar la deuda.';
  }
}
async function cerrarDeuda(d) {
  if (!await confirmar('¿Cerrar esta deuda? Si ya se le descontó algo, lo que falta por cobrar se da de baja como gasto; si no se descontó nada, se reversa el préstamo.')) return;
  await api.patch(`/planilla/deudas/${d.id}/desactivar`, {});
  deudas.value = await api.get(`/planilla/empleados/${deudasDe.value.id}/deudas`);
}
const etiqueta = (lista, v) => lista.find((x) => x.valor === v)?.etiqueta ?? v;
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-slate-900">Empleados de planilla</h1>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input v-model="verInactivos" type="checkbox" class="size-4" /> Ver inactivos
        </label>
        <button type="button" class="btn-secondary" @click="importacion.abierta ? cerrarImport() : (importacion.abierta = true)">
          <Upload class="size-4" /> Importar desde Excel
        </button>
        <button type="button" class="btn-primary" @click="nuevo">Nuevo empleado</button>
      </div>
    </div>

    <div v-if="importacion.abierta" class="card flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-base font-semibold text-slate-900">Importar empleados desde Excel</p>
        <button type="button" class="rounded-md p-1 text-slate-500 hover:bg-slate-100" title="Cerrar" aria-label="Cerrar" @click="cerrarImport"><X class="size-5" /></button>
      </div>
      <p class="text-sm text-slate-600">
        El archivo debe tener una fila de encabezados con al menos <strong>Nombre</strong>. Columnas que se entienden: Cédula, N.º de reloj, Puesto, Departamento,
        Fecha de ingreso, Tipo de salario (por hora / semanal / mensual), Monto, Se paga (semanal / quincenal / mensual), Sector,
        Es de tienda, Puesto de confianza, Marca en reloj, Forma de pago, IBAN e Identificador Banco Popular. Si un empleado ya existe (por cédula o por nombre)
        solo se cambia lo que traiga el archivo; <strong>una celda vacía nunca borra</strong> lo que ya está. Antes de guardar ve una vista previa.
      </p>
      <div v-if="!importacion.vista || !importacion.vista.aplicado" class="flex flex-wrap items-center gap-3">
        <label
          class="flex min-w-72 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors"
          :class="importacion.archivo ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'"
        >
          <FileSpreadsheet class="size-8 shrink-0" :class="importacion.archivo ? 'text-blue-600' : 'text-slate-500'" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-slate-800">{{ importacion.archivo ? importacion.archivo.name : 'Elegir el archivo de empleados' }}</span>
            <span class="block text-xs text-slate-500">{{ importacion.archivo ? 'Haga clic para cambiar de archivo' : 'Excel .xlsx o .xls con una fila por empleado' }}</span>
          </span>
          <input type="file" accept=".xlsx,.xls" class="hidden" @change="elegirArchivoImport" />
        </label>
        <button v-if="importacion.archivo && !importacion.vista" type="button" class="btn-primary" :disabled="importacion.trabajando" @click="enviarImport(false)">
          {{ importacion.trabajando ? 'Leyendo…' : 'Ver vista previa' }}
        </button>
      </div>
      <p v-if="importacion.error" class="text-sm font-medium text-red-600">{{ importacion.error }}</p>
      <template v-if="importacion.vista">
        <p class="text-sm text-slate-700">
          {{ importacion.vista.resumen.total }} filas: <strong>{{ importacion.vista.resumen.crear }}</strong> nuevos ·
          <strong>{{ importacion.vista.resumen.actualizar }}</strong> con cambios · {{ importacion.vista.resumen.sinCambios }} sin cambios ·
          <strong :class="importacion.vista.resumen.errores ? 'text-red-600' : ''">{{ importacion.vista.resumen.errores }}</strong> con errores.
        </p>
        <div v-if="importacion.vista.aplicado" class="flex flex-wrap items-center gap-3 rounded-xl border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">
          <span class="font-semibold">Importación guardada.</span>
          <span v-if="importacion.vista.bajas?.length">Dados de baja: {{ importacion.vista.bajas.join(', ') }}.</span>
          <span v-if="importacion.vista.borrados?.length">Eliminados: {{ importacion.vista.borrados.join(', ') }}.</span>
          <span v-if="importacion.vista.ausentes?.length" class="basis-full rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">
            <strong>{{ importacion.vista.ausentes.length }} empleado(s) siguen en el sistema pero no están en el archivo:</strong>
            {{ importacion.vista.ausentes.map((a) => a.nombre).join(', ') }}.
            <button type="button" class="ml-1 font-semibold underline" @click="decidirAusentes">Decidir ahora</button>
          </span>
          <span class="ml-auto flex gap-2">
            <button type="button" class="btn-secondary" @click="otroArchivoImport">Importar otro archivo</button>
            <button type="button" class="btn-primary" @click="cerrarImport">Cerrar</button>
          </span>
        </div>
        <div v-if="importacion.vista.ausentes?.length && !importacion.vista.aplicado" class="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p class="text-sm font-semibold text-amber-900">En el sistema pero NO en el archivo ({{ importacion.vista.ausentes.length }}): decida qué hacer con cada uno</p>
          <div class="flex flex-wrap gap-2">
            <button v-if="eliminables.length" type="button" class="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800" @click="marcarEliminarTodos">Marcar para eliminar a los {{ eliminables.length }} que se pueden</button>
            <button type="button" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700" @click="dejarTodos">Dejar todos como están</button>
            <span class="self-center text-xs text-amber-900">{{ cuantosMarcados }} marcado(s) · se aplican al pulsar «Guardar estos cambios»</span>
          </div>
          <p class="text-xs text-amber-900">
            Por seguridad nadie se toca si no lo decide aquí. <strong>Eliminar</strong> solo se permite a quien no tiene nada registrado (planillas, asistencia, deudas…);
            a quien ya tiene historial se le <strong>da de baja</strong> (cese), que conserva su historial y le quita el acceso al sistema. Si son datos de prueba, el administrador del sistema puede <strong>eliminarlo con todo su historial</strong>, salvo que salga en planillas ya aprobadas o pagadas (esas se anulan primero).
          </p>
          <div v-for="a in importacion.vista.ausentes" :key="a.id" class="rounded-lg border border-amber-200 bg-white p-2 text-sm">
            <p class="font-semibold text-slate-900">{{ a.nombre }} <span v-if="a.puesto" class="font-normal text-slate-500">· {{ a.puesto }}</span></p>
            <p v-if="a.parecidoA.length" class="text-xs text-amber-800">Se parece a «{{ a.parecidoA.join(', ') }}» del archivo: ¿es la misma persona? Si es así, no lo elimine; corrija su nombre o su cédula y vuelva a revisar.</p>
            <p class="text-xs text-slate-500">{{ a.historial.total === 0 ? 'Sin nada registrado: se puede eliminar.' : `Con historial (${resumenHistorial(a.historial)}).` }}</p>
            <p v-if="a.bloqueos.length" class="text-xs font-medium text-red-700">Sale en {{ a.bloqueos.join('; ') }}: para eliminarlo hay que anular esas planillas primero.</p>
            <div class="mt-1 flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-1"><input v-model="decisionDe(a.id).accion" type="radio" value="conservar" /> Dejarlo como está</label>
              <label v-if="a.historial.total === 0" class="flex items-center gap-1 text-red-700"><input v-model="decisionDe(a.id).accion" type="radio" value="eliminar" /> Eliminar</label>
              <label v-if="auth.esSistema && a.historial.total > 0 && !a.bloqueos.length" class="flex items-center gap-1 text-red-700"><input v-model="decisionDe(a.id).accion" type="radio" value="eliminar_todo" /> Eliminar con todo su historial</label>
              <label class="flex items-center gap-1"><input v-model="decisionDe(a.id).accion" type="radio" value="cesar" /> Dar de baja (cesar)</label>
            </div>
            <div v-if="decisionDe(a.id).accion === 'cesar'" class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div><label class="label">Fecha del cese *</label><input v-model="decisionDe(a.id).fechaCese" type="date" class="input" /></div>
              <div><label class="label">Tipo *</label><select v-model="decisionDe(a.id).tipoCese" class="input"><option v-for="t in TIPOS_CESE" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option></select></div>
              <div><label class="label">Motivo *</label><input v-model="decisionDe(a.id).motivo" class="input" placeholder="Ej. dejó de laborar" /></div>
            </div>
          </div>
        </div>
        <div class="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
          <table class="tabla-fija min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold text-slate-600"><tr><th class="px-3 py-2">Fila</th><th class="px-3">Empleado</th><th class="px-3">Qué pasa</th><th class="px-3">Detalle</th></tr></thead>
            <tbody>
              <tr v-for="x in importacion.vista.filas" :key="x.fila.fila" class="border-t border-slate-100 align-top">
                <td class="px-3 py-1.5 text-xs text-slate-500">{{ x.fila.fila }}</td>
                <td class="px-3">{{ x.fila.nombre }}<span v-if="x.existente && x.existente.nombre !== x.fila.nombre" class="block text-xs text-slate-500">= {{ x.existente.nombre }}</span></td>
                <td class="px-3"><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADO_IMPORT[x.accion].clase">{{ ESTADO_IMPORT[x.accion].texto }}</span></td>
                <td class="px-3 text-xs text-slate-600">
                  <span v-for="c in x.cambios" :key="c.campo" class="block">{{ c.etiqueta }}: {{ c.antes }} → <strong>{{ c.despues }}</strong></span>
                  <span v-for="e in x.fila.errores" :key="e" class="block font-medium text-red-600">{{ e }}</span>
                  <span v-for="a in x.avisos" :key="a" class="block text-amber-700">{{ a }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!importacion.vista.aplicado" class="flex gap-2">
          <button type="button" class="btn-primary" :disabled="importacion.trabajando || importacion.vista.resumen.errores > 0 || (importacion.vista.resumen.crear + importacion.vista.resumen.actualizar === 0 && !Object.values(importacion.decisiones).some((d) => d.accion !== 'conservar'))" @click="aplicarImport">Guardar estos cambios</button>
          <p v-if="importacion.vista.resumen.errores" class="self-center text-xs text-red-600">Corrija los errores en el Excel y vuelva a subirlo.</p>
        </div>
      </template>
    </div>

    <div class="relative max-w-xl">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
      <input
        v-model="busqueda"
        type="search"
        class="input pl-9"
        placeholder="Buscar por nombre, apellidos, N.º de reloj, cédula, puesto…"
        autocomplete="off"
      />
      <p v-if="busqueda.trim()" class="mt-1 text-xs text-slate-500">
        {{ visibles.length }} resultado(s) · incluye inactivos y cesados.
        <button type="button" class="font-semibold text-blue-700 underline" @click="busqueda = ''">Limpiar búsqueda</button>
      </p>
    </div>

    <div v-if="editandoId" ref="formRef" class="card flex scroll-mt-20 flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">{{ editandoId === 'nuevo' ? 'Nuevo empleado' : 'Editar empleado' }}</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="label">N.º en el reloj *</label>
          <input v-model="form.numeroReloj" type="text" class="input" placeholder="Ej. 3" />
        </div>
        <div>
          <label class="label">Nombre *</label>
          <input v-model="form.nombre" type="text" class="input" />
        </div>
        <div>
          <label class="label">Cédula</label>
          <input v-model="form.cedula" type="text" class="input" />
        </div>
        <div>
          <label class="label">Puesto</label>
          <select v-model="form.puestoId" class="input" @change="elegirPuesto">
            <option value="">{{ form.puesto ? `Otro: ${form.puesto}` : 'Elija un puesto…' }}</option>
            <option v-for="p in puestos.filter((x) => x.activo)" :key="p.id" :value="p.id">{{ p.nombre }}{{ p.esConfianza ? ' (de confianza)' : '' }}</option>
          </select>
          <input v-if="!form.puestoId" v-model="form.puesto" type="text" class="input mt-1" placeholder="O escriba otro puesto" />
          <label class="label mt-2">Departamento o lugar de trabajo</label>
          <input v-model="form.departamento" type="text" class="input" placeholder="Ej. Oficina central, Bodega, Acabado, Tienda SOX#8" />
        </div>
        <div>
          <label class="label">¿Dónde trabaja?</label>
          <select v-model="form.esDeTienda" class="input" @change="alCambiarLugar">
            <option :value="false">En la fábrica (marca en el reloj)</option>
            <option :value="true">En una tienda (no marca aquí: horas a mano)</option>
          </select>
          <p v-if="form.esDeTienda" class="mt-1 text-xs text-slate-500">El archivo del reloj lo omite, y al calcular la planilla se avisa si faltan sus horas. Se meten en Asistencia → Horas de tienda.</p>
        </div>
        <label class="flex items-start gap-2 self-end rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:col-span-2">
          <input v-model="form.esConfianza" type="checkbox" class="mt-0.5 size-4" />
          <span>
            <strong>Puesto de confianza (sin jornada fija).</strong> Gerentes, administradores y cargos que trabajan sin
            fiscalización inmediata (art. 143 del Código de Trabajo): reciben su salario fijo, no se les descuentan horas
            faltantes ni se les pagan horas extra, y <strong>quedan fuera del control del reloj</strong>: no aparecen en
            Asistencia ni como «sin marcas», no se les piden marcas y se les paga siempre la jornada completa.
          </span>
        </label>
        <label v-if="auth.esSistema || form.esPrueba" class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <input v-model="form.esPrueba" type="checkbox" class="mt-0.5 size-4" :disabled="!auth.esSistema" />
          <span>
            <strong>Empleado de prueba.</strong> Sirve para probar cómo marca el personal (celular, PIN y QR). <strong>Nunca entra a una planilla</strong>, no genera
            asistencia, no sale en informes ni en la importación del reloj; sus marcas quedan registradas en «Marcas del celular», pero no se suman a ningún día.
            Solo el administrador del sistema lo puede marcar.
          </span>
        </label>
        <label class="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:col-span-2">
          <input v-model="form.cotizaIvm" type="checkbox" class="mt-0.5 size-4" />
          <span>
            <strong>Cotiza al IVM (pensión).</strong> Desmárquelo solo si es <strong>pensionado y sigue trabajando</strong>: entonces la planilla
            le rebaja SEM y Banco Popular (6,5 %) pero no IVM. Confirme su caso con la contadora.
          </span>
        </label>
        <div>
          <label class="label">Fecha de ingreso</label>
          <input v-model="form.fechaIngreso" type="date" class="input" />
        </div>
        <div>
          <label class="label">Forma de pago</label>
          <select v-model="form.formaPago" class="input">
            <option value="banco_popular">Transferencia — planilla web del Banco Popular</option>
            <option value="efectivo">Efectivo u otro medio (no va en el archivo del banco)</option>
          </select>
        </div>
        <template v-if="form.formaPago === 'banco_popular'">
          <div>
            <label class="label">IBAN de su cuenta *</label>
            <input v-model="form.iban" type="text" class="input" placeholder="CR + 20 dígitos" />
          </div>
          <div>
            <label class="label">Identificador de cliente del Banco Popular *</label>
            <input v-model="form.identificadorBp" type="text" inputmode="numeric" class="input" placeholder="Ej. 1605514" />
            <p class="mt-1 text-xs text-slate-500">El número que el banco le asignó al empleado para la planilla web (la columna «Identificador único cliente» del Excel del banco). Además se usa su cédula.</p>
          </div>
        </template>
        <div>
          <label class="label">Tipo de salario *</label>
          <select v-model="form.tipoSalario" class="input">
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ form.tipoSalario === 'por_hora' ? 'Pago por hora (₡) *' : 'Monto del salario (₡) *' }}</label>
          <input v-model="form.montoSalario" type="number" min="0" step="0.01" class="input" />
          <p class="mt-1 text-xs text-slate-500">
            Se anota el salario <strong>bruto</strong> pactado, antes de rebajar CCSS, Banco Popular y renta. El sistema
            calcula el neto al hacer la planilla.
            <template v-if="form.tipoSalario === 'por_hora'">Es el bruto de cada hora ordinaria.</template>
            <template v-else-if="form.tipoSalario === 'semanal'">Es el bruto de una semana completa (48 horas pagadas).</template>
            <template v-else>Es el bruto de un mes completo.</template>
          </p>
        </div>
        <div>
          <label class="label">Frecuencia de pago * (según lo pactado)</label>
          <select v-model="form.frecuenciaPago" class="input">
            <option v-for="f in FRECUENCIAS" :key="f.valor" :value="f.valor">{{ f.etiqueta }}</option>
          </select>
        </div>
        <div v-if="!form.esConfianza" class="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-800">
              Horario por día
              <span class="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" :class="horarioDistinto ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'">
                {{ horarioDistinto ? 'Horario propio' : 'Igual al de la fábrica' }}
              </span>
            </p>
            <button v-if="horarioDistinto" type="button" class="text-xs font-semibold text-blue-700 underline" @click="form.horarioSemanal = horarioBaseCopia()">
              Volver al horario de la fábrica
            </button>
          </div>
          <p class="mb-2 mt-1 text-xs text-slate-500">
            Parte del horario de la fábrica. Si esta persona tiene otro horario, cambie lo que haga falta en la tabla: queda
            como horario propio. Si no se toca, sigue el de la fábrica y se actualiza cuando ese cambie. (Una jornada de más de
            48 horas por semana pactada con la persona se anota más abajo, en «Jornada y almuerzo».)
          </p>
          <HorarioSemanalEditor v-model="form.horarioSemanal" :almuerzo-min="Number(form.almuerzoMinutos) || 60" />
        </div>
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:col-span-2">
          <p class="text-sm font-semibold text-blue-900">Cómo se le calcula el pago</p>
          <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="label">Sector donde se le paga</label>
              <select v-model="form.sector" class="input">
                <option value="industria">Industria (fábrica)</option>
                <option value="comercio">Comercio (tienda)</option>
              </select>
              <p class="mt-1 text-xs text-slate-600">Se toma del puesto al elegirlo. Importa sobre todo en el salario semanal: define si el domingo está incluido.</p>
            </div>
            <div class="sm:col-span-2">
              <p class="text-sm leading-relaxed text-slate-800">{{ explicacionPago.texto }}</p>
              <p v-if="explicacionPago.hora" class="mt-1 text-sm font-semibold text-blue-900">Valor de la hora ordinaria: {{ formatearColones(explicacionPago.hora) }}</p>
              <p class="mt-1 text-xs italic text-slate-500">Resumen según la modalidad de pago (salario mensual, quincenal o semanal; comercio o industria). Confirmalo con la contadora.</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p class="text-sm font-semibold text-slate-800">Jornada y almuerzo</p>
          <p class="mt-1 text-xs leading-relaxed text-slate-600">
            Solo si este empleado es distinto al resto. Al guardar, sus marcas ya importadas que nadie ha resuelto a mano se
            vuelven a calcular con esta configuración.
          </p>
          <div v-if="auth.esSistema || auth.esGerenteGeneral || Number(form.horasSemana) > 48" class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <label class="label" for="horas-semana">Jornada ordinaria pactada, en horas por semana (opcional)</label>
            <input id="horas-semana" v-model="form.horasSemana" type="number" min="30" max="72" step="0.5" class="input w-32" placeholder="vacío" :disabled="!(auth.esSistema || auth.esGerenteGeneral)" />
            <p class="mt-1 text-xs leading-relaxed">
              <strong>Déjelo vacío para casi todos.</strong> Solo para un acuerdo especial: por ejemplo, quien trabaja 50 horas de lunes a viernes y su salario ya cubre las 50.
              Con este dato <strong>esas horas no son extra</strong> (solo lo que pase de ahí en la semana), la hora vale el salario ÷ esas horas y las horas por día salen de los días de su horario.
              Sin este dato, todo lo que pase de 48 horas por semana se paga como extra. Solo el administrador del sistema o la gerencia general lo pueden poner.
            </p>
            <p v-if="Number(form.horasSemana) > 0 && !horarioDistinto" class="mt-1 text-xs font-semibold text-red-700">Anote también su horario por día (arriba): sin él se asume que trabaja de lunes a sábado.</p>
          </div>
          <label class="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input v-model="form.marcaReloj" type="checkbox" class="mt-0.5 size-4" :disabled="form.esConfianza" />
            <span>
              <strong>Usa el reloj de huella.</strong> Si lo desmarca (por ejemplo, gerencia que no marca), no se le piden
              marcas: en la planilla se le paga la jornada completa y no aparece como «sin marcas».
              <em v-if="form.esConfianza" class="block text-xs text-violet-700">Como es puesto de confianza, ya queda fuera del control del reloj.</em>
            </span>
          </label>
          <div v-if="!form.esConfianza" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">¿Marca el almuerzo en el reloj?</label>
              <select v-model="form.almuerzoMarca" class="input">
                <option :value="true">Sí, marca el almuerzo</option>
                <option :value="false">No lo marca (anda en ruta)</option>
              </select>
              <p class="mt-1 text-xs text-slate-500">Si no lo marca, su almuerzo se descuenta fijo y no se le avisa como «estimado».</p>
            </div>
            <div>
              <label class="label">Minutos de almuerzo cuando no hay marcas</label>
              <input v-model="form.almuerzoMinutos" type="number" min="0" max="180" class="input" placeholder="Vacío = 60" />
              <p class="mt-1 text-xs text-slate-500">0 = no se le descuenta almuerzo. Un día suelto con otra duración (ej. media hora) se ajusta en Asistencia.</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p class="text-sm font-semibold text-slate-800">Créditos fiscales por familia (renta del salario)</p>
          <p class="mt-1 text-xs leading-relaxed text-slate-600">
            El salario ya lo tiene el sistema, y con él calcula solo la retención de renta de cada mes. Lo único que hay
            que indicar acá es la situación familiar del empleado, porque eso el sistema no lo puede saber: si tiene
            cónyuge y cuántos hijos. No es un monto que el empleado aporte: es un descuento a su favor. Por cada
            cónyuge<template v-if="creditos.conyuge"> ({{ formatearColones(creditos.conyuge) }} al mes)</template> y por
            cada hijo<template v-if="creditos.hijo"> ({{ formatearColones(creditos.hijo) }} al mes)</template>, el
            Decreto Ejecutivo N.º 45333-H permite restarle esa cantidad al impuesto que se le retiene. Solo tiene efecto
            si el salario del mes supera el tramo exento de renta; si no paga renta, no hay nada que rebajar. Marcalo
            únicamente si el empleado lo solicitó y entregó el respaldo. Los montos se ajustan cada año en Parámetros.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-6">
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input v-model="form.tieneConyuge" type="checkbox" class="size-4" /> Tiene cónyuge
            </label>
            <div class="flex items-center gap-2">
              <label class="text-sm text-slate-700">Hijos</label>
              <input v-model="form.cantidadHijos" type="number" min="0" max="20" class="input w-20" />
            </div>
          </div>
        </div>
        <label v-if="editandoId !== 'nuevo'" class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="form.activo" type="checkbox" class="size-4" /> Activo
        </label>
      </div>
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="editandoId = null">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" />
    <p v-else-if="visibles.length === 0" class="text-base text-slate-500">
      {{ busqueda.trim() ? `Ningún empleado coincide con «${busqueda.trim()}».` : 'Todavía no hay empleados registrados.' }}
    </p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="e in visibles" :key="e.id" class="card">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-base font-semibold text-slate-900">
              {{ e.nombre }}
              <span class="text-sm font-normal text-slate-500">· reloj {{ e.numeroReloj }}</span>
              <span v-if="e.fechaCese" class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Cesado el {{ formatearFecha(e.fechaCese) }}</span>
              <span v-else-if="!e.activo" class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Inactivo</span>
              <span v-if="e.sector === 'comercio'" class="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Comercio</span>
              <span v-if="e.esDeTienda" class="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Tienda</span>
              <span v-if="e.cotizaIvm === false" class="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700" title="Pensionado que sigue trabajando: no cotiza IVM">Pensionado</span>
              <span v-if="Number(e.horasSemana) > 48" class="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" :title="`Jornada ordinaria pactada de ${Number(e.horasSemana)} horas por semana: esas horas no son extra`">Jornada de {{ Number(e.horasSemana) }} h</span>
              <span v-if="e.esPrueba" class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" title="Solo para probar: no entra a planillas ni genera asistencia">De prueba</span>
              <span v-if="e.esConfianza" class="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700" title="Sin jornada fija: fuera del control del reloj, se le paga siempre la jornada completa">De confianza</span>
              <span v-if="e.activo && !e.marcaReloj && !e.esConfianza" class="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">No usa el reloj</span>
            </p>
            <p class="text-sm text-slate-500">
              {{ e.puesto || 'Sin puesto' }}<template v-if="e.departamento"> · {{ e.departamento }}</template> · {{ etiqueta(TIPOS, e.tipoSalario) }}
              {{ formatearColones(e.montoSalario) }} bruto · pago {{ etiqueta(FRECUENCIAS, e.frecuenciaPago).toLowerCase() }}
            </p>
          </div>
          <div class="flex gap-3 text-sm font-semibold text-blue-700">
            <button type="button" class="underline" @click="abrirDeudas(e)">Deudas</button>
            <button type="button" class="underline" @click="anomaliasDe = anomaliasDe === e.id ? null : e.id">
              Anomalías<span v-if="anomaliasPendientes[e.id]" class="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{{ anomaliasPendientes[e.id] }}</span>
            </button>
            <button v-if="auth.esSistema" type="button" class="text-red-700 underline" @click="eliminarEmpleado(e)">Eliminar</button>
            <button type="button" class="underline" @click="editar(e)">Editar</button>
            <button v-if="e.activo && !e.fechaCese" type="button" class="text-red-700 underline" @click="ceseDe = { id: e.id, nombre: e.nombre, modo: 'cesar' }">Dar de baja</button>
            <template v-if="e.fechaCese">
              <button type="button" class="underline" @click="ceseDe = { id: e.id, nombre: e.nombre, modo: 'liquidacion' }">Liquidación</button>
              <button type="button" class="underline" @click="reactivar(e)">Reactivar</button>
            </template>
          </div>
        </div>

        <CesePanel
          v-if="ceseDe?.id === e.id"
          :key="`${ceseDe.id}-${ceseDe.modo}`"
          class="mt-4"
          :empleado-id="e.id"
          :nombre="e.nombre"
          :modo="ceseDe.modo"
          @hecho="cargar"
          @cancelar="ceseDe = null; cargar()"
        />

        <AnomaliasPanel v-if="anomaliasDe === e.id" :empleado="e" @cambio="cargarAnomaliasPendientes" @cerrar="anomaliasDe = null" />
        <div v-if="deudasDe?.id === e.id" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="mb-2 text-sm font-semibold text-slate-800">Deudas de {{ e.nombre }} con la empresa</p>
          <ul v-if="deudas.length" class="mb-3 flex flex-col gap-2 text-sm">
            <li v-for="d in deudas" :key="d.id" class="flex flex-wrap items-center justify-between gap-2">
              <span>
                {{ d.descripcion }} — saldo {{ formatearColones(d.saldo) }} de {{ formatearColones(d.montoOriginal) }}
                (cuota {{ formatearColones(d.cuotaPorPlanilla) }}) <span class="text-slate-500">· {{ d.autorizacionNota }}</span>
              </span>
              <button v-if="d.activa" type="button" class="font-semibold text-red-700 underline" @click="cerrarDeuda(d)">Cerrar deuda</button>
              <span v-else class="text-slate-500">Cerrada</span>
            </li>
          </ul>
          <p v-else class="mb-3 text-sm text-slate-500">Sin deudas registradas.</p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input v-model="formDeuda.descripcion" class="input" placeholder="Descripción (ej. adelanto, préstamo)" />
            <input v-model="formDeuda.autorizacionNota" class="input" placeholder="Autorización del empleado (obligatoria)" />
            <input v-model="formDeuda.monto" type="number" min="0" class="input" placeholder="Monto total ₡" />
            <input v-model="formDeuda.cuotaPorPlanilla" type="number" min="0" class="input" placeholder="Cuota por planilla ₡" />
            <select v-model="formDeuda.cuentaBancariaId" class="input sm:col-span-2" title="De dónde salió el dinero prestado">
              <option value="">El dinero salió de: caja general (efectivo)</option>
              <option v-for="c in cuentasPrestamo.filter((x) => !x.esCaja)" :key="c.id" :value="c.id">El dinero salió de: {{ c.nombre }}</option>
            </select>
          </div>
          <p v-if="errorDeuda" class="mt-2 text-sm font-medium text-red-600">{{ errorDeuda }}</p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-secondary" @click="deudasDe = null">Cerrar</button>
            <button type="button" class="btn-primary" @click="crearDeuda">Registrar deuda</button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
