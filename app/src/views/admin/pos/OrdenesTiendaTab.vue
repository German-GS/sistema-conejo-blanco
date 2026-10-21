<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';

// Pedidos de reposición de las tiendas, con su seguimiento: Enviado → Recibido → Revisado (aceptado/corregido, con el costo
// especial) → Alistado → Enviado a la tienda → Recibido y aceptado por la tienda (genera el asiento).
const props = defineProps({ ubicaciones: { type: Array, default: () => [] } });
const emit = defineEmits(['cambio']);
const auth = useAuthStore();
const puedeGestionar = auth.tienePermiso('pos.gestionar');
const puedeTraspasar = puedeGestionar && auth.tienePermiso('traspasos.gestionar');

const estado = ref('abiertos');
const tienda = ref('');
const ordenes = ref([]);
const cargando = ref(true);
const error = ref('');
const detalle = ref(null);
const trabajando = ref(false);
const nota = ref('');
const origenId = ref('');
const resolucion = ref('aceptada');
const aEnviar = ref({});
const costos = ref({});

const ESTADOS = [['abiertos', 'En curso'], ['enviada', 'Por recibir'], ['recibida', 'Por revisar'], ['revisada', 'Revisados'], ['alistada', 'Alistados'], ['en_camino', 'En camino'], ['entregada', 'Entregados'], ['rechazada', 'Rechazados'], ['cancelada', 'Cancelados'], ['', 'Todos']];
const COLOR = { enviada: 'bg-amber-100 text-amber-800', recibida: 'bg-amber-100 text-amber-800', revisada: 'bg-blue-100 text-blue-800', alistada: 'bg-blue-100 text-blue-800', en_camino: 'bg-indigo-100 text-indigo-800', entregada: 'bg-green-100 text-green-800', rechazada: 'bg-red-100 text-red-800', cancelada: 'bg-slate-200 text-slate-700' };
const PASOS = ['enviada', 'recibida', 'revisada', 'alistada', 'en_camino', 'entregada'];
const crc = (v) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 2 }).format(Number(v)));

async function cargar() {
  cargando.value = true;
  const q = new URLSearchParams();
  if (estado.value) q.set('estado', estado.value);
  if (tienda.value) q.set('ubicacionId', tienda.value);
  try {
    ordenes.value = await api.get(`/pos/ordenes?${q}`);
    error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron leer los pedidos de tienda.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch([estado, tienda], cargar);

async function abrir(id) {
  nota.value = '';
  error.value = '';
  try {
    detalle.value = await api.get(`/pos/ordenes/${id}`);
    origenId.value = detalle.value.bodegas[0]?.id ?? '';
    resolucion.value = 'aceptada';
    // Se propone enviar lo pedido sin pasarse de lo que hay en bodega, y el costo especial del último envío.
    aEnviar.value = Object.fromEntries(detalle.value.lineas.map((l) => [l.varianteId, Math.max(0, Math.min(l.cantidad, l.stockBodega))]));
    costos.value = Object.fromEntries(detalle.value.lineas.map((l) => [l.varianteId, l.costoSugerido ?? '']));
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo abrir el pedido.';
  }
}
const cambioCantidades = computed(() => detalle.value?.lineas.some((l) => Number(aEnviar.value[l.varianteId] || 0) !== l.cantidad) ?? false);
watch(cambioCantidades, (c) => {
  if (detalle.value?.estado === 'enviada' || detalle.value?.estado === 'recibida') resolucion.value = c ? 'corregida' : 'aceptada';
});
const totalEnviar = computed(() => Object.values(aEnviar.value).reduce((a, n) => a + Number(n || 0), 0));
const valorTienda = computed(() => (detalle.value?.lineas ?? []).reduce((a, l) => a + Number(aEnviar.value[l.varianteId] || 0) * Number(costos.value[l.varianteId] || 0), 0));
const valorNormal = computed(() => (detalle.value?.lineas ?? []).reduce((a, l) => a + Number(aEnviar.value[l.varianteId] || 0) * Number(l.costoNormal ?? costos.value[l.varianteId] ?? 0), 0));
const pasoActual = computed(() => PASOS.indexOf(detalle.value?.estado));

async function accion(ruta, cuerpo, mensajeOk) {
  error.value = '';
  trabajando.value = true;
  try {
    await api.post(`/pos/ordenes/${detalle.value.id}/${ruta}`, cuerpo);
    const id = detalle.value.id;
    await cargar();
    emit('cambio');
    await abrir(id);
    if (mensajeOk) error.value = '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo completar la acción.';
  } finally {
    trabajando.value = false;
  }
}
const recibir = () => accion('recibir', { nota: nota.value.trim() || undefined });
const alistar = () => accion('alistar', { nota: nota.value.trim() || undefined });
const enviar = () => {
  if (window.confirm('Esto descuenta la mercadería de la bodega y la deja en camino a la tienda. ¿Enviar?')) return accion('enviar', {});
};
const revisar = () =>
  accion('revisar', {
    resolucion: resolucion.value,
    nota: nota.value.trim() || undefined,
    origenId: origenId.value,
    lineas: detalle.value.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: Math.round(Number(aEnviar.value[l.varianteId] || 0)), costoTienda: costos.value[l.varianteId] === '' ? undefined : Number(costos.value[l.varianteId]) })),
  });
