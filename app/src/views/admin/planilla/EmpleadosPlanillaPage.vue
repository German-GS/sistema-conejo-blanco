<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { Search } from '@lucide/vue';
import CesePanel from '../../../components/CesePanel.vue';
import HorarioSemanalEditor from '../../../components/HorarioSemanalEditor.vue';
import { formatearColones, formatearFecha, fechaHoyISO } from '../../../lib/format.js';

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
    esConfianza: false,
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
    [e.nombre, e.puesto, e.cedula, e.numeroReloj, e.iban, e.identificadorBp, e.esDeTienda ? 'tienda' : '', e.fechaCese ? 'cesado' : ''].join(' '),
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
    puestoId: e.puestoId ?? '',
    esConfianza: e.esConfianza === true,
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
      esConfianza: form.esConfianza,
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
  const horasDia = horas > 0 ? horas / 6 : 8;
  const contrato = horas > 0 ? ` Tiene un contrato especial de ${horas} horas ordinarias por semana: hasta ${Math.floor(horasDia)}:${String(Math.round((horasDia % 1) * 60)).padStart(2, '0')} horas al día se pagan como ordinarias, no como extra.` : '';
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
  if (!window.confirm(`¿Reactivar a ${e.nombre}? Vuelve a aparecer en las planillas.`)) return;
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
  if (!window.confirm('¿Cerrar esta deuda? Si ya se le descontó algo, lo que falta por cobrar se da de baja como gasto; si no se descontó nada, se reversa el préstamo.')) return;
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
        <button type="button" class="btn-primary" @click="nuevo">Nuevo empleado</button>
      </div>
    </div>

    <div class="relative max-w-xl">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
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
            <option value="">{{ form.puesto ? `Otro: ${form.puesto}` : 'Elegí un puesto…' }}</option>
            <option v-for="p in puestos.filter((x) => x.activo)" :key="p.id" :value="p.id">{{ p.nombre }}{{ p.esConfianza ? ' (de confianza)' : '' }}</option>
          </select>
          <input v-if="!form.puestoId" v-model="form.puesto" type="text" class="input mt-1" placeholder="O escribí otro puesto" />
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
            faltantes ni se les pagan horas extra, y sus marcas son solo informativas.
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
            Parte del horario de la fábrica. Si esta persona tiene otro horario, cambiá lo que haga falta en la tabla: queda
            como horario propio. Si no se toca, sigue el de la fábrica y se actualiza cuando ese cambie. (Un contrato especial
            de horas por semana, más abajo, manda sobre el horario.)
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
          <label class="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input v-model="form.marcaReloj" type="checkbox" class="mt-0.5 size-4" />
            <span>
              <strong>Usa el reloj de huella.</strong> Si lo desmarcás (por ejemplo, gerencia que no marca), no se le piden
              marcas: en la planilla se le paga la jornada completa y no aparece como «sin marcas».
            </span>
          </label>
          <div v-if="!form.esConfianza" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="label">Contrato especial: horas ordinarias por semana</label>
              <input v-model="form.horasSemana" type="number" min="30" max="72" step="0.5" class="input" placeholder="Vacío = 48 (jornada normal)" />
              <p class="mt-1 text-xs text-slate-500">Solo para quien tiene un contrato con más horas ordinarias que las normales (ej. 56). Esas horas <strong>no se pagan como extra</strong>: el día ordinario pasa a ser horas ÷ 6, y la hora vale el salario semanal ÷ las horas del contrato.</p>
            </div>
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

    <p v-if="cargando" class="text-base text-slate-500">Cargando…</p>
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
              <span v-if="e.esConfianza" class="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">De confianza</span>
              <span v-if="e.activo && !e.marcaReloj" class="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">No usa el reloj</span>
            </p>
            <p class="text-sm text-slate-500">
              {{ e.puesto || 'Sin puesto' }} · {{ etiqueta(TIPOS, e.tipoSalario) }}
              {{ formatearColones(e.montoSalario) }} bruto · pago {{ etiqueta(FRECUENCIAS, e.frecuenciaPago).toLowerCase() }}
            </p>
          </div>
          <div class="flex gap-3 text-sm font-semibold text-blue-700">
            <button type="button" class="underline" @click="abrirDeudas(e)">Deudas</button>
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
