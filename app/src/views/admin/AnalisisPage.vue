<script setup>
import { confirmar } from '../../lib/confirmar.js';
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, API_URL, ApiError, descargarArchivo } from '../../lib/api.js';
import { fechaHoyISO, formatearFechaHora } from '../../lib/format.js';
import BarrasHorizontales from '../../components/BarrasHorizontales.vue';
import BarrasPeriodo from '../../components/BarrasPeriodo.vue';

// Análisis de datos: tableros integrados y descarga de datasets (CSV, Excel, JSON) para Power BI, Excel o Python.
// Exclusivo del administrador del sistema (la ruta y el backend lo exigen).
const PESTANAS = [
  ['salud', 'Salud financiera'],
  ['ventas', 'Ventas'],
  ['cartera', 'Cartera'],
  ['inventario', 'Inventario'],
  ['planilla', 'Planilla'],
  ['contabilidad', 'Contabilidad'],
  ['datos', 'Datos y Power BI'],
];
const pestana = ref(sessionStorage.getItem('cb-analisis-pestana') ?? 'salud');
watch(pestana, (p) => sessionStorage.setItem('cb-analisis-pestana', p));

// ---- Rango de fechas
const hoy = fechaHoyISO();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS = [
  ['Este mes', () => [iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), hoy]],
  ['3 meses', () => [iso(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)), hoy]],
  ['Este año', () => [`${new Date().getFullYear()}-01-01`, hoy]],
  ['12 meses', () => [iso(new Date(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1)), hoy]],
  ['Todo', () => ['', '']],
];
const desde = ref(PRESETS[3][1]()[0]);
const hasta = ref(hoy);
const presetActivo = ref('12 meses');
function aplicarPreset(nombre, f) {
  [desde.value, hasta.value] = f();
  presetActivo.value = nombre;
}
function cambioManual() {
  presetActivo.value = '';
}

// ---- Formatos
const crc = (v) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(v ?? 0);
const num = (v) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(v ?? 0);
const pct = (v) => `${num(v)} %`;
const bonito = (t) => (t ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const mesCorto = (m) => {
  const [a, mm] = m.split('-');
  return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(mm) - 1]} ${a.slice(2)}`;
};
const filasVenta = (lista) => (lista ?? []).map((r) => ({ etiqueta: r.etiqueta, valor: r.venta }));

// ---- Tableros
const datos = reactive({});
const cargando = ref(false);
const error = ref('');
let ticket = 0;

async function cargar() {
  const tema = pestana.value;
  if (tema === 'datos') return;
  const mio = ++ticket;
  cargando.value = true;
  error.value = '';
  try {
    const q = new URLSearchParams();
    if (desde.value) q.set('desde', desde.value);
    if (hasta.value) q.set('hasta', hasta.value);
    const r = await api.get(tema === 'salud' ? `/sistema/analisis/salud-financiera?${q}` : `/sistema/analisis/resumen/${tema}?${q}`);
    if (mio === ticket) datos[tema] = r;
  } catch (err) {
    if (mio === ticket) error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el análisis.';
  } finally {
    if (mio === ticket) cargando.value = false;
  }
}
watch([pestana, desde, hasta], cargar);

const v = computed(() => datos.ventas);
const periodosVentas = computed(() => (v.value?.porMes ?? []).map((m) => ({ etiqueta: mesCorto(m.etiqueta), a: m.venta, b: m.margen })));
const sinCostoTodo = computed(() => Boolean(v.value?.kpis.sinCostoRegistrado));
const nombresVentas = computed(() => (sinCostoTodo.value ? ['Venta neta'] : ['Venta neta', 'Margen bruto']));
const periodosPlanilla = computed(() => (datos.planilla?.porPlanilla ?? []).map((p) => ({ etiqueta: p.etiqueta, a: p.bruto, b: p.cargas })));
const periodosConta = computed(() => (datos.contabilidad?.porMes ?? []).map((m) => ({ etiqueta: mesCorto(m.etiqueta), a: m.ingresos, b: m.gastos })));

// ---- Salud financiera
const sf = computed(() => datos.salud);
const ESTADO_IND = { ok: ['Sano', 'bg-green-500'], atencion: ['Atención', 'bg-amber-500'], alerta: ['Alerta', 'bg-red-500'], info: ['', 'bg-slate-400'] };
const COLOR_GENERAL = { ok: 'border-green-500/50 bg-green-50 text-green-800', atencion: 'border-amber-400/60 bg-amber-50 text-amber-800', alerta: 'border-red-400/60 bg-red-50 text-red-700' };
const TITULO_GENERAL = { ok: 'Salud financiera: sana', atencion: 'Salud financiera: con puntos de atención', alerta: 'Salud financiera: con alertas' };
function valorIndicador(i) {
  if (i.valor === null || i.valor === undefined) return 'sin datos';
  if (i.formato === 'colones') return crc(i.valor);
  if (i.formato === 'razon') return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(i.valor);
  if (i.formato === 'porcentaje') return pct(i.valor);
  if (i.formato === 'dias') return `${num(i.valor)} días`;
  if (i.formato === 'meses') return `${num(i.valor)} meses`;
  return String(i.valor);
}
const chequeosConProblema = computed(() => (sf.value?.chequeos ?? []).filter((c) => c.estado !== 'ok').sort((a, b) => (a.estado === 'error' ? 0 : 1) - (b.estado === 'error' ? 0 : 1)));
const chequeosOk = computed(() => (sf.value?.chequeos ?? []).filter((c) => c.estado === 'ok'));
const ETIQUETA_CHEQUEO = { error: ['Error', 'bg-red-500'], atencion: ['Aviso', 'bg-amber-500'], sin_verificar: ['No se pudo verificar', 'bg-slate-400'] };
const periodosTendencia = computed(() => (sf.value?.tendencia ?? []).map((t) => ({ etiqueta: mesCorto(t.mes), a: t.ingresos, b: t.gastos })));
const periodosCaja = computed(() => (sf.value?.tendencia ?? []).filter((t) => t.caja !== null).map((t) => ({ etiqueta: mesCorto(t.mes), a: t.caja })));
const celda = (v) => (typeof v === 'number' ? new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(v) : (v ?? ''));

// ---- Datos y Power BI
const catalogo = ref([]);
const formato = ref('csv');
const nombresCompletos = ref(false);
const bajando = ref('');
const vista = reactive({ id: '', columnas: [], filas: [], cargando: false });
const enlace = ref(null);
const tokenNuevo = ref('');
const copiado = ref('');
const avisoDatos = ref('');
const TEMAS_CATALOGO = { ventas: 'Ventas', cartera: 'Cartera y cobros', inventario: 'Inventario', contabilidad: 'Contabilidad', planilla: 'Planilla', catalogos: 'Catálogos de apoyo' };

const catalogoPorTema = computed(() => {
  const grupos = {};
  for (const d of catalogo.value) (grupos[d.tema] ??= []).push(d);
  return Object.entries(TEMAS_CATALOGO).filter(([k]) => grupos[k]).map(([k, titulo]) => ({ tema: k, titulo, datasets: grupos[k] }));
});

function consulta(d, extra = {}) {
  const q = new URLSearchParams(extra);
  if (d.conFecha) {
    if (desde.value) q.set('desde', desde.value);
    if (hasta.value) q.set('hasta', hasta.value);
  }
  if (d.personal) q.set('anonimizar', nombresCompletos.value ? '0' : '1');
  return q.toString();
}

async function cargarCatalogo() {
  try {
    [catalogo.value, enlace.value] = await Promise.all([api.get('/sistema/analisis/catalogo'), api.get('/sistema/analisis/enlace')]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo.';
  }
}
watch(pestana, (p) => {
  if (p === 'datos' && !catalogo.value.length) cargarCatalogo();
});

async function descargar(d) {
  bajando.value = d.id;
  error.value = '';
  try {
    await descargarArchivo(`/sistema/analisis/descargar/${d.id}?${consulta(d, { formato: formato.value })}`, `${d.id}.${formato.value}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  } finally {
    bajando.value = '';
  }
}

