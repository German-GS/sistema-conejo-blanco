<script setup>
import { confirmar } from '../../../lib/confirmar.js';
import { useAuthStore } from '../../../stores/auth.js';
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError, descargarArchivo, obtenerArchivo } from '../../../lib/api.js';
import CesePanel from '../../../components/CesePanel.vue';
import { fechaHoyISO, formatearColones, formatearFecha } from '../../../lib/format.js';

const ESTADOS = {
  borrador: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
  anulada: 'bg-slate-200 text-slate-600',
};
const auth = useAuthStore();
const planillas = ref([]);
const error = ref('');
const nueva = reactive({ frecuencia: 'semanal', fechaDesde: fechaHoyISO() });
const creando = ref(false);

const detalle = ref(null); // { planilla, pendientes, conDiasSinDatos }
const lineaAbierta = ref(null);
const aceptarSinDatos = ref(false);
const trabajando = ref(false);

async function cargar() {
  planillas.value = await api.get('/planilla/planillas');
}
onMounted(async () => {
  try {
    await cargar();
    // La planilla nueva arranca en la semana del último archivo del reloj
    // importado (si no hay ninguno, queda la fecha de hoy).
    const importaciones = await api.get('/planilla/asistencia/importaciones');
    if (importaciones[0]) nueva.fechaDesde = importaciones[0].periodoDesde;
  } catch (e) {
    error.value = e.message;
  }
});

// Borrar un borrador desde la lista (las aprobadas y pagadas no se pueden borrar).
async function eliminarDeLista(pl) {
  if (!await confirmar(`¿Eliminar el borrador del ${formatearFecha(pl.fechaDesde)} al ${formatearFecha(pl.fechaHasta)}? Se puede volver a calcular después.`)) return;
  await ejecutar(async () => {
    await api.delete(`/planilla/planillas/${pl.id}`);
    await cargar();
  }, 'No se pudo eliminar el borrador.');
}

async function ejecutar(fn, mensajeError) {
  error.value = '';
  trabajando.value = true;
  try {
    await fn();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : mensajeError;
  } finally {
    trabajando.value = false;
  }
}
const crear = () =>
  ejecutar(async () => {
    creando.value = true;
    try {
      const p = await api.post('/planilla/planillas', { ...nueva });
      await cargar();
      await abrir(p.id);
    } finally {
      creando.value = false;
    }
  }, 'No se pudo crear la planilla.');

async function abrir(id) {
  bp.value = null;
  aceptarSinDatos.value = false;
  lineaAbierta.value = null;
  detalle.value = await api.get(`/planilla/planillas/${id}`);
}
// Viáticos de un empleado en este borrador: fuera de los cálculos de planilla (sin CCSS ni renta), solo se suman al neto.
// Cada viático lleva su justificante (para qué fue y qué comprobante tiene): sin él no se sabe si es reembolso o salario.
const viaticosEdicion = reactive({});
const justificanteEdicion = reactive({});
const viaticosDe = (l) => (viaticosEdicion[l.id] ?? (Number(l.viaticos) > 0 ? String(Number(l.viaticos)) : ''));
const justificanteDe = (l) => justificanteEdicion[l.id] ?? l.detalle?.viaticosJustificante ?? '';
const guardarViaticos = (l) =>
  ejecutar(async () => {
    const texto = String(viaticosDe(l)).replace(/[^\d.]/g, '');
    const monto = texto === '' ? 0 : Number(texto);
    const justificante = justificanteDe(l).trim();
    if (monto === Number(l.viaticos) && justificante === (l.detalle?.viaticosJustificante ?? '')) return;
    if (monto > 0 && justificante.length < 3) {
      error.value = `Anote el justificante de los viáticos de ${l.empleadoNombre} (para qué fue y qué comprobante tiene).`;
      return;
    }
    await api.patch(`/planilla/planillas/${detalle.value.planilla.id}/viaticos`, { empleadoId: l.empleadoId, monto, justificante });
    detalle.value = await api.get(`/planilla/planillas/${detalle.value.planilla.id}`);
    delete viaticosEdicion[l.id];
    delete justificanteEdicion[l.id];
  }, 'No se pudieron guardar los viáticos.');
