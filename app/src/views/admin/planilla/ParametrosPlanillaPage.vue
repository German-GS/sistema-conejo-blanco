<script setup>
import { exito } from '../../../lib/avisos.js';
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';
import { formatearFecha } from '../../../lib/format.js';
import HorarioSemanalEditor from '../../../components/HorarioSemanalEditor.vue';

const GRUPOS = [
  { tipo: 'deduccion_empleado', titulo: 'Deducciones del empleado (CCSS y Banco Popular)' },
  { tipo: 'carga_patronal', titulo: 'Cargas sociales patronales' },
  { tipo: 'provision', titulo: 'Provisiones (aguinaldo, vacaciones, cesantía)' },
  { tipo: 'renta', titulo: 'Impuesto sobre la renta (tramos mensuales)' },
  { tipo: 'credito_fiscal', titulo: 'Créditos fiscales' },
  { tipo: 'jornada', titulo: 'Jornada, almuerzo y horas extra' },
];

const auth = useAuthStore();
// Los parámetros de ley (cargas sociales, renta, provisiones, recargos) solo los modifica el gerente general.
const esDeLey = (p) => p.tipo !== 'jornada' || p.nombre.startsWith('FACTOR_');
const puedeEditar = (p) => !esDeLey(p) || auth.puedeEditarLey;
const parametros = ref([]);
const feriados = ref([]);
const valores = reactive({});
const error = ref('');
const aviso = ref('');
// ---- Horario de la fábrica ----
const horario = ref(null);
const horarioMsg = ref('');
const horarioError = ref('');
const guardandoHorario = ref(false);
async function cargarHorario() {
  horario.value = { lun: null, mar: null, mie: null, jue: null, vie: null, sab: null, ...(await api.get('/planilla/horario-base')) };
}
async function guardarHorario() {
  horarioError.value = '';
  horarioMsg.value = '';
  guardandoHorario.value = true;
  try {
    const r = await api.patch('/planilla/horario-base', horario.value);
    horarioMsg.value = `Horario guardado. ${r.recalculados} día(s) pendientes ya importados se volvieron a calcular.`;
  } catch (err) {
    horarioError.value = err instanceof ApiError ? err.message : 'No se pudo guardar el horario.';
  } finally {
    guardandoHorario.value = false;
  }
}

// ---- Puestos de trabajo ----
const puestos = ref([]);
const nuevoPuesto = reactive({ nombre: '', esConfianza: false, sector: 'industria' });
const errorPuesto = ref('');
async function cargarPuestos() {
  puestos.value = await api.get('/planilla/puestos');
}
async function crearPuesto() {
  errorPuesto.value = '';
  try {
    await api.post('/planilla/puestos', { nombre: nuevoPuesto.nombre.trim(), esConfianza: nuevoPuesto.esConfianza, sector: nuevoPuesto.sector });
    Object.assign(nuevoPuesto, { nombre: '', esConfianza: false, sector: 'industria' });
    await cargarPuestos();
  } catch (err) {
    errorPuesto.value = err instanceof ApiError ? err.message : 'No se pudo agregar el puesto.';
  }
}
async function cambiarPuesto(p, cambios) {
  try {
    await api.patch(`/planilla/puestos/${p.id}`, cambios);
    await cargarPuestos();
  } catch (err) {
    errorPuesto.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  }
}

// ---- Banco Popular (planilla web) ----
const bp = ref(null);
const bpOk = ref(false);
const bpError = ref('');
async function cargarBp() {
  bp.value = await api.get('/planilla/banco-popular/config');
}
async function guardarBp() {
  bpError.value = '';
  bpOk.value = false;
  try {
    const { id: _id, ...campos } = bp.value;
    bp.value = await api.patch('/planilla/banco-popular/config', { ...campos, convenio: Number(campos.convenio) });
    bpOk.value = true;
  } catch (err) {
    bpError.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  }
}
const nuevoFeriado = reactive({ fecha: '', nombre: '', pagoObligatorio: true });

async function cargar() {
  const [p, f] = await Promise.all([api.get('/planilla/parametros'), api.get('/planilla/feriados')]);
  parametros.value = p;
  feriados.value = f;
  for (const x of p) valores[x.id] = Number(x.valor);
}
onMounted(() => {
  cargar().catch((e) => (error.value = e.message));
  cargarBp().catch(() => {});
  cargarPuestos().catch(() => {});
  cargarHorario().catch(() => {});
});