async function verVista(d) {
  if (vista.id === d.id) {
    vista.id = '';
    return;
  }
  vista.id = d.id;
  vista.cargando = true;
  vista.columnas = [];
  vista.filas = [];
  try {
    const r = await api.get(`/sistema/analisis/vista/${d.id}?${consulta(d)}`);
    vista.columnas = r.columnas;
    vista.filas = r.filas;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la vista previa.';
  } finally {
    vista.cargando = false;
  }
}

async function generarEnlace() {
  if (enlace.value?.activo && !await confirmar('Ya hay una clave activa. Si genera otra, la anterior deja de funcionar. ¿Continuar?')) return;
  try {
    const r = await api.post('/sistema/analisis/enlace');
    tokenNuevo.value = r.token;
    enlace.value = await api.get('/sistema/analisis/enlace');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo generar la clave.';
  }
}
async function revocarEnlace() {
  if (!await confirmar('Power BI y cualquier otra herramienta que use esta clave dejarán de recibir datos. ¿Revocar?')) return;
  try {
    await api.delete('/sistema/analisis/enlace');
    tokenNuevo.value = '';
    enlace.value = await api.get('/sistema/analisis/enlace');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo revocar la clave.';
  }
}
async function copiar(texto, clave) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = clave;
    setTimeout(() => (copiado.value = ''), 2000);
  } catch {
    avisoDatos.value = 'No se pudo copiar automáticamente; seleccione el texto y cópielo.';
  }
}

