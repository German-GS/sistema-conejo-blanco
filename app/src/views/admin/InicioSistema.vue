<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/format.js';
import GraficoLineas from '../../components/GraficoLineas.vue';

const RANGOS = [
  { min: 15, etiqueta: '15 min' },
  { min: 60, etiqueta: '1 hora' },
  { min: 360, etiqueta: '6 horas' },
  { min: 1440, etiqueta: '24 horas' },
];
const rango = ref(60);
const met = ref(null);
const salud = ref(null);
const error = ref('');
const verificando = ref(false);
let reloj = null;
let relojSalud = null;

async function cargarMetricas() {
  if (document.hidden) return;
  try {
    met.value = await api.get(`/sistema/metricas?minutos=${rango.value}`);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer las métricas.';
  }
}
async function cargarSalud() {
  if (document.hidden) return;
  try {
    salud.value = await api.get('/sistema/salud');
  } catch {
    /* las métricas ya muestran el error de conexión */
  }
}
const conexiones = ref(null);
async function cargarConexiones() {
  if (document.hidden) return;
  try {
    conexiones.value = await api.get('/sistema/conexiones');
  } catch {
    /* las métricas ya muestran el error de conexión */
  }
}
const ROLES = { sistema: 'Sistema', gerente_general: 'Gerente general', administracion: 'Administración', contador: 'Contador', asistente: 'Asistente', vendedor: 'Vendedor' };
// "hace 3 min", "hace 2 h", "hace 4 días": para ver de un vistazo cuándo fue la última actividad.
function haceCuanto(iso) {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  const d = Math.floor(min / 1440);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

async function verificarAhora() {
  verificando.value = true;
  try {
    await api.post('/sistema/integridad/ejecutar', {});
    await cargarSalud();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo verificar.';
  } finally {
    verificando.value = false;
  }
}
function elegirRango(m) {
  rango.value = m;
  cargarMetricas();
}

onMounted(() => {
  cargarMetricas();
  cargarSalud();
  cargarConexiones();
  reloj = setInterval(() => {
    cargarMetricas();
    cargarConexiones();
  }, 10_000);
  relojSalud = setInterval(cargarSalud, 60_000);
});
onBeforeUnmount(() => {
  clearInterval(reloj);
  clearInterval(relojSalud);
});

const n = (v) => new Intl.NumberFormat('es-CR').format(Math.round(v));
const d1 = (v) => (v ?? 0).toFixed(1);
const tiempoActivo = (s) => {
  const dias = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return dias > 0 ? `${dias} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
};
// Verde → ámbar → rojo según qué tan lleno está.
const colorUso = (p) => (p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#22c55e');

const tiempos = computed(() => met.value?.serie.map((p) => p.t) ?? []);
const serieHw = computed(() => [
  { nombre: 'CPU', color: '#60a5fa', datos: met.value?.serie.map((p) => p.cpu) ?? [] },
  { nombre: 'Memoria', color: '#c084fc', datos: met.value?.serie.map((p) => p.ram) ?? [] },
]);
const serieRtt = computed(() => [
  { nombre: 'Promedio', color: '#34d399', datos: met.value?.serie.map((p) => p.rtt) ?? [] },
  { nombre: 'Percentil 95', color: '#fbbf24', datos: met.value?.serie.map((p) => p.p95) ?? [] },
]);
const serieHttp = computed(() => [
  { nombre: 'Peticiones', color: '#60a5fa', datos: met.value?.serie.map((p) => p.req) ?? [] },
  { nombre: 'Errores 4xx', color: '#fbbf24', datos: met.value?.serie.map((p) => p.e4) ?? [] },
  { nombre: 'Errores 5xx', color: '#f87171', datos: met.value?.serie.map((p) => p.e5) ?? [] },
]);

const medidores = computed(() => {
  const a = met.value?.ahora;
  if (!a) return [];
  return [
    { clave: 'cpu', titulo: 'CPU', pct: a.cpu, detalle: `${a.cpus} núcleos · carga ${d1(a.cargaPromedio)}` },
    { clave: 'ram', titulo: 'Memoria RAM', pct: a.ram.pct, detalle: `${n(a.ram.usadoMB)} de ${n(a.ram.totalMB)} MB${a.ram.fuente === 'proceso' ? ' (este proceso)' : ''}` },
    {
      clave: 'disco',
      titulo: 'Almacenamiento',
      pct: a.disco?.pct ?? 0,
      detalle: a.disco ? `${a.disco.usadoGB} de ${a.disco.totalGB} GB` : 'sin dato',
    },
    {
      clave: 'swap',
      titulo: 'Swap',
      pct: a.swap?.pct ?? 0,
      detalle: !a.swap ? 'no disponible aquí' : a.swap.totalMB === 0 ? 'sin swap configurado' : `${n(a.swap.usadoMB)} de ${n(a.swap.totalMB)} MB`,
      sinDato: !a.swap || a.swap.totalMB === 0,
    },
  ];
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-xl font-bold text-slate-900">Estado del sistema</h1>
        <p class="text-xs text-slate-500">
          Se actualiza solo cada 10 segundos.
          <span v-if="met">Métricas del servidor desde {{ formatearFechaHora(met.desde) }} (se reinician si el servidor se reinicia).</span>
        </p>
      </div>
      <div class="flex gap-1.5">
        <button
          v-for="r in RANGOS"
          :key="r.min"
          type="button"
          class="rounded-lg border px-3 py-1 text-xs font-semibold"
          :class="rango === r.min ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
          @click="elegirRango(r.min)"
        >
          {{ r.etiqueta }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <template v-if="met">
      <!-- Hardware -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="m in medidores" :key="m.clave" class="card">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ m.titulo }}</p>
          <p class="mt-1 text-2xl font-bold text-slate-900">{{ m.sinDato ? '—' : `${d1(m.pct)} %` }}</p>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div class="h-full rounded-full transition-all" :style="{ width: `${m.sinDato ? 0 : Math.min(100, m.pct)}%`, background: colorUso(m.pct) }" />
          </div>
          <p class="mt-1.5 text-xs text-slate-500">{{ m.detalle }}</p>
        </div>
      </div>

      <!-- Tarjetas de operación -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <div class="card">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tiempo de actividad</p>
          <p class="mt-1 text-xl font-bold text-slate-900">{{ salud ? tiempoActivo(salud.iniciadoHace) : '—' }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ salud?.entorno }} · v{{ salud?.version }}</p>
        </div>
        <div class="card">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">RTT (latencia)</p>
          <p class="mt-1 text-xl font-bold text-slate-900">{{ n(met.http.rttPromedioMs) }} ms</p>
          <p class="mt-1 text-xs text-slate-500">p95 {{ n(met.http.rttP95Ms) }} ms · base de datos {{ met.ahora.rttBdMs }} ms</p>
        </div>
        <div class="card" :class="met.http.errores5xx > 0 ? 'ring-1 ring-red-500/50' : ''">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Errores HTTP</p>
          <p class="mt-1 text-xl font-bold" :class="met.http.tasaError5xx > 0 ? 'text-red-500' : 'text-slate-900'">{{ d1(met.http.tasaError5xx) }} % <span class="text-xs font-normal text-slate-500">5xx</span></p>
          <p class="mt-1 text-xs text-slate-500">{{ d1(met.http.tasaError4xx) }} % 4xx · {{ n(met.http.peticiones) }} peticiones</p>
        </div>
        <div class="card" :class="met.inicios.fallidos + met.inicios.bloqueos > 0 ? 'ring-1 ring-amber-500/50' : ''">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Inicios de sesión (24 h)</p>
          <p class="mt-1 text-xl font-bold text-slate-900">{{ n(met.inicios.correctos) }} <span class="text-xs font-normal text-slate-500">correctos</span></p>
          <p class="mt-1 text-xs text-slate-500">
            <span :class="met.inicios.fallidos > 0 ? 'font-semibold text-amber-500' : ''">{{ met.inicios.fallidos }} fallidos</span> · {{ met.inicios.bloqueos }} bloqueos<template v-if="met.inicios.dosPasosFallidos"> · {{ met.inicios.dosPasosFallidos }} fallos 2 pasos</template><template v-if="met.inicios.ipNoPermitida"> · {{ met.inicios.ipNoPermitida }} IP no permitida</template>
          </p>
        </div>
        <div class="card" :class="met.privilegios.denegados + met.privilegios.intentosAreaRestringida > 0 ? 'ring-1 ring-amber-500/50' : ''">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Uso de privilegios (24 h)</p>
          <p class="mt-1 text-xl font-bold text-slate-900">{{ met.privilegios.denegados }} <span class="text-xs font-normal text-slate-500">accesos denegados</span></p>
          <p class="mt-1 text-xs text-slate-500">{{ met.privilegios.intentosAreaRestringida }} intentos a áreas del sistema</p>
        </div>
        <div class="card" :class="salud && !salud.baseDatos.ok ? 'ring-1 ring-red-500/50' : ''">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Base de datos</p>
          <p class="mt-1 text-xl font-bold" :class="salud && !salud.baseDatos.ok ? 'text-red-500' : 'text-green-600'">{{ salud ? (salud.baseDatos.ok ? 'En línea' : 'Sin conexión') : '—' }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ salud?.baseDatos.version }}</p>
        </div>
      </div>

      <!-- Quién está conectado -->
      <div v-if="conexiones" class="card overflow-x-auto">
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-sm font-semibold text-slate-900">Conexiones</p>
          <p class="text-xs text-slate-500"><span class="font-semibold" :class="conexiones.enLinea > 0 ? 'text-green-600' : ''">{{ conexiones.enLinea }} en línea ahora</span> · {{ conexiones.total }} cuentas activas · "en línea" = actividad en los últimos 5 minutos</p>
        </div>
        <table class="w-full min-w-[40rem] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Persona</th><th class="py-1 pr-2">Perfil</th><th class="py-1 pr-2">Estado</th><th class="py-1 pr-2">Última actividad</th><th class="py-1 pr-2">Último inicio de sesión</th><th class="py-1">Desde</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in conexiones.cuentas" :key="c.id" class="border-b border-slate-100" :class="c.activo ? '' : 'opacity-50'">
              <td class="py-1 pr-2"><span class="font-medium text-slate-800">{{ c.nombre }}</span><span class="block text-xs text-slate-500">{{ c.email }}</span></td>
              <td class="py-1 pr-2">{{ ROLES[c.rol] ?? c.rol }}</td>
              <td class="py-1 pr-2 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-full" :class="c.enLinea ? 'bg-green-500' : 'bg-slate-400'" />{{ !c.activo ? 'Desactivada' : c.enLinea ? 'En línea' : 'Desconectada' }}</span>
              </td>
              <td class="py-1 pr-2 whitespace-nowrap" :title="c.ultimaActividad ? formatearFechaHora(c.ultimaActividad) : ''">{{ haceCuanto(c.ultimaActividad) }}</td>
              <td class="py-1 pr-2 whitespace-nowrap">{{ c.ultimoAcceso ? formatearFechaHora(c.ultimoAcceso) : 'nunca ha entrado' }}</td>
              <td class="py-1 text-xs text-slate-500">{{ c.dispositivo }}<template v-if="c.ip"> · {{ c.ip }}</template></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Gráficos -->
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Uso de CPU y memoria</p><GraficoLineas :series="serieHw" :tiempos="tiempos" unidad="%" :maximo="100" /></div>
        <div class="card"><p class="mb-1 text-sm font-semibold text-slate-900">Latencia de las peticiones (RTT)</p><GraficoLineas :series="serieRtt" :tiempos="tiempos" unidad=" ms" /></div>
        <div class="card xl:col-span-2"><p class="mb-1 text-sm font-semibold text-slate-900">Peticiones y errores HTTP ({{ met.pasoMin === 1 ? 'por minuto' : `cada ${met.pasoMin} min` }})</p><GraficoLineas :series="serieHttp" :tiempos="tiempos" /></div>
      </div>

      <!-- Privilegios por perfil -->
      <div class="card overflow-x-auto">
        <p class="mb-2 text-sm font-semibold text-slate-900">Actividad por perfil (24 h)</p>
        <table class="w-full min-w-[28rem] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Perfil</th><th class="py-1 pr-2 text-right">Cambios</th><th class="py-1 pr-2 text-right">Consultas sensibles</th><th class="py-1 text-right">Errores o denegados</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in met.privilegios.porRol" :key="r.rol" class="border-b border-slate-100">
              <td class="py-1 pr-2 font-medium text-slate-800">{{ r.rol }}</td>
              <td class="py-1 pr-2 text-right">{{ n(r.escrituras) }}</td>
              <td class="py-1 pr-2 text-right">{{ n(r.lecturas_sensibles) }}</td>
              <td class="py-1 text-right" :class="r.errores > 0 ? 'text-amber-500' : ''">{{ n(r.errores) }}</td>
            </tr>
            <tr v-if="!met.privilegios.porRol.length"><td colspan="4" class="py-2 text-slate-500">Sin actividad registrada.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Verificación de cálculos -->
    <div v-if="salud" class="card flex flex-col gap-2" :class="salud.integridad && !salud.integridad.ok ? 'ring-1 ring-red-500/60' : ''">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-base font-semibold text-slate-900">Verificación de cálculos</p>
        <button type="button" class="btn-secondary" :disabled="verificando" @click="verificarAhora">{{ verificando ? 'Verificando…' : 'Verificar ahora' }}</button>
      </div>
      <p v-if="!salud.integridad" class="text-sm text-slate-500">Todavía no se ha corrido. Corre sola cada noche después de las 2 a. m.</p>
      <template v-else>
        <p class="text-sm" :class="salud.integridad.ok ? 'text-green-600' : 'font-semibold text-red-500'">
          {{ salud.integridad.ok ? `Todo cuadra (${salud.integridad.total} reglas)` : `${salud.integridad.fallas.length} regla(s) con diferencias` }}
          · {{ formatearFechaHora(salud.integridad.verificadoEn) }} · {{ salud.integridad.origen }}
        </p>
        <ul v-if="!salud.integridad.ok" class="list-disc pl-5 text-sm text-red-500">
          <li v-for="f in salud.integridad.fallas" :key="f.codigo">{{ f.titulo }} ({{ f.cantidadProblemas }})</li>
        </ul>
      </template>
      <p class="text-xs text-slate-500">
        Cuentas activas: {{ salud.cuentas.usuarios_activos }} · bloqueadas ahora: {{ salud.cuentas.bloqueados }} · empleados activos: {{ salud.cuentas.empleados_activos }} · asientos: {{ n(salud.cuentas.asientos) }} · meses cerrados: {{ salud.cuentas.meses_cerrados }}
        · personas activas (24 h): {{ salud.actividad24h.usuarios }} · cambios (24 h): {{ n(salud.actividad24h.escrituras) }}
      </p>
    </div>
  </div>
</template>