async function guardar(p) {
  error.value = '';
  aviso.value = '';
  try {
    await api.patch(`/planilla/parametros/${p.id}`, { valor: Number(valores[p.id]) });
    exito(`${p.nombre}: guardado.`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  }
}
async function agregarFeriado() {
  error.value = '';
  try {
    await api.post('/planilla/feriados', { ...nuevoFeriado });
    Object.assign(nuevoFeriado, { fecha: '', nombre: '', pagoObligatorio: true });
    feriados.value = await api.get('/planilla/feriados');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo agregar el feriado.';
  }
}
async function quitarFeriado(f) {
  await api.delete(`/planilla/feriados/${f.id}`);
  feriados.value = feriados.value.filter((x) => x.id !== f.id);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Parámetros de planilla</h1>
    <p class="text-sm text-slate-500">
      Porcentajes y reglas que usa el cálculo. Cambiarlos afecta las planillas que se calculen de ahora en adelante;
      las planillas ya aprobadas no se tocan. Confirme los valores vigentes con el contador.
    </p>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm font-medium text-teal-700">{{ aviso }}</p>

    <div v-for="g in GRUPOS" :key="g.tipo" class="card flex flex-col gap-2">
      <p class="text-base font-semibold text-slate-900">{{ g.titulo }}</p>
      <div v-for="p in parametros.filter((x) => x.tipo === g.tipo)" :key="p.id" class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-slate-800">{{ p.nombre }}</p>
          <p class="text-xs text-slate-500">{{ p.descripcion }}</p>
        </div>
        <div class="flex items-center gap-2">
          <input v-model="valores[p.id]" type="number" step="0.0001" class="input w-36" :disabled="!puedeEditar(p)" />
          <button v-if="puedeEditar(p)" type="button" class="btn-secondary" :disabled="Number(valores[p.id]) === Number(p.valor)" @click="guardar(p)">Guardar</button>
          <span v-else class="text-xs text-slate-500" title="Solo el gerente general o el administrador del sistema modifican los parámetros de ley">Solo gerente general o sistema</span>
        </div>
      </div>
    </div>

    <div v-if="horario" class="card flex flex-col gap-3">
      <div>
        <p class="text-base font-semibold text-slate-900">Horario de la fábrica</p>
        <p class="text-sm text-slate-500">
          Entrada y salida de cada día. Lo usan todos los empleados que no tienen un horario propio. De esto sale cuántas
          horas ordinarias tiene cada día: por ejemplo, si el martes se sale a las 6 p. m., ese día las horas ordinarias son 9
          y la hora extra empieza después. Con lunes y viernes de 8 a 5, martes a jueves de 8 a 6 y sábado de 8 a 1, la semana
          suma las 48 horas.
        </p>
      </div>
      <HorarioSemanalEditor v-model="horario" />
      <p v-if="horarioError" class="text-sm font-medium text-red-600">{{ horarioError }}</p>
      <p v-if="horarioMsg" class="text-sm font-medium text-teal-700">{{ horarioMsg }}</p>
      <button type="button" class="btn-primary w-fit" :disabled="guardandoHorario" @click="guardarHorario">{{ guardandoHorario ? 'Guardando…' : 'Guardar horario de la fábrica' }}</button>
    </div>

    <div class="card flex flex-col gap-3">
      <div>
        <p class="text-base font-semibold text-slate-900">Puestos de trabajo</p>
        <p class="text-sm text-slate-500">
          Lista de puestos que se elige al crear un empleado. Un <strong>puesto de confianza</strong> (gerentes,
          administradores y cargos sin fiscalización inmediata, art. 143 del Código de Trabajo) no tiene jornada fija:
          no se le descuentan horas faltantes ni se le pagan horas extra. Al elegir el puesto, el empleado hereda esa
          marca y se puede ajustar en su ficha. El <strong>sector</strong> define cómo se paga el domingo a quien cobra por
          semana: en <strong>comercio</strong> el descanso ya viene incluido (la hora vale el salario semanal ÷ 56); en
          <strong>industria</strong> se paga solo el tiempo laborado de lunes a sábado (÷ 48) y el domingo no se paga si no
          se trabaja. Con salario mensual o quincenal el domingo siempre viene incluido.
        </p>
      </div>
      <ul class="flex flex-col divide-y divide-slate-100">
        <li v-for="p in puestos" :key="p.id" class="flex flex-wrap items-center justify-between gap-2 py-1.5" :class="!p.activo && 'opacity-50'">
          <span class="text-sm font-medium text-slate-800">{{ p.nombre }}</span>
          <span class="flex items-center gap-4 text-sm">
            <select class="input w-36" :value="p.sector" @change="cambiarPuesto(p, { sector: $event.target.value })">
              <option value="industria">Industria</option>
              <option value="comercio">Comercio</option>
            </select>
            <label class="flex items-center gap-1.5 text-slate-600"><input type="checkbox" class="size-4" :checked="p.esConfianza" @change="cambiarPuesto(p, { esConfianza: $event.target.checked })" /> De confianza</label>
            <button type="button" class="font-semibold text-blue-700 underline" @click="cambiarPuesto(p, { activo: !p.activo })">{{ p.activo ? 'Desactivar' : 'Activar' }}</button>
          </span>
        </li>
      </ul>
      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-56 flex-1"><label class="label">Nuevo puesto</label><input v-model="nuevoPuesto.nombre" class="input" placeholder="Ej. Jefe de Bodega" /></div>
        <div>
          <label class="label">Sector</label>
          <select v-model="nuevoPuesto.sector" class="input w-36"><option value="industria">Industria</option><option value="comercio">Comercio</option></select>
        </div>
        <label class="flex items-center gap-2 pb-2.5 text-sm text-slate-700"><input v-model="nuevoPuesto.esConfianza" type="checkbox" class="size-4" /> De confianza</label>
        <button type="button" class="btn-primary" :disabled="nuevoPuesto.nombre.trim().length < 2" @click="crearPuesto">Agregar</button>
      </div>
      <p v-if="errorPuesto" class="text-sm font-medium text-red-600">{{ errorPuesto }}</p>
    </div>

    <div v-if="bp" class="card flex flex-col gap-3">
      <div>
        <p class="text-base font-semibold text-slate-900">Banco Popular — planilla web</p>
        <p class="text-sm text-slate-500">
          Datos de la empresa que van en el archivo TXT de la planilla web (los mismos de la hoja «Datos_Empresa» del
          Excel del banco). Se llenan una vez.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label class="label">Nombre de la empresa (como en el banco)</label><input v-model="bp.nombreEmpresa" class="input" /></div>
        <div><label class="label">Cédula jurídica (solo números)</label><input v-model="bp.cedulaPatrono" class="input" placeholder="3102123456" /></div>
        <div><label class="label">Número de patrono</label><input v-model="bp.numeroPatrono" class="input" placeholder="Ej. 31021234561" /></div>
        <div><label class="label">Identificador único de cliente (de la empresa)</label><input v-model="bp.identificadorCliente" class="input" /></div>
        <div>
          <label class="label">Convenio</label>
          <select v-model="bp.convenio" class="input"><option :value="1">1 — Colones</option><option :value="2">2 — Dólares</option></select>
        </div>
        <div>
          <label class="label">Moneda</label>
          <select v-model="bp.moneda" class="input"><option value="CRC">CRC — Colones</option><option value="USD">USD — Dólares</option></select>
        </div>
        <div class="sm:col-span-2"><label class="label">IBAN de la cuenta de la empresa (la que se debita)</label><input v-model="bp.cuentaPatrono" class="input" placeholder="CR + 20 dígitos" /></div>
      </div>
      <p v-if="bpError" class="text-sm font-medium text-red-600">{{ bpError }}</p>
      <p v-if="bpOk" class="text-sm font-medium text-teal-700">Guardado.</p>
      <button type="button" class="btn-primary w-fit" @click="guardarBp">Guardar datos del banco</button>
    </div>

    <div class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">Feriados</p>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="f in feriados" :key="f.id" class="flex items-center justify-between">
          <span>{{ formatearFecha(f.fecha) }} — {{ f.nombre }} <span class="text-slate-500">({{ f.pagoObligatorio ? 'pago obligatorio' : 'pago no obligatorio' }})</span></span>
          <button type="button" class="font-semibold text-red-700 underline" @click="quitarFeriado(f)">Quitar</button>
        </li>
        <li v-if="feriados.length === 0" class="text-slate-500">Sin feriados cargados. Agregalos para que el día se pague correctamente.</li>
      </ul>
      <div class="flex flex-wrap items-end gap-2">
        <div><label class="label">Fecha</label><input v-model="nuevoFeriado.fecha" type="date" class="input" /></div>
        <div class="min-w-48 flex-1"><label class="label">Nombre</label><input v-model="nuevoFeriado.nombre" class="input" /></div>
        <label class="flex items-center gap-2 pb-3 text-sm text-slate-700"><input v-model="nuevoFeriado.pagoObligatorio" type="checkbox" class="size-4" /> Pago obligatorio</label>
        <button type="button" class="btn-primary" :disabled="!nuevoFeriado.fecha || nuevoFeriado.nombre.trim().length < 2" @click="agregarFeriado">Agregar</button>
      </div>
    </div>
  </div>
</template>