async function cerrar(nuevo) {
  if (nuevo === 'rechazada' && !nota.value.trim()) return (error.value = 'Escriba el motivo del rechazo en la nota.');
  return accion('estado', { estado: nuevo, respuesta: nota.value.trim() || undefined });
}
const enRevision = computed(() => detalle.value && (detalle.value.estado === 'enviada' || detalle.value.estado === 'recibida'));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="card flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Estado
        <select v-model="estado" class="input mt-1"><option v-for="e in ESTADOS" :key="e[0]" :value="e[0]">{{ e[1] }}</option></select>
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Tienda
        <select v-model="tienda" class="input mt-1"><option value="">Todas</option><option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </label>
    </div>
    <p v-if="error && !detalle" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
    <p v-else-if="!ordenes.length" class="text-sm text-slate-500">No hay pedidos de tienda con este filtro.</p>
    <ul class="flex flex-col gap-2">
      <li v-for="o in ordenes" :key="o.id">
        <button type="button" class="card flex w-full flex-wrap items-center justify-between gap-2 text-left" @click="abrir(o.id)">
          <div>
            <p class="flex flex-wrap items-center gap-1.5 text-base font-semibold text-slate-900">{{ o.numeroTexto }} — {{ o.tienda }}
              <span v-if="o.prueba" class="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-white">PRUEBA · sin asiento</span>
              <span v-if="o.urgente" class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Urgente</span>
              <span v-if="o.resolucion" class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{{ o.resolucion === 'aceptada' ? 'Aceptado' : 'Corregido' }}</span>
              <span v-if="o.sinConexion" class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">hecho sin internet</span></p>
            <p class="text-sm text-slate-500">{{ o.fecha }} · {{ o.solicitante }} · {{ o.productos }} producto(s) · {{ o.pares }} pares<span v-if="o.numeroTraspaso"> · traspaso #{{ o.numeroTraspaso }}</span></p>
            <p v-if="o.notas" class="text-sm text-slate-600">«{{ o.notas }}»</p>
          </div>
          <span class="rounded px-2 py-0.5 text-xs font-semibold" :class="COLOR[o.estado]">{{ o.etiqueta }}</span>
        </button>
      </li>
    </ul>

    <div v-if="detalle" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3" @click.self="detalle = null">
      <div class="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="text-lg font-bold text-slate-900">Pedido {{ detalle.numeroTexto }} — {{ detalle.tienda }}</p>
            <p class="text-sm text-slate-500">{{ detalle.solicitante }} · {{ new Date(detalle.fecha).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) }}<span v-if="detalle.urgente" class="ml-1 font-semibold text-red-600"> · URGENTE</span><span v-if="detalle.prueba" class="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-white">PRUEBA · no genera asiento</span></p>
          </div>
          <span class="rounded px-2 py-0.5 text-sm font-semibold" :class="COLOR[detalle.estado]">{{ detalle.etiqueta }}</span>
        </div>
        <p v-if="detalle.notas" class="mt-1 text-sm text-slate-700">Nota de la tienda: «{{ detalle.notas }}»</p>

        <!-- Seguimiento -->
        <ol class="mt-3 flex flex-wrap gap-x-1 gap-y-1 text-xs">
          <li v-for="(p, i) in PASOS" :key="p" class="flex items-center gap-1"><span class="rounded-full px-2 py-0.5 font-semibold" :class="i <= pasoActual ? COLOR[p] : 'bg-slate-100 text-slate-400'">{{ ['Enviado', 'Recibido', 'Revisado', 'Alistado', 'En camino', 'Aceptado por la tienda'][i] }}</span><span v-if="i < PASOS.length - 1" class="text-slate-300">›</span></li>
        </ol>
        <ul class="mt-2 space-y-0.5 text-xs text-slate-600">
          <li v-for="(e, i) in detalle.eventos" :key="i"><span class="font-semibold">{{ e.fecha }}</span> · {{ e.etiqueta }}<span v-if="e.usuario"> — {{ e.usuario }}</span><span v-if="e.nota" class="italic"> · «{{ e.nota }}»</span></li>
        </ul>
        <p v-if="detalle.traspaso" class="mt-1 text-sm text-blue-700">Traspaso #{{ detalle.traspaso.numero }} ({{ detalle.traspaso.estado.replace(/_/g, ' ') }})<span v-if="detalle.asiento"> · asiento contable #{{ detalle.asiento }}</span></p>

        <table class="mt-3 w-full text-sm">
          <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2 text-right">Pidió</th><th class="py-1 pr-2 text-right">Tienda hoy</th><th class="py-1 pr-2 text-right">Bodega hoy</th><th class="py-1 pr-2 text-right">{{ enRevision ? 'Enviar' : 'Enviado' }}</th><th class="py-1 pr-2 text-right">Costo especial</th><th v-if="detalle.estado === 'entregada'" class="py-1 text-right">Recibido</th></tr></thead>
          <tbody>
            <tr v-for="l in detalle.lineas" :key="l.varianteId" class="border-b border-slate-100">
              <td class="py-1.5 pr-2"><span class="font-medium text-slate-800">{{ l.codigo }} · {{ l.color }}</span><span class="block text-xs text-slate-500">mínimo {{ l.minimo || '—' }} · sugerido {{ l.sugerida }} · costo normal {{ crc(l.costoNormal) }}</span></td>
              <td class="py-1.5 pr-2 text-right font-semibold">{{ l.cantidad }}</td>
              <td class="py-1.5 pr-2 text-right">{{ l.stockTiendaAhora }}</td>
              <td class="py-1.5 pr-2 text-right" :class="l.stockBodega < l.cantidad ? 'font-semibold text-red-600' : ''">{{ l.stockBodega }}</td>
              <td class="py-1.5 pr-2 text-right"><input v-if="enRevision && puedeTraspasar" v-model="aEnviar[l.varianteId]" type="number" min="0" step="1" class="input !min-h-9 !w-20 text-right" /><span v-else>{{ l.cantidadAprobada ?? '—' }}</span></td>
              <td class="py-1.5 pr-2 text-right"><input v-if="enRevision && puedeTraspasar" v-model="costos[l.varianteId]" type="number" min="0" step="0.01" placeholder="₡ por par" class="input !min-h-9 !w-28 text-right" /><span v-else>{{ crc(l.costoTienda) }}</span></td>
              <td v-if="detalle.estado === 'entregada'" class="py-1.5 text-right" :class="l.cantidadRecibida !== l.cantidadAprobada ? 'font-semibold text-amber-600' : ''">{{ l.cantidadRecibida ?? '—' }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Revisión -->
        <div v-if="enRevision && puedeTraspasar" class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-sm font-semibold text-slate-900">Revisión</p>
          <div class="mt-1 flex flex-wrap items-center gap-4 text-sm">
            <label class="flex items-center gap-1.5"><input v-model="resolucion" type="radio" value="aceptada" :disabled="cambioCantidades" /> Aceptado (se envía lo pedido)</label>
            <label class="flex items-center gap-1.5"><input v-model="resolucion" type="radio" value="corregida" /> Corregido (se envía lo que hay en bodega)</label>
          </div>
          <input v-model="nota" type="text" maxlength="300" :placeholder="resolucion === 'corregida' ? 'Anotación obligatoria: qué se corrigió y por qué' : 'Anotación (opcional)'" class="input mt-2" />
          <div class="mt-2 flex flex-wrap items-end gap-3">
            <label class="flex flex-col text-xs font-semibold text-slate-500">Sale de<select v-model="origenId" class="input mt-1"><option v-for="b in detalle.bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option></select></label>
            <p class="text-xs text-slate-500">{{ totalEnviar }} pares · a costo especial {{ crc(valorTienda) }} · a costo normal {{ crc(valorNormal) }}<template v-if="valorNormal > valorTienda"> · diferencia {{ crc(valorNormal - valorTienda) }}</template></p>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button v-if="detalle.estado === 'enviada'" type="button" class="btn-secondary" :disabled="trabajando" @click="recibir">Solo marcar como recibido</button>
            <button type="button" class="btn-primary" :disabled="trabajando || !origenId || totalEnviar <= 0" @click="revisar">Guardar revisión y armar traspaso</button>
          </div>
        </div>
        <div v-else-if="enRevision && puedeGestionar" class="mt-3"><button v-if="detalle.estado === 'enviada'" type="button" class="btn-secondary" :disabled="trabajando" @click="recibir">Marcar como recibido</button></div>

        <!-- Siguientes pasos -->
        <div v-if="puedeGestionar && (detalle.estado === 'revisada' || detalle.estado === 'alistada')" class="mt-3 flex flex-wrap items-center gap-2">
          <input v-if="detalle.estado === 'revisada'" v-model="nota" type="text" maxlength="300" placeholder="Nota del alistado (opcional)" class="input !w-64" />
          <button v-if="detalle.estado === 'revisada'" type="button" class="btn-secondary" :disabled="trabajando" @click="alistar">Marcar como alistado</button>
          <button v-if="puedeTraspasar" type="button" class="btn-primary" :disabled="trabajando" @click="enviar">Enviar a la tienda</button>
        </div>
        <p v-if="detalle.estado === 'en_camino'" class="mt-3 text-sm text-indigo-700">Esperando que la tienda verifique lo recibido y lo acepte desde su caja.</p>
        <p v-if="detalle.respuesta && !enRevision" class="mt-2 text-sm text-slate-700">Anotación de la revisión: {{ detalle.respuesta }}</p>

        <div v-if="puedeGestionar && enRevision" class="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button type="button" class="btn-secondary" :disabled="trabajando" @click="cerrar('rechazada')">Rechazar (usa la nota como motivo)</button>
          <button type="button" class="btn-secondary" :disabled="trabajando" @click="cerrar('cancelada')">Cancelar pedido</button>
        </div>
        <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
        <button type="button" class="btn-secondary mt-3 w-full" @click="detalle = null">Cerrar</button>
      </div>
    </div>
  </div>
</template>