const urlFeed = (id) => `${API_URL}/feed/${id}`;
const ejemploPython = computed(
  () => `import io, pandas as pd, requests

CLAVE = "${tokenNuevo.value || 'TU_CLAVE'}"
r = requests.get("${urlFeed('ventas')}", headers={"Authorization": f"Bearer {CLAVE}"})
ventas = pd.read_csv(io.BytesIO(r.content), encoding="utf-8-sig")
print(ventas.groupby("producto_codigo")["venta_neta"].sum().sort_values(ascending=False).head(10))`,
);
const ejemploPowerQuery = computed(
  () => `let
    Origen = Csv.Document(Web.Contents("${urlFeed('ventas')}", [Headers = [Authorization = "Bearer ${tokenNuevo.value || 'TU_CLAVE'}"]]), [Delimiter = ",", Encoding = 65001]),
    Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true])
in
    Encabezados`,
);

onMounted(() => {
  if (pestana.value === 'datos') cargarCatalogo();
  else cargar();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-bold text-slate-900">Análisis de datos</h1>
      <p class="text-sm text-slate-500">Tableros integrados y datos listos para Power BI, Excel o Python. Solo lo ve el administrador del sistema.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in PESTANAS"
        :key="p[0]"
        type="button"
        class="rounded-lg border px-4 py-1.5 text-sm font-semibold"
        :class="pestana === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="pestana = p[0]"
      >
        {{ p[1] }}
      </button>
    </div>

    <!-- Filtro de fechas -->
    <div v-if="pestana !== 'cartera'" class="card flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Desde
        <input v-model="desde" type="date" class="input mt-1" @input="cambioManual" />
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Hasta
        <input v-model="hasta" type="date" class="input mt-1" @input="cambioManual" />
      </label>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="p in PRESETS" :key="p[0]" type="button" class="rounded-lg border px-3 py-1.5 text-xs font-semibold" :class="presetActivo === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="aplicarPreset(p[0], p[1])">{{ p[0] }}</button>
      </div>
      <p v-if="pestana === 'inventario'" class="text-xs text-slate-500">Las existencias son las de hoy; el rango aplica a los movimientos.</p>
      <p v-if="pestana === 'datos'" class="text-xs text-slate-500">El rango aplica a los conjuntos de datos que tienen fecha.</p>
    </div>
    <p v-else class="text-xs text-slate-500">La cartera es una foto de hoy: no usa rango de fechas.</p>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando && pestana !== 'datos'" class="text-sm text-slate-500">Calculando…</p>

    <!-- Todo sale del libro mayor -->
    <p v-if="pestana !== 'datos'" class="text-xs text-slate-500">Las cifras en colones de estos tableros salen del <strong>libro mayor</strong>; el cliente, producto o planilla de cada monto se toma del documento que originó el asiento. El detalle operativo se compara contra el mayor en el "cuadre".</p>

    <!-- SALUD FINANCIERA -->
    <template v-if="pestana === 'salud' && sf">
      <div class="rounded-xl border px-4 py-3" :class="COLOR_GENERAL[sf.general.estado]">
        <p class="text-base font-semibold">{{ TITULO_GENERAL[sf.general.estado] }}</p>
        <p class="text-sm">{{ sf.general.resumen }}</p>
        <p class="mt-1 text-xs opacity-80">Balance al {{ sf.hasta }} · rentabilidad y tendencia del {{ sf.desde }} al {{ sf.hasta }} ({{ sf.dias }} días). Todo sale del libro mayor.</p>
      </div>

      <div v-for="g in sf.grupos" :key="g.titulo" class="flex flex-col gap-2">
        <p class="text-sm font-semibold text-slate-900">{{ g.titulo }}</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div v-for="i in g.items" :key="i.clave" class="card" :class="i.estado === 'alerta' ? 'ring-1 ring-red-500/60' : i.estado === 'atencion' ? 'ring-1 ring-amber-500/50' : ''" :title="i.nota">
            <p class="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>{{ i.titulo }}</span>
              <span v-if="ESTADO_IND[i.estado][0]" class="flex items-center gap-1 normal-case"><span class="inline-block h-2 w-2 rounded-full" :class="ESTADO_IND[i.estado][1]" />{{ ESTADO_IND[i.estado][0] }}</span>
            </p>
            <p class="mt-1 text-xl font-bold text-slate-900">{{ valorIndicador(i) }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ i.nota }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Ingresos y gastos por mes</p><BarrasPeriodo :periodos="periodosTendencia" :nombres="['Ingresos', 'Gastos']" :colores="['#10b981', '#d97706']" :formato="crc" /></div>
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Caja y bancos al cierre de cada mes</p><BarrasPeriodo :periodos="periodosCaja" :nombres="['Caja y bancos']" :formato="crc" /></div>
        <div class="card xl:col-span-2">
          <p class="mb-1 text-sm font-semibold text-slate-900">Lo que se debe (cuentas por pagar y obligaciones)</p>
          <p class="mb-2 text-xs text-slate-500">Activos {{ crc(sf.resumenBalance.activoTotal) }} · pasivos {{ crc(sf.resumenBalance.pasivoTotal) }} · patrimonio {{ crc(sf.resumenBalance.patrimonio) }}</p>
          <BarrasHorizontales :filas="sf.obligaciones.map((o) => ({ etiqueta: o.etiqueta, valor: o.monto }))" :formato="crc" color="#d97706" vacio="No hay obligaciones pendientes." />
        </div>
      </div>

      <div class="card flex flex-col gap-3">
        <div>
          <p class="text-base font-semibold text-slate-900">¿Qué no cuadra y dónde buscar?</p>
          <p class="text-sm text-slate-500">Se comparan el libro mayor y los documentos (facturas, recibos, bodega, planillas). Cada problema dice qué pasa y por dónde puede estar el origen.</p>
        </div>
        <p v-if="!chequeosConProblema.length" class="rounded-lg border border-green-500/50 bg-green-50 px-3 py-2 text-sm text-green-800">Todo cuadra: {{ chequeosOk.length }} verificaciones sin problemas.</p>
        <div v-for="c in chequeosConProblema" :key="c.codigo" class="rounded-lg border border-slate-200 p-3" :class="c.estado === 'error' ? 'border-red-400/60' : ''">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded px-2 py-0.5 text-xs font-semibold text-white" :class="ETIQUETA_CHEQUEO[c.estado][1]">{{ ETIQUETA_CHEQUEO[c.estado][0] }}</span>
            <span class="text-xs text-slate-500">{{ c.grupo }}</span>
            <p class="text-sm font-semibold text-slate-900">{{ c.titulo }}</p>
          </div>
          <p class="mt-1 text-sm text-slate-700">{{ c.resumen }}</p>
          <p v-if="c.donde" class="mt-1 text-sm text-slate-600"><strong>Dónde buscar:</strong> {{ c.donde }}</p>
          <details v-if="c.ejemplos.length" class="mt-2 text-sm">
            <summary class="cursor-pointer text-xs font-semibold text-slate-600">Ver ejemplos ({{ c.ejemplos.length }} de {{ c.problemas }})</summary>
            <div class="mt-1 max-h-56 overflow-auto rounded border border-slate-200">
              <table class="w-full text-xs">
                <thead class="sticky top-0 bg-slate-100"><tr><th v-for="k in Object.keys(c.ejemplos[0])" :key="k" class="whitespace-nowrap px-2 py-1 text-left font-semibold text-slate-600">{{ k }}</th></tr></thead>
                <tbody><tr v-for="(e, i) in c.ejemplos" :key="i" class="border-t border-slate-100"><td v-for="k in Object.keys(c.ejemplos[0])" :key="k" class="whitespace-nowrap px-2 py-1">{{ celda(e[k]) }}</td></tr></tbody>
              </table>
            </div>
          </details>
        </div>
        <details v-if="chequeosOk.length" class="text-sm text-slate-700">
          <summary class="cursor-pointer text-xs font-semibold text-slate-600">{{ chequeosOk.length }} verificaciones sin problemas</summary>
          <ul class="mt-1 list-disc pl-5 text-xs text-slate-600"><li v-for="c in chequeosOk" :key="c.codigo">{{ c.grupo }} · {{ c.titulo }}</li></ul>
        </details>
      </div>
    </template>

    <!-- VENTAS -->
    <template v-if="pestana === 'ventas' && v">
      <p v-if="sinCostoTodo" class="rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">El libro mayor no tiene costo de ventas en este período (los productos vendidos no tenían costo registrado). Por eso el margen todavía no es confiable.</p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Venta neta</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(v.kpis.venta) }}</p><p class="mt-1 text-xs text-slate-500">cuentas 4100–4120</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Costo de ventas</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(v.kpis.costo) }}</p><p class="mt-1 text-xs text-slate-500">cuenta 5100</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Margen bruto</p><p class="mt-1 text-xl font-bold text-slate-900">{{ sinCostoTodo ? '—' : crc(v.kpis.margen) }}</p><p class="mt-1 text-xs text-slate-500">{{ sinCostoTodo ? 'falta registrar costos' : pct(v.kpis.margenPct) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Facturas</p><p class="mt-1 text-xl font-bold text-slate-900">{{ num(v.kpis.facturas) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Clientes</p><p class="mt-1 text-xl font-bold text-slate-900">{{ num(v.kpis.clientes) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket promedio</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(v.kpis.ticketPromedio) }}</p></div>
      </div>
      <p class="text-xs" :class="v.cuadre.cuadra ? 'text-green-600' : 'font-semibold text-amber-600'">
        {{ v.cuadre.cuadra ? `Cuadre: el mayor (${crc(v.cuadre.mayor)}) coincide con ${v.cuadre.contra}.` : `Atención: el mayor dice ${crc(v.cuadre.mayor)} y ${v.cuadre.contra} suman ${crc(v.cuadre.detalle)} (diferencia ${crc(v.cuadre.diferencia)}). Conviene revisar los asientos.` }}
      </p>
      <div class="card">
        <p class="mb-1 text-sm font-semibold text-slate-900">{{ sinCostoTodo ? 'Venta por mes' : 'Venta y margen bruto por mes' }}</p>
        <BarrasPeriodo :periodos="periodosVentas" :nombres="nombresVentas" :colores="['#6366f1', '#10b981']" :formato="crc" />
      </div>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Mejores clientes</p><BarrasHorizontales :filas="filasVenta(v.topClientes)" :formato="crc" /></div>
        <div class="card">
          <p class="mb-1 text-sm font-semibold text-slate-900">Productos que más venden (análisis ABC)</p>
          <p class="mb-2 text-xs text-slate-500">A = junta el 80 % de la venta ({{ v.abc.clases.A }} de {{ v.abc.productosTotal }} productos), B hasta el 95 % ({{ v.abc.clases.B }}), C el resto ({{ v.abc.clases.C }}).<template v-if="Math.abs(v.abc.sinDetalle) >= 1"> Sin detalle de producto: {{ crc(v.abc.sinDetalle) }}.</template></p>
          <BarrasHorizontales :filas="v.abc.filas.map((r) => ({ etiqueta: `${r.clase} · ${r.etiqueta}`, valor: r.venta, extra: `acumulado ${r.acumuladoPct} %` }))" :formato="crc" />
        </div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Por vendedor</p><BarrasHorizontales :filas="filasVenta(v.porVendedor)" :formato="crc" color="#0ea5e9" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Por provincia del cliente</p><BarrasHorizontales :filas="filasVenta(v.porProvincia)" :formato="crc" color="#0ea5e9" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Por ubicación de venta</p><BarrasHorizontales :filas="filasVenta(v.porUbicacion)" :formato="crc" color="#0ea5e9" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Contado y crédito</p><BarrasHorizontales :filas="filasVenta(v.porTipoPago).map((r) => ({ ...r, etiqueta: bonito(r.etiqueta) }))" :formato="crc" color="#0ea5e9" /></div>
      </div>
    </template>

    <!-- CARTERA -->
    <template v-if="pestana === 'cartera' && datos.cartera">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Por cobrar</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.cartera.kpis.saldo) }}</p><p class="mt-1 text-xs text-slate-500">cuenta 1200 del mayor</p></div>
        <div class="card" :class="datos.cartera.kpis.vencido > 0 ? 'ring-1 ring-amber-500/50' : ''"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Vencido</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.cartera.kpis.vencido) }}</p><p class="mt-1 text-xs text-slate-500">{{ pct(datos.cartera.kpis.vencidoPct) }} de la cartera</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Clientes con saldo</p><p class="mt-1 text-xl font-bold text-slate-900">{{ datos.cartera.kpis.clientes }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Facturas abiertas</p><p class="mt-1 text-xl font-bold text-slate-900">{{ datos.cartera.kpis.facturasAbiertas }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Atraso promedio</p><p class="mt-1 text-xl font-bold text-slate-900">{{ datos.cartera.kpis.diasPromVencida }} días</p><p class="mt-1 text-xs text-slate-500">solo facturas vencidas</p></div>
      </div>
      <p class="text-xs" :class="datos.cartera.cuadre.cuadra ? 'text-green-600' : 'font-semibold text-amber-600'">
        {{ datos.cartera.cuadre.cuadra ? `Cuadre: el mayor (${crc(datos.cartera.cuadre.mayor)}) coincide con ${datos.cartera.cuadre.contra}.` : `Atención: el mayor dice ${crc(datos.cartera.cuadre.mayor)} y ${datos.cartera.cuadre.contra} suma ${crc(datos.cartera.cuadre.detalle)} (diferencia ${crc(datos.cartera.cuadre.diferencia)}); puede haber pagos sin aplicar a una factura.` }}
      </p>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Antigüedad de la cartera</p><p class="mb-2 text-xs text-slate-500">Por factura abierta (la antigüedad no se puede sacar del mayor, que no separa facturas).</p><BarrasHorizontales :filas="datos.cartera.tramos.map((t) => ({ etiqueta: t.etiqueta, valor: t.saldo, extra: `${t.facturas} facturas` }))" :formato="crc" color="#d97706" vacio="No hay saldos por cobrar." /></div>
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Clientes que más deben</p><p class="mb-2 text-xs text-slate-500">Saldo de la cuenta 1200 por cliente.</p><BarrasHorizontales :filas="datos.cartera.deudores.map((d) => ({ etiqueta: d.etiqueta, valor: d.saldo }))" :formato="crc" color="#d97706" vacio="No hay saldos por cobrar." /></div>
        <div class="card overflow-x-auto xl:col-span-2">
          <p class="mb-2 text-sm font-semibold text-slate-900">Facturas más atrasadas</p>
          <table class="w-full min-w-[28rem] text-sm">
            <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Factura</th><th class="py-1 pr-2">Cliente</th><th class="py-1 pr-2">Venció</th><th class="py-1 pr-2 text-right">Días</th><th class="py-1 text-right">Saldo</th></tr></thead>
            <tbody>
              <tr v-for="f in datos.cartera.masVencidas" :key="f.consecutivo" class="border-b border-slate-100"><td class="py-1 pr-2 font-mono text-xs">{{ f.consecutivo }}</td><td class="py-1 pr-2">{{ f.cliente }}</td><td class="py-1 pr-2">{{ f.venceEl }}</td><td class="py-1 pr-2 text-right text-amber-600">{{ f.diasVencida }}</td><td class="py-1 text-right tabular-nums">{{ crc(f.saldo) }}</td></tr>
              <tr v-if="!datos.cartera.masVencidas.length"><td colspan="5" class="py-2 text-slate-500">No hay facturas vencidas.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- INVENTARIO -->
    <template v-if="pestana === 'inventario' && datos.inventario">
      <p v-if="datos.inventario.kpis.stockNegativo > 0" class="rounded-lg border border-red-400/60 bg-red-50 px-3 py-2 text-sm text-red-700">Hay {{ datos.inventario.kpis.stockNegativo }} existencias en negativo: conviene revisarlas.</p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventario en el mayor</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.inventario.kpis.valorMayor) }}</p><p class="mt-1 text-xs text-slate-500">cuentas 1300–1320</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Pares en existencia</p><p class="mt-1 text-xl font-bold text-slate-900">{{ num(datos.inventario.kpis.pares) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Existencias a costo</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.inventario.kpis.valorCosto) }}</p><p class="mt-1 text-xs text-slate-500">detalle de bodega</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">A precio de venta</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.inventario.kpis.valorVenta) }}</p><p class="mt-1 text-xs text-slate-500">{{ datos.inventario.kpis.variantesConStock }} variantes con stock</p></div>
      </div>
      <p class="text-xs" :class="datos.inventario.cuadre.cuadra ? 'text-green-600' : 'font-semibold text-amber-600'">
        {{ datos.inventario.cuadre.cuadra ? `Cuadre: el mayor (${crc(datos.inventario.cuadre.mayor)}) coincide con ${datos.inventario.cuadre.contra}.` : `Atención: el mayor dice ${crc(datos.inventario.cuadre.mayor)} y ${datos.inventario.cuadre.contra} suman ${crc(datos.inventario.cuadre.detalle)} (diferencia ${crc(datos.inventario.cuadre.diferencia)}). Es normal si hay existencias cargadas sin asiento o productos sin costo.` }}
      </p>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Pares por ubicación</p><BarrasHorizontales :filas="datos.inventario.porUbicacion.map((u) => ({ etiqueta: u.etiqueta, valor: u.pares, extra: `a costo ${crc(u.valor)}` }))" :formato="num" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Productos con más valor inmovilizado (a costo)</p><BarrasHorizontales :filas="datos.inventario.topValor.map((u) => ({ etiqueta: u.etiqueta, valor: u.valor, extra: `${u.pares} pares` }))" :formato="crc" color="#0ea5e9" /></div>
        <div class="card xl:col-span-2"><p class="mb-2 text-sm font-semibold text-slate-900">Movimientos del período (pares netos por tipo)</p><BarrasHorizontales :filas="datos.inventario.porTipoMovimiento.map((m) => ({ etiqueta: bonito(m.etiqueta), valor: m.pares, extra: `${m.movimientos} movimientos` }))" :formato="num" color="#10b981" /></div>
      </div>
    </template>

    <!-- PLANILLA -->
    <template v-if="pestana === 'planilla' && datos.planilla">
      <p v-if="!datos.planilla.porPlanilla.length" class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Todavía no hay planillas aprobadas en este período. Una planilla entra al libro mayor cuando se <strong>aprueba</strong> (genera su asiento); las marcas del reloj importadas no son un gasto hasta entonces.
        <template v-if="datos.planilla.pendiente.borradores || datos.planilla.pendiente.diasImportados">Ahora hay {{ datos.planilla.pendiente.diasImportados }} días de asistencia importados y {{ datos.planilla.pendiente.borradores }} planilla(s) en borrador por aprobar.</template>
      </p>
      <p class="text-xs text-slate-500">Costos del libro mayor (sueldos 5200, cargas 5210, provisiones 5220). Solo totales y promedios, nunca personas.</p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Costo laboral total</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.planilla.kpis.costoTotal) }}</p><p class="mt-1 text-xs text-slate-500">sueldos + cargas + provisiones</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Sueldos brutos</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.planilla.kpis.bruto) }}</p><p class="mt-1 text-xs text-slate-500">neto {{ crc(datos.planilla.kpis.neto) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Cargas patronales</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.planilla.kpis.cargas) }}</p><p class="mt-1 text-xs text-slate-500">provisiones {{ crc(datos.planilla.kpis.provisiones) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Horas extra</p><p class="mt-1 text-xl font-bold text-slate-900">{{ num(datos.planilla.kpis.horasExtra) }} h</p><p class="mt-1 text-xs text-slate-500">{{ crc(datos.planilla.kpis.extras) }} · {{ pct(datos.planilla.kpis.extrasPct) }} del bruto</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Planillas</p><p class="mt-1 text-xl font-bold text-slate-900">{{ datos.planilla.kpis.planillas }}</p><p class="mt-1 text-xs text-slate-500">{{ datos.planilla.kpis.empleados }} empleados</p></div>
      </div>
      <p v-if="datos.planilla.porPlanilla.length" class="text-xs" :class="datos.planilla.cuadre.cuadra ? 'text-green-600' : 'font-semibold text-amber-600'">
        {{ datos.planilla.cuadre.cuadra ? `Cuadre: los sueldos del mayor (${crc(datos.planilla.cuadre.mayor)}) coinciden con ${datos.planilla.cuadre.contra}.` : `Atención: el mayor dice ${crc(datos.planilla.cuadre.mayor)} y ${datos.planilla.cuadre.contra} suman ${crc(datos.planilla.cuadre.detalle)} (diferencia ${crc(datos.planilla.cuadre.diferencia)}).` }}
      </p>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card xl:col-span-2"><p class="mb-1 text-sm font-semibold text-slate-900">Costo por planilla</p><BarrasPeriodo :periodos="periodosPlanilla" :nombres="['Sueldos brutos', 'Cargas patronales']" :colores="['#6366f1', '#d97706']" :formato="crc" /></div>
        <div class="card overflow-x-auto xl:col-span-2">
          <p class="mb-2 text-sm font-semibold text-slate-900">Por puesto (detalle de planilla)</p>
          <table class="w-full min-w-[28rem] text-sm">
            <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Puesto</th><th class="py-1 pr-2 text-right">Personas</th><th class="py-1 pr-2 text-right">Bruto</th><th class="py-1 pr-2 text-right">Horas extra</th><th class="py-1 text-right">Monto extra</th></tr></thead>
            <tbody>
              <tr v-for="p in datos.planilla.porPuesto" :key="p.etiqueta" class="border-b border-slate-100"><td class="py-1 pr-2 font-medium text-slate-800">{{ p.etiqueta }}</td><td class="py-1 pr-2 text-right">{{ p.empleados }}</td><td class="py-1 pr-2 text-right tabular-nums">{{ crc(p.bruto) }}</td><td class="py-1 pr-2 text-right">{{ num(p.horasExtra) }}</td><td class="py-1 text-right tabular-nums">{{ crc(p.extras) }}</td></tr>
              <tr v-if="!datos.planilla.porPuesto.length"><td colspan="5" class="py-2 text-slate-500">Sin planillas aprobadas en este período.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- CONTABILIDAD -->
    <template v-if="pestana === 'contabilidad' && datos.contabilidad">
      <p class="text-xs text-slate-500">Estado de resultados con base en los asientos (sin los asientos de cierre, que ponen ingresos y gastos en cero).</p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingresos</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.contabilidad.kpis.ingresos) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Gastos</p><p class="mt-1 text-xl font-bold text-slate-900">{{ crc(datos.contabilidad.kpis.gastos) }}</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultado</p><p class="mt-1 text-xl font-bold text-slate-900" :class="datos.contabilidad.kpis.resultado < 0 ? '!text-red-500' : ''">{{ crc(datos.contabilidad.kpis.resultado) }}</p><p class="mt-1 text-xs text-slate-500">{{ pct(datos.contabilidad.kpis.margenPct) }} de los ingresos</p></div>
        <div class="card"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Asientos</p><p class="mt-1 text-xl font-bold text-slate-900">{{ num(datos.contabilidad.kpis.asientos) }}</p></div>
      </div>
      <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Ingresos y gastos por mes</p><BarrasPeriodo :periodos="periodosConta" :nombres="['Ingresos', 'Gastos']" :colores="['#10b981', '#d97706']" :formato="crc" /></div>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Mayores gastos por cuenta</p><BarrasHorizontales :filas="datos.contabilidad.topGastos.map((g) => ({ etiqueta: g.etiqueta, valor: g.monto }))" :formato="crc" color="#d97706" /></div>
        <div class="card"><p class="mb-2 text-sm font-semibold text-slate-900">Ingresos por cuenta</p><BarrasHorizontales :filas="datos.contabilidad.topIngresos.map((g) => ({ etiqueta: g.etiqueta, valor: g.monto }))" :formato="crc" color="#10b981" /></div>
      </div>
    </template>

    <!-- DATOS Y POWER BI -->
    <template v-if="pestana === 'datos'">
      <div class="card flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-base font-semibold text-slate-900">Conjuntos de datos</p>
            <p class="text-sm text-slate-500">Tablas planas y limpias, listas para cargar en Power BI, Excel o pandas. Nunca incluyen claves ni cédula, teléfono o correo de clientes.</p>
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-700">Formato
            <select v-model="formato" class="input !w-auto"><option value="csv">CSV</option><option value="xlsx">Excel</option><option value="json">JSON</option></select>
          </label>
        </div>
        <p v-if="avisoDatos" class="text-sm text-amber-600">{{ avisoDatos }}</p>
        <div v-for="g in catalogoPorTema" :key="g.tema" class="flex flex-col gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ g.titulo }}</p>
          <div v-for="d in g.datasets" :key="d.id" class="rounded-lg border border-slate-200 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900">{{ d.titulo }} <span class="ml-1 font-mono text-xs font-normal text-slate-500">{{ d.id }}</span></p>
                <p class="text-xs text-slate-500">{{ d.descripcion }}</p>
                <label v-if="d.personal" class="mt-1 flex items-center gap-2 text-xs text-slate-700"><input v-model="nombresCompletos" type="checkbox" /> Incluir nombre y cédula de los empleados (queda anotado en el registro de actividad)</label>
              </div>
              <div class="flex gap-2">
                <button type="button" class="btn-secondary" @click="verVista(d)">{{ vista.id === d.id ? 'Ocultar' : 'Vista previa' }}</button>
                <button type="button" class="btn-primary" :disabled="bajando === d.id" @click="descargar(d)">{{ bajando === d.id ? 'Preparando…' : 'Descargar' }}</button>
              </div>
            </div>
            <div v-if="vista.id === d.id" class="mt-2 max-h-72 overflow-auto rounded border border-slate-200">
              <Cargando v-if="vista.cargando" texto="Cargando…" compacto />
              <table v-else class="w-full text-xs">
                <thead class="sticky top-0 bg-slate-100"><tr><th v-for="c in vista.columnas" :key="c" class="whitespace-nowrap px-2 py-1 text-left font-semibold text-slate-600">{{ c }}</th></tr></thead>
                <tbody>
                  <tr v-for="(f, i) in vista.filas" :key="i" class="border-t border-slate-100"><td v-for="c in vista.columnas" :key="c" class="whitespace-nowrap px-2 py-1">{{ f[c] ?? '' }}</td></tr>
                  <tr v-if="!vista.filas.length"><td :colspan="vista.columnas.length || 1" class="p-2 text-slate-500">Sin filas en este rango.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-base font-semibold text-slate-900">Conectar Power BI, Excel o Python</p>
            <p class="text-sm text-slate-500">Una clave de solo lectura permite que la herramienta se actualice sola, sin descargar archivos. No incluye planilla.</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary" @click="generarEnlace">{{ enlace?.activo ? 'Generar otra clave' : 'Generar clave' }}</button>
            <button v-if="enlace?.activo" type="button" class="btn-secondary" @click="revocarEnlace">Revocar</button>
          </div>
        </div>
        <p class="text-sm" :class="enlace?.activo ? 'text-green-600' : 'text-slate-500'">
          {{ enlace?.activo ? `Clave activa desde ${formatearFechaHora(enlace.creado)}${enlace.ultimoUso ? ` · último uso ${formatearFechaHora(enlace.ultimoUso)}` : ' · todavía sin usar'}` : 'No hay una clave activa: ninguna herramienta externa puede leer los datos.' }}
        </p>
        <div v-if="tokenNuevo" class="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
          <p class="font-semibold">Copiá esta clave ahora: no se vuelve a mostrar.</p>
          <p class="mt-1 break-all font-mono text-xs">{{ tokenNuevo }}</p>
          <button type="button" class="btn-secondary mt-2" @click="copiar(tokenNuevo, 'clave')">{{ copiado === 'clave' ? 'Copiada' : 'Copiar clave' }}</button>
        </div>
        <details class="text-sm text-slate-700">
          <summary class="cursor-pointer font-semibold">Power BI Desktop (Power Query)</summary>
          <p class="mt-1 text-xs text-slate-500">Obtener datos → Consulta en blanco → Editor avanzado, y pegue esto (cambie <span class="font-mono">ventas</span> por el conjunto que quieras; la lista de direcciones está abajo).</p>
          <pre class="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs">{{ ejemploPowerQuery }}</pre>
          <button type="button" class="btn-secondary mt-1" @click="copiar(ejemploPowerQuery, 'pq')">{{ copiado === 'pq' ? 'Copiado' : 'Copiar' }}</button>
        </details>
        <details class="text-sm text-slate-700">
          <summary class="cursor-pointer font-semibold">Python (pandas)</summary>
          <pre class="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs">{{ ejemploPython }}</pre>
          <button type="button" class="btn-secondary mt-1" @click="copiar(ejemploPython, 'py')">{{ copiado === 'py' ? 'Copiado' : 'Copiar' }}</button>
        </details>
        <details class="text-sm text-slate-700">
          <summary class="cursor-pointer font-semibold">Direcciones de cada conjunto</summary>
          <ul class="mt-1 flex flex-col gap-0.5 text-xs">
            <li v-for="d in catalogo.filter((x) => !x.personal)" :key="d.id" class="break-all font-mono">{{ urlFeed(d.id) }}<template v-if="d.conFecha">?desde=2026-01-01&amp;hasta=2026-12-31</template></li>
          </ul>
          <p class="mt-1 text-xs text-slate-500">Agregue <span class="font-mono">?formato=json</span> si prefiere JSON. Si la herramienta no permite encabezados, use <span class="font-mono">?token=TU_CLAVE</span> (la clave nunca queda en el registro de actividad).</p>
        </details>
      </div>
    </template>
  </div>
</template>