const recalcular = () =>
  ejecutar(async () => {
    await api.post(`/planilla/planillas/${detalle.value.planilla.id}/recalcular`, {});
    await abrir(detalle.value.planilla.id);
  }, 'No se pudo recalcular.');
// Aprobar registra el asiento contable y baja los saldos de deudas, préstamos y embargos: se pide confirmar para no hacerlo por error.
async function aprobar() {
  const pl = detalle.value.planilla;
  const lineas = [
    `Planilla ${pl.frecuencia} del ${formatearFecha(pl.fechaDesde)} al ${formatearFecha(pl.fechaHasta)}: ${pl.lineas.length} empleados.`,
    `Neto a pagar ${m(pl.totalNeto)}; bruto ${m(pl.totalBruto)}.`,
    'Se registra el asiento contable y se descuentan los saldos de deudas, préstamos y embargos. Después solo se puede anular o, el administrador del sistema, deshacer.',
  ];
  if (!(await confirmar('¿Aprobar y generar el asiento de esta planilla?', { detalle: lineas, aceptar: 'Sí, aprobar y generar asiento', cancelar: 'Todavía no' }))) return;
  await ejecutar(async () => {
    await api.post(`/planilla/planillas/${detalle.value.planilla.id}/aprobar`, { aceptarDiasSinDatos: aceptarSinDatos.value });
    await Promise.all([abrir(detalle.value.planilla.id), cargar()]);
  }, 'No se pudo aprobar.');
}

// Solo el administrador del sistema: borra el asiento de una aprobación hecha por error y la planilla vuelve a borrador (sin reversas en los libros).
async function deshacerAprobacion() {
  const pl = detalle.value.planilla;
  const ok = await confirmar(`¿Deshacer la aprobación de la planilla del ${formatearFecha(pl.fechaDesde)} al ${formatearFecha(pl.fechaHasta)}?`, {
    detalle: ['Se BORRA su asiento contable (no queda reversa en los libros) y se devuelven los saldos de deudas, préstamos y embargos.', 'La planilla vuelve a borrador: se puede recalcular y aprobar de nuevo, o eliminar.', 'En la bitácora queda una línea de quién lo hizo. No sirve si ya está pagada o el mes está cerrado.'],
    aceptar: 'Sí, deshacer la aprobación',
    palabra: 'DESHACER',
  });
  if (!ok) return;
  await ejecutar(async () => {
    await api.post(`/planilla/planillas/${pl.id}/deshacer-aprobacion`, {});
    await Promise.all([abrir(pl.id), cargar()]);
  }, 'No se pudo deshacer la aprobación.');
}
// ---- Pago, reversa del pago y anulación ----
const cuentasPago = ref([]);
const formPago = reactive({ cuentaBancariaId: '', fecha: fechaHoyISO() });
const motivoAccion = ref('');
const accionAbierta = ref(''); // '' | 'pagar' | 'reversar-pago' | 'anular'

async function abrirAccion(accion) {
  accionAbierta.value = accionAbierta.value === accion ? '' : accion;
  motivoAccion.value = '';
  error.value = '';
  if (accion === 'pagar' && cuentasPago.value.length === 0) {
    try {
      cuentasPago.value = await api.get('/cuentas-bancarias?activas=true');
    } catch {
      /* sin la lista se paga desde la caja general */
    }
  }
  if (accion === 'pagar') formPago.fecha = fechaHoyISO();
}
const pagar = () =>
  ejecutar(async () => {
    await api.post(`/planilla/planillas/${detalle.value.planilla.id}/pagar`, {
      ...(formPago.cuentaBancariaId ? { cuentaBancariaId: formPago.cuentaBancariaId } : {}),
      fecha: formPago.fecha,
    });
    accionAbierta.value = '';
    await Promise.all([abrir(detalle.value.planilla.id), cargar()]);
  }, 'No se pudo registrar el pago.');
const reversar = (accion) =>
  ejecutar(async () => {
    await api.post(`/planilla/planillas/${detalle.value.planilla.id}/${accion}`, { motivo: motivoAccion.value.trim() });
    accionAbierta.value = '';
    await Promise.all([abrir(detalle.value.planilla.id), cargar()]);
  }, 'No se pudo completar la acción.');
