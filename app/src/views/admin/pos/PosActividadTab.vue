<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Download } from '@lucide/vue';
import { api, ApiError } from '../../../lib/api.js';
import { descargarCsv } from '../../../lib/csv.js';
import { fechaHoyISO } from '../../../lib/format.js';

// Todo lo que pasa en las tiendas: lo hecho en la caja (aunque fuera sin internet, con su hora real) y los cambios hechos desde el panel.
const props = defineProps({ ubicaciones: { type: Array, default: () => [] } });
const hoy = fechaHoyISO();
const hace = (d) => {
  const f = new Date();
  f.setDate(f.getDate() - d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const desde = ref(hace(6));
const hasta = ref(hoy);
const tienda = ref('');
const tipo = ref('');
const origen = ref('');
const texto = ref('');
const filas = ref([]);
const error = ref('');
const cargando = ref(false);

const TIPOS = {
  caja_abierta: ['Caja abierta', 'normal'],
  caja_cerrada: ['Caja cerrada', 'normal'],
  entrada_sin_internet: ['Entrada sin internet', 'atencion'],
  sesion_vencida: ['Sesión vencida', 'normal'],
  sesion_confirmada: ['Contraseña confirmada', 'normal'],
  salida: ['Salida de la caja', 'normal'],
  linea_quitada: ['Producto quitado del tiquete', 'atencion'],
  tiquete_vaciado: ['Tiquete vaciado sin cobrar', 'atencion'],
  tiquete_reimpreso: ['Tiquete reimpreso', 'atencion'],
  recepcion_aceptada: ['Mercadería aceptada', 'normal'],
  conteo_inventario: ['Conteo de inventario (aumento)', 'atencion'],
  pedido_enviado: ['Pedido de mercadería', 'normal'],
  respaldo_guardado: ['Respaldo guardado', 'normal'],
  respaldo_restaurado: ['Respaldo restaurado', 'atencion'],
  tienda_elegida: ['Tienda asignada a la computadora', 'normal'],
  tienda_cambiada: ['Asignación de tienda quitada', 'atencion'],
  venta_anulada: ['Venta anulada', 'atencion'],
  convertido_en_prueba: ['Convertido en prueba', 'atencion'],
  precio_tienda: ['Precio o código de barras', 'normal'],
  minimo_stock: ['Stock mínimo', 'normal'],
  datos_tienda: ['Datos del tiquete de la tienda', 'normal'],
  config_pos: ['Configuración del POS', 'normal'],
  sincronizacion_rechazada: ['El servidor no aceptó un envío', 'error'],
};
const etiqueta = (t) => TIPOS[t]?.[0] ?? t;
const gravedad = (t) => TIPOS[t]?.[1] ?? 'normal';
const fmt = (d) => new Date(d).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const hora = (d) => new Date(d).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit', hour12: false });
// «Llegó tarde»: se hizo sin internet y se envió después (la hora que se muestra es la real).
const llegoTarde = (f) => new Date(f.recibidoEn).getTime() - new Date(f.fecha).getTime() > 2 * 60_000;

async function cargar() {
  cargando.value = true;
  try {
    const q = new URLSearchParams({ limite: '1000' });
    if (desde.value) q.set('desde', desde.value);
    if (hasta.value) q.set('hasta', hasta.value);
    if (tienda.value) q.set('ubicacionId', tienda.value);
    if (tipo.value) q.set('tipo', tipo.value);
    if (origen.value) q.set('origen', origen.value);
    if (texto.value.trim()) q.set('texto', texto.value.trim());
    filas.value = await api.get(`/pos/actividad?${q}`);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo leer la actividad.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch([desde, hasta, tienda, tipo, origen], cargar);

const atencion = computed(() => filas.value.filter((f) => gravedad(f.tipo) !== 'normal').length);

function exportar() {
  descargarCsv(`actividad-tiendas-${desde.value || 'inicio'}-a-${hasta.value || 'hoy'}`, [
    ['Fecha y hora real', (f) => fmt(f.fecha)],
    ['Tienda', (f) => f.tienda],
    ['Usuario', (f) => f.usuario],
    ['Qué pasó', (f) => etiqueta(f.tipo)],
    ['Detalle', (f) => f.detalle],
    ['Origen', (f) => (f.origen === 'panel' ? 'Panel' : 'Caja')],
    ['Hecho sin internet', (f) => !!f.sinConexion],
    ['Llegó al sistema', (f) => fmt(f.recibidoEn)],
  ], filas.value);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Desde<input v-model="desde" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Hasta<input v-model="hasta" type="date" class="input mt-1" /></label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Tienda
        <select v-model="tienda" class="input mt-1"><option value="">Todas</option><option v-for="u in props.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Qué pasó
        <select v-model="tipo" class="input mt-1"><option value="">Todo</option><option v-for="(v, k) in TIPOS" :key="k" :value="k">{{ v[0] }}</option></select>
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Origen
        <select v-model="origen" class="input mt-1"><option value="">Caja y panel</option><option value="caja">Solo la caja</option><option value="panel">Solo el panel</option></select>
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Buscar<input v-model="texto" type="text" placeholder="persona o detalle" class="input mt-1" @keyup.enter="cargar" /></label>
      <button type="button" class="btn-secondary" @click="cargar">Buscar</button>
      <button type="button" class="btn-secondary" :disabled="!filas.length" @click="exportar"><Download class="size-4" /> Descargar CSV</button>
      <div class="flex gap-1.5"><button type="button" class="btn-secondary" @click="desde = hoy; hasta = hoy">Hoy</button><button type="button" class="btn-secondary" @click="desde = hace(6); hasta = hoy">7 días</button><button type="button" class="btn-secondary" @click="desde = hace(29); hasta = hoy">30 días</button></div>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div class="card">
      <p class="text-sm text-slate-500">{{ filas.length }} registro(s)<span v-if="atencion"> · <b class="text-amber-600">{{ atencion }} para revisar</b> (marcados en color)</span>. La hora es la del momento en que ocurrió; lo hecho sin internet llega después y se marca.</p>
      <ul class="mt-2 divide-y divide-slate-100">
        <li v-for="f in filas" :key="f.id" class="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-start sm:gap-3">
          <span class="w-36 shrink-0 font-mono text-xs text-slate-500">{{ fmt(f.fecha) }}</span>
          <span class="w-28 shrink-0 text-xs text-slate-500">{{ f.tienda }}</span>
          <span class="min-w-0 flex-1">
            <span class="mr-1 rounded px-1.5 py-0.5 text-xs font-bold" :class="gravedad(f.tipo) === 'error' ? 'bg-red-100 text-red-700' : gravedad(f.tipo) === 'atencion' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'">{{ etiqueta(f.tipo) }}</span>
            <span class="text-slate-800">{{ f.detalle }}</span>
            <span class="block text-xs text-slate-500">{{ f.usuario || 'Sistema' }} · {{ f.origen === 'panel' ? 'desde el panel' : 'en la caja' }}<span v-if="f.sinConexion || llegoTarde(f)" class="ml-1 rounded-full bg-indigo-100 px-1.5 font-semibold text-indigo-700">sin internet · llegó {{ hora(f.recibidoEn) }}</span></span>
          </span>
        </li>
        <li v-if="!filas.length && !cargando" class="py-3 text-slate-500">No hay actividad en este rango.</li>
      </ul>
    </div>
  </div>
</template>