const eliminar = () =>
  ejecutar(async () => {
    await api.delete(`/planilla/planillas/${detalle.value.planilla.id}`);
    detalle.value = null;
    await cargar();
  }, 'No se pudo eliminar.');
const libro = () =>
  ejecutar(() => descargarArchivo(`/planilla/planillas/${detalle.value.planilla.id}/libro`, 'libro-salarios.xlsx'), 'No se pudo descargar.');

// ---- Colillas de pago (PDF, media carta) ----
const urlColilla = (l) => `/planilla/planillas/${detalle.value.planilla.id}/colillas/${l.empleadoId}/pdf`;
const colilla = (l) => ejecutar(() => descargarArchivo(urlColilla(l), 'colilla.pdf'), 'No se pudo generar la colilla.');
const colillasTodas = () =>
  ejecutar(() => descargarArchivo(`/planilla/planillas/${detalle.value.planilla.id}/colillas/pdf`, 'colillas.pdf'), 'No se pudieron generar las colillas.');
const avisoCompartir = ref('');
// En el celular abre la hoja de compartir (WhatsApp, etc.) con el PDF adjunto;
// si el equipo no puede compartir archivos, lo descarga para adjuntarlo a mano.
const compartirColilla = (l) =>
  ejecutar(async () => {
    avisoCompartir.value = '';
    const archivo = await obtenerArchivo(urlColilla(l), 'colilla.pdf');
    const datos = { files: [archivo], title: `Colilla de pago — ${l.empleadoNombre}`, text: `Colilla de pago de ${l.empleadoNombre}` };
    if (navigator.canShare?.(datos)) {
      try {
        await navigator.share(datos);
      } catch (err) {
        if (err?.name !== 'AbortError') throw err; // cerrar la hoja de compartir no es un error
      }
      return;
    }
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.name;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    avisoCompartir.value = `Se descargó ${archivo.name}. Adjúntelo en WhatsApp desde sus descargas.`;
  }, 'No se pudo compartir la colilla.');

// ---- Empleados sin marcas: ¿siguen trabajando o ya no laboran? ----
const ceseEmp = ref(null); // { id, nombre }
const ceseHecho = ref(false);
const diaAntes = (f) => {
  const d = new Date(`${f}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const noUsaReloj = (c) =>
  ejecutar(async () => {
    await api.patch(`/planilla/empleados/${c.empleadoId}`, { marcaReloj: false });
    await api.post(`/planilla/planillas/${detalle.value.planilla.id}/recalcular`, {});
    await abrir(detalle.value.planilla.id);
  }, 'No se pudo actualizar al empleado.');
function abrirCese(c) {
  ceseHecho.value = false;
  ceseEmp.value = { id: c.empleadoId, nombre: c.empleado };
}
async function cerrarCese() {
  ceseEmp.value = null;
  if (ceseHecho.value) {
    await ejecutar(async () => {
      await api.post(`/planilla/planillas/${detalle.value.planilla.id}/recalcular`, {});
      await abrir(detalle.value.planilla.id);
    }, 'No se pudo recalcular.');
  }
}

// ---- Archivo del Banco Popular ----
const bp = ref(null);
async function revisarBp() {
  error.value = '';
  try {
    // La descripción sale sola del período (ej. «SEMANAL 19 AL 25 OCT»): el banco rechaza símbolos como «/».
    bp.value = await api.get(`/planilla/planillas/${detalle.value.planilla.id}/banco-popular`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo preparar el archivo.';
  }
}
const descargarBp = () =>
  ejecutar(() => descargarArchivo(`/planilla/planillas/${detalle.value.planilla.id}/banco-popular/txt`, 'planilla-banco-popular.txt'), 'No se pudo descargar el archivo.');

const m = (v) => formatearColones(v);
const fechaCorta = (f) => formatearFecha(f).slice(0, 5);
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Planillas</h1>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div v-if="!detalle" class="flex flex-col gap-6">
      <div class="card flex flex-wrap items-end gap-3">
        <div>
          <label class="label">Frecuencia</label>
          <select v-model="nueva.frecuencia" class="input">
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>
        <div>
          <label class="label">{{ nueva.frecuencia === 'semanal' ? 'Primer día (lunes de la semana)' : 'Una fecha dentro del período' }}</label>
          <input v-model="nueva.fechaDesde" type="date" class="input" />
        </div>
        <button type="button" class="btn-primary" :disabled="creando" @click="crear">{{ creando ? 'Calculando…' : 'Calcular planilla' }}</button>
      </div>

      <p v-if="planillas.length === 0" class="text-base text-slate-500">Todavía no hay planillas.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="p in planillas" :key="p.id" class="card flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-base font-semibold text-slate-900">
              {{ formatearFecha(p.fechaDesde) }} al {{ formatearFecha(p.fechaHasta) }} · {{ p.frecuencia }}
              <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[p.estado]">{{ p.estado }}</span>
            </p>
            <p class="text-sm text-slate-500">Bruto {{ m(p.totalBruto) }} · Neto {{ m(p.totalNeto) }}</p>
          </div>
          <div class="flex items-center gap-4">
            <button v-if="p.estado === 'borrador'" type="button" class="text-sm font-semibold text-red-700 underline" @click="eliminarDeLista(p)">Eliminar borrador</button>
            <button type="button" class="text-sm font-semibold text-blue-700 underline" @click="abrir(p.id)">Abrir</button>
          </div>
        </li>
      </ul>
    </div>

    <div v-else class="flex flex-col gap-4">
      <button type="button" class="w-fit text-sm font-semibold text-blue-700 underline" @click="detalle = null">← Volver a planillas</button>
      <div class="card flex flex-col gap-3">
        <p class="text-lg font-bold text-slate-900">
          Planilla {{ detalle.planilla.frecuencia }} · {{ formatearFecha(detalle.planilla.fechaDesde) }} al {{ formatearFecha(detalle.planilla.fechaHasta) }}
          <span class="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" :class="ESTADOS[detalle.planilla.estado]">{{ detalle.planilla.estado }}</span>
        </p>
        <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <div><p class="text-slate-500">Bruto</p><p class="font-semibold">{{ m(detalle.planilla.totalBruto) }}</p></div>
          <div><p class="text-slate-500">Deducciones</p><p class="font-semibold">{{ m(detalle.planilla.totalDeducciones) }}</p></div>
          <div><p class="text-slate-500">Neto a pagar</p><p class="font-semibold">{{ m(detalle.planilla.totalNeto) }}</p></div>
          <div><p class="text-slate-500">Cargas patronales</p><p class="font-semibold">{{ m(detalle.planilla.totalCargasPatronales) }}</p></div>
          <div><p class="text-slate-500">Provisiones</p><p class="font-semibold">{{ m(detalle.planilla.totalProvisiones) }}</p></div>
        </div>
        <p v-if="detalle.netoSinDeposito > 0" class="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
          <strong>Neto a depositar: {{ m(Number(detalle.planilla.totalNeto) - detalle.netoSinDeposito) }}.</strong>
          Del neto de arriba, {{ m(detalle.netoSinDeposito) }} es de {{ detalle.sinDeposito.map((s) => s.nombre).join(', ') }}: se calculan y se pagan sus cargas, pero <strong>no se les deposita</strong> (no van al archivo del banco ni al pago de la planilla).
        </p>

        <div v-if="detalle.planilla.estado === 'borrador'" class="flex flex-col gap-2">
          <p v-if="detalle.pendientes" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Hay {{ detalle.pendientes }} día(s) con marcas faltantes o ambiguas. Resuélvalos en Asistencia y recalcule; mientras tanto no se puede aprobar.
          </p>
          <div v-if="detalle.conDiasSinDatos.some((c) => c.deTienda)" class="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p class="font-semibold">Faltan las horas de tienda:</p>
            <ul class="my-1 list-disc pl-5">
              <li v-for="c in detalle.conDiasSinDatos.filter((x) => x.deTienda)" :key="c.empleadoId">
                <strong>{{ c.empleado }}</strong> — {{ c.dias }} día(s) sin horas
                <router-link :to="{ name: 'planilla-asistencia', query: { tienda: c.empleadoId, desde: detalle.planilla.fechaDesde } }" class="ml-1 font-semibold underline">Meter sus horas</router-link>
              </li>
            </ul>
            <p class="text-xs">No marcan en el reloj de la fábrica, así que sus horas se meten a mano en Asistencia. Después vuelva acá y toque «Recalcular».</p>
          </div>
          <div v-if="detalle.conDiasSinDatos.some((c) => !c.deTienda)" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p class="font-semibold">
              {{ detalle.conDiasSinDatos.filter((c) => !c.deTienda).length }} empleado(s) no tienen marcas del reloj en este período:
            </p>
            <ul class="my-2 flex flex-col gap-2">
              <li v-for="c in detalle.conDiasSinDatos.filter((x) => !x.deTienda)" :key="c.empleadoId" class="rounded-lg border border-amber-200 bg-white p-2">
                <p>
                  <strong>{{ c.empleado }}</strong> — {{ c.dias }} día(s) sin marcas<template v-if="c.fechas.length">
                    ({{ fechaCorta(c.fechas[0]) }}<template v-if="c.fechas.length > 1"> al {{ fechaCorta(c.fechas[c.fechas.length - 1]) }}</template>)</template>
                </p>
                <div class="mt-1 flex flex-wrap gap-2">
                  <button type="button" class="rounded-md border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800" :disabled="trabajando" @click="noUsaReloj(c)">
                    Sigue trabajando pero no usa el reloj (pagar siempre completo)
                  </button>
                  <button type="button" class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800" @click="abrirCese(c)">Ya no labora (dar de baja)</button>
                </div>
                <CesePanel
                  v-if="ceseEmp?.id === c.empleadoId"
                  :key="c.empleadoId"
                  class="mt-2"
                  :empleado-id="c.empleadoId"
                  :nombre="c.empleado"
                  :fecha-sugerida="diaAntes(detalle.planilla.fechaDesde)"
                  @hecho="ceseHecho = true"
                  @cancelar="cerrarCese"
                />
              </li>
            </ul>
            <p class="text-xs">
              No aparecen en el archivo del reloj que importó, así que el sistema no sabe si trabajaron. Elija qué pasa
              con cada uno: si no usa el reloj (por ejemplo gerencia) se le paga siempre la jornada completa y no vuelve a
              aparecer acá; si ya no trabaja, se da de baja y se estima su liquidación. Si sí debería tener marcas,
              <router-link :to="{ name: 'planilla-asistencia' }" class="font-semibold underline">importe su archivo en Asistencia</router-link> y vuelva a calcular.
            </p>
            <label class="mt-2 flex items-center gap-2"><input v-model="aceptarSinDatos" type="checkbox" class="size-4" /> Pagar igual la jornada completa a estos empleados</label>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" :disabled="trabajando" @click="recalcular">Recalcular</button>
            <button type="button" class="btn-primary" :disabled="trabajando || detalle.pendientes > 0" @click="aprobar">Aprobar y generar asiento</button>
            <button type="button" class="btn-danger" :disabled="trabajando" @click="eliminar">Eliminar borrador</button>
          </div>
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button v-if="detalle.planilla.estado === 'aprobada'" type="button" class="btn-primary" :disabled="trabajando" @click="abrirAccion('pagar')">Registrar pago</button>
          <button v-if="detalle.planilla.estado === 'aprobada'" type="button" class="btn-secondary" :disabled="trabajando" @click="abrirAccion('anular')">Anular planilla</button>
          <button v-if="detalle.planilla.estado === 'aprobada' && auth.esSistema" type="button" class="btn-danger" :disabled="trabajando" title="Aprobada por error: borra su asiento y la devuelve a borrador" @click="deshacerAprobacion">Deshacer aprobación (sin rastro)</button>
          <button v-if="detalle.planilla.estado === 'pagada'" type="button" class="btn-secondary" :disabled="trabajando" @click="abrirAccion('reversar-pago')">Reversar pago</button>
        </div>

        <div v-if="accionAbierta === 'pagar'" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="mb-2 text-sm text-slate-700">El pago baja "Salarios por pagar" y sale de la cuenta que elijas.</p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label class="label">Pagado desde</label>
              <select v-model="formPago.cuentaBancariaId" class="input">
                <option value="">Caja general (efectivo)</option>
                <option v-for="c in cuentasPago.filter((x) => !x.esCaja)" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </select>
            </div>
            <div><label class="label">Fecha del pago</label><input v-model="formPago.fecha" type="date" :max="fechaHoyISO()" class="input" /></div>
          </div>
          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-secondary" @click="accionAbierta = ''">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="trabajando || !formPago.fecha" @click="pagar">Confirmar pago</button>
          </div>
        </div>
        <div v-if="accionAbierta === 'anular' || accionAbierta === 'reversar-pago'" class="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p class="mb-2 text-sm text-amber-900">
            <template v-if="accionAbierta === 'anular'">Se reversa el asiento de la planilla, se devuelven a las deudas de los empleados lo que se les descontó, y puede generar otra planilla del mismo período. Nada se borra.</template>
            <template v-else>Se reversa el asiento del pago y la planilla vuelve a "aprobada" para registrar el pago de nuevo.</template>
          </p>
          <input v-model="motivoAccion" class="input" placeholder="Motivo (obligatorio)" />
          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-secondary" @click="accionAbierta = ''">Cancelar</button>
            <button type="button" class="btn-danger" :disabled="trabajando || motivoAccion.trim().length < 5" @click="reversar(accionAbierta)">Confirmar</button>
          </div>
        </div>
        <p v-if="detalle.planilla.estado === 'anulada'" class="text-sm text-slate-600">Planilla anulada{{ detalle.planilla.motivoAnulacion ? ` — ${detalle.planilla.motivoAnulacion}` : '' }}. Su asiento fue reversado.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary w-fit" :disabled="trabajando" @click="libro">Descargar libro de salarios (Excel)</button>
          <button type="button" class="btn-secondary w-fit" :disabled="trabajando" @click="colillasTodas">Colillas de pago (PDF, media carta)</button>
        </div>
        <p v-if="avisoCompartir" class="text-sm font-medium text-green-700">{{ avisoCompartir }}</p>
      </div>

      <div v-if="detalle.planilla.estado !== 'borrador'" class="card flex flex-col gap-3">
        <div>
          <p class="text-base font-semibold text-slate-900">Pago por el Banco Popular</p>
          <p class="text-sm text-slate-500">Genera el TXT para subir a la planilla web del banco, sin pasar por el Excel.</p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <p class="min-w-64 flex-1 text-sm text-slate-600">La descripción del archivo se pone sola con el período (ej. «SEMANAL 19 AL 25 OCT»), sin símbolos que el banco rechace.</p>
          <button type="button" class="btn-secondary" @click="revisarBp">Revisar archivo</button>
        </div>
        <template v-if="bp">
          <div v-if="bp.problemas.length" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p class="mb-1 font-semibold">Falta completar antes de generar el archivo:</p>
            <ul class="list-disc pl-5"><li v-for="(p, i) in bp.problemas" :key="i">{{ p }}</li></ul>
          </div>
          <template v-else>
            <p class="text-sm text-slate-700">
              Se debitan <strong>{{ m(bp.total) }}</strong> de la cuenta de la empresa y se acreditan {{ bp.pagos.length }} empleados:
            </p>
            <ul class="grid grid-cols-1 gap-x-8 text-sm sm:grid-cols-2">
              <li v-for="p in bp.pagos" :key="p.cuenta" class="flex justify-between border-b border-slate-100 py-0.5"><span>{{ p.nombre }}</span><span class="tabular-nums">{{ m(p.monto) }}</span></li>
            </ul>
            <p class="text-xs text-slate-500">Archivo: {{ bp.nombreArchivo }} · Descripción: {{ bp.descripcion }}</p>
            <button type="button" class="btn-primary w-fit" :disabled="trabajando" @click="descargarBp">Descargar TXT para el banco</button>
          </template>
          <p v-if="bp.efectivo.length" class="text-xs text-slate-500">Se pagan en efectivo (no van en el archivo): {{ bp.efectivo.map((e) => e.nombre).join(', ') }}.</p>
          <p v-if="bp.sinDeposito?.length" class="text-xs text-slate-500">No se depositan (socios; no van en el archivo): {{ bp.sinDeposito.map((e) => `${e.nombre} ${m(e.monto)}`).join(', ') }}.</p>
          <p v-if="bp.sinMonto.length" class="text-xs text-slate-500">Sin monto a pagar: {{ bp.sinMonto.join(', ') }}.</p>
        </template>
      </div>

      <ul class="flex flex-col gap-2">
        <li v-for="l in detalle.planilla.lineas" :key="l.id" class="card">
          <button type="button" class="flex w-full flex-wrap items-center justify-between gap-2 text-left" @click="lineaAbierta = lineaAbierta === l.id ? null : l.id">
            <span class="text-base font-semibold text-slate-900">{{ l.empleadoNombre }}</span>
            <span class="text-sm text-slate-600">Bruto {{ m(l.bruto) }} · Deducciones {{ m(l.totalDeducciones) }} · <strong>Neto {{ m(l.neto) }}</strong></span>
          </button>
          <div v-if="detalle.planilla.estado === 'borrador'" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label class="font-semibold text-slate-700" :for="`via-${l.id}`">Viáticos ₡</label>
            <input
              :id="`via-${l.id}`"
              :value="viaticosDe(l)"
              type="text"
              inputmode="decimal"
              placeholder="0"
              class="input w-36"
              :disabled="trabajando"
              @input="viaticosEdicion[l.id] = $event.target.value"
              @blur="guardarViaticos(l)"
              @keydown.enter.prevent="$event.target.blur()"
            />
            <input
              :value="justificanteDe(l)"
              type="text"
              maxlength="255"
              placeholder="Justificante: para qué fue y qué comprobante tiene (obligatorio)"
              class="input min-w-64 flex-1"
              :disabled="trabajando"
              @input="justificanteEdicion[l.id] = $event.target.value"
              @blur="guardarViaticos(l)"
              @keydown.enter.prevent="$event.target.blur()"
            />
            <span class="basis-full text-xs text-slate-500">Se suman al neto; no llevan CCSS ni renta. Solo es válido como viático si reembolsa un gasto real y está documentado.</span>
          </div>
          <p v-else-if="Number(l.viaticos) > 0" class="mt-2 text-sm text-slate-700">Viáticos incluidos en el neto: <strong>{{ m(l.viaticos) }}</strong><span v-if="l.detalle?.viaticosJustificante"> — {{ l.detalle.viaticosJustificante }}</span></p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="text-sm font-semibold text-blue-700 underline" :disabled="trabajando" @click="colilla(l)">Colilla PDF</button>
            <button type="button" class="text-sm font-semibold text-green-700 underline" :disabled="trabajando" @click="compartirColilla(l)">Compartir (WhatsApp)</button>
          </div>
          <div v-if="lineaAbierta === l.id" class="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p>Salario base: {{ m(l.salarioBase) }}</p>
            <p>Tarifa por hora: {{ m(l.tarifaHora) }}</p>
            <p>Ausencias descontadas: {{ l.diasAusenciaDescontados }} día(s) = −{{ m(l.descuentoAusencias) }}</p>
            <p>Horas faltantes descontadas: {{ l.horasAusentes }} h = −{{ m(l.descuentoHoras) }}</p>
            <p>Horas extra: {{ l.horasExtra }} = {{ m(l.montoExtra) }}</p>
            <p>Feriado/domingo trabajado: {{ l.horasEspeciales }} h = {{ m(l.montoEspeciales) }}</p>
            <p>SEM: {{ m(l.sem) }} · IVM: {{ m(l.ivm) }} · Banco Popular: {{ m(l.bancoPopular) }}</p>
            <p>Renta: {{ m(l.renta) }}</p>
            <p>Deudas descontadas: {{ m(l.deudasDescontadas) }}</p>
            <p v-if="Number(l.deduccionesExternas) > 0">Préstamos y embargos descontados: {{ m(l.deduccionesExternas) }}</p>
            <p v-if="Number(l.viaticos) > 0">Viáticos (fuera del bruto): {{ m(l.viaticos) }}</p>
            <p>Cargas patronales: {{ m(l.cargasPatronales) }}</p>
            <p>Provisiones: {{ m(l.provisiones) }}</p>
            <p v-if="l.detalle.diasSinDatos" class="text-amber-800">Días sin marcas importadas: {{ l.detalle.diasSinDatos }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
