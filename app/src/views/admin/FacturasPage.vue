<script setup>
import VistasGuardadas from '../../components/VistasGuardadas.vue';
import { recordarFiltros, usarLimite } from '../../lib/filtros.js';
import MostrarMas from '../../components/MostrarMas.vue';
import Cargando from '../../components/Cargando.vue';
import EstadoEmision from '../../components/EstadoEmision.vue';
import { ESTADOS_EMISION } from '../../lib/emision.js';
import { computed, onMounted, ref, watch } from 'vue';
import { FileText, Download, Plus, Undo2, ShieldAlert } from '@lucide/vue';
import { api, ApiError, descargarArchivo } from '../../lib/api.js';
import { formatearColones, formatearFecha } from '../../lib/format.js';
import { PROVINCIAS, etiquetaProvincia } from '../../lib/provincias.js';

// "Cancelada" acá es en el sentido tico: pagada/saldada. Como todavía no
// existe el módulo de cuentas por cobrar, la categoría se calcula sola a
// partir del pedido detrás (ver FacturacionService.listarFacturas):
//   - pendiente: pedido a crédito, todavía por cobrar.
//   - cancelada: pedido a contado, ya cobrada al facturar.
//   - anulada: el pedido detrás fue anulado.
const TABS = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'cancelada', etiqueta: 'Canceladas' },
  { valor: 'anulada', etiqueta: 'Anuladas' },
];
const tabActiva = ref('pendiente');

const VENCIMIENTOS = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'vencidas', etiqueta: 'Vencidas' },
  { valor: 'proximos_7', etiqueta: 'Vence en 7 días o menos' },
  { valor: 'proximos_30', etiqueta: 'Vence en 30 días o menos' },
];

const facturas = ref([]);
const cargando = ref(true);
const error = ref('');
const clientesFiltro = ref([]);
const filtroClienteId = ref('');
const filtroProvincia = ref('');
const filtroVencimiento = ref('');
const filtroEmision = ref('');
const exportando = ref(false);

// El filtro por cliente/provincia/tiempo a vencer solo aplica dentro de
// Pendientes — en Canceladas/Anuladas no hay nada que "vencer" y el
// listado es simple.
const mostrarFiltrosPendientes = computed(() => tabActiva.value === 'pendiente');

function paramsActuales() {
  const params = new URLSearchParams();
  params.set('estado', tabActiva.value);
  if (filtroEmision.value) params.set('emision', filtroEmision.value);
  if (mostrarFiltrosPendientes.value) {
    if (filtroClienteId.value) params.set('clienteId', filtroClienteId.value);
    if (filtroProvincia.value) params.set('provincia', filtroProvincia.value);
    if (filtroVencimiento.value) params.set('vencimiento', filtroVencimiento.value);
  }
  return params;
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    facturas.value = await api.get(`/facturas?${paramsActuales().toString()}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar las facturas.';
  } finally {
    cargando.value = false;
  }
}

// Cuántas facturas hay en cada estado de emisión y qué falta para conectar con Hacienda.
const emision = ref(null);
const verFaltantes = ref(false);
async function cargarEmision() {
  try {
    emision.value = await api.get('/facturas/estado-emision');
  } catch {
    emision.value = null; // informativo: la lista funciona igual
  }
}

onMounted(async () => {
  cargarEmision();
  try {
    clientesFiltro.value = await api.get('/clientes');
  } catch {
    // El filtro por cliente es informativo — si falla, la página igual carga sin él.
  }
  await cargar();
});

watch([tabActiva, filtroClienteId, filtroProvincia, filtroVencimiento, filtroEmision], cargar);

async function exportar() {
  error.value = '';
  exportando.value = true;
  try {
    await descargarArchivo(`/facturas/exportar?${paramsActuales().toString()}`, 'facturas.xlsx');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo generar el Excel.';
  } finally {
    exportando.value = false;
  }
}

function claseVencimiento(diasParaVencer) {
  if (diasParaVencer < 0) return 'text-red-600';
  if (diasParaVencer <= 7) return 'text-amber-600';
  return 'text-slate-600';
}

function textoVencimiento(diasParaVencer) {
  if (diasParaVencer < 0) return `Vencida hace ${Math.abs(diasParaVencer)} día${Math.abs(diasParaVencer) === 1 ? '' : 's'}`;
  if (diasParaVencer === 0) return 'Vence hoy';
  return `Vence en ${diasParaVencer} día${diasParaVencer === 1 ? '' : 's'}`;
}

// --- Anular factura (genera Nota de Crédito) -----------------------------
// Hacienda no permite "borrar" ni editar una factura ya emitida — la
// única forma correcta de anularla es con este comprobante aparte (ver
// FacturacionService.anularFactura), que además revierte el inventario
// descontado y el asiento contable de la venta. Por eso pide motivo.
const anulandoId = ref('');
const motivoAnular = ref('');
const anulando = ref(false);
const errorAnular = ref('');

function alternarAnular(facturaId) {
  errorAnular.value = '';
  motivoAnular.value = '';
  anulandoId.value = anulandoId.value === facturaId ? '' : facturaId;
}

async function confirmarAnular(factura) {
  if (!motivoAnular.value.trim()) {
    errorAnular.value = 'Indique el motivo de la anulación.';
    return;
  }
  errorAnular.value = '';
  anulando.value = true;
  try {
    await api.post(`/facturas/${factura.id}/anular`, { motivo: motivoAnular.value.trim() });
    anulandoId.value = '';
    await cargar();
  } catch (err) {
    errorAnular.value = err instanceof ApiError ? err.message : 'No se pudo generar la nota de crédito.';
  } finally {
    anulando.value = false;
  }
}

// Los filtros se recuerdan al abrir una factura y volver; la lista larga se muestra de a 50.
recordarFiltros('facturas', { cliente: filtroClienteId, provincia: filtroProvincia, vencimiento: filtroVencimiento, emision: filtroEmision });
const { visibles: facturasVisibles, restantes: facturasRestantes, mostrarMas: mostrarMasFacturas, reiniciar: reiniciarFacturas, paso: pasoFacturas } = usarLimite(() => facturas.value);
watch([filtroClienteId, filtroProvincia, filtroVencimiento, filtroEmision], reiniciarFacturas);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <FileText class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Facturas</h1>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn-secondary" :disabled="exportando" @click="exportar">
          <Download class="size-4" />
          {{ exportando ? 'Generando…' : 'Exportar a Excel' }}
        </button>
        <router-link :to="{ name: 'admin-factura-nueva' }" class="btn-primary">
          <Plus class="size-4" /> Nueva factura
        </router-link>
      </div>
    </div>

    <div class="flex gap-2 border-b border-slate-200">
      <button
        v-for="tab in TABS"
        :key="tab.valor"
        type="button"
        class="border-b-2 px-4 py-2 text-base font-semibold transition-colors"
        :class="tabActiva === tab.valor ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="tabActiva = tab.valor"
      >
        {{ tab.etiqueta }}
      </button>
    </div>

    <div
      v-if="emision"
      class="rounded-xl border p-3 text-sm"
      :class="emision.cantidades.rechazada ? 'border-red-300 bg-red-50 text-red-900' : emision.conexion.conectado ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="flex items-center gap-1.5 font-semibold">
          <ShieldAlert class="size-4" />
          Emisión a Hacienda:
          {{ emision.conexion.conectado ? (emision.conexion.modo === 'pruebas' ? 'conectada (ambiente de pruebas)' : 'conectada') : 'todavía no conectada' }}
        </span>
        <span v-for="(info, clave) in ESTADOS_EMISION" :key="clave" class="flex items-center gap-1">
          <EstadoEmision :estado="clave" /> <strong>{{ emision.cantidades[clave] ?? 0 }}</strong>
        </span>
      </div>
      <p v-if="!emision.conexion.conectado" class="mt-1">
        Las facturas se crean y quedan <strong>pendientes de envío</strong>: no son válidas ante Hacienda hasta que se conecte y se emitan.
        <button type="button" class="font-semibold underline" @click="verFaltantes = !verFaltantes">{{ verFaltantes ? 'Ocultar' : 'Ver qué falta' }}</button>
      </p>
      <ul v-if="verFaltantes && emision.conexion.faltantes.length" class="mt-1 list-inside list-disc">
        <li v-for="f in emision.conexion.faltantes" :key="f">{{ f }}</li>
      </ul>
      <p v-if="emision.cantidades.rechazada" class="mt-1 font-semibold">Hay facturas rechazadas por Hacienda: no son válidas hasta corregirlas y emitirlas de nuevo.</p>
    </div>

    <VistasGuardadas
      v-if="mostrarFiltrosPendientes"
      clave="facturas"
      :actual="() => ({ cliente: filtroClienteId, provincia: filtroProvincia, vencimiento: filtroVencimiento })"
      :aplicar="(v) => { filtroClienteId = v.cliente ?? ''; filtroProvincia = v.provincia ?? ''; filtroVencimiento = v.vencimiento ?? ''; }"
    />
    <div class="card flex flex-col gap-4">
      <div class="max-w-xs">
        <label class="label">Estado de emisión</label>
        <select v-model="filtroEmision" class="input">
          <option value="">Todos</option>
          <option v-for="(info, clave) in ESTADOS_EMISION" :key="clave" :value="clave">{{ info.texto }}</option>
        </select>
      </div>
      <div v-if="mostrarFiltrosPendientes" class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label class="label">Cliente</label>
          <select v-model="filtroClienteId" class="input">
            <option value="">Todos los clientes</option>
            <option v-for="c in clientesFiltro" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
        <div>
          <label class="label">Provincia</label>
          <select v-model="filtroProvincia" class="input">
            <option value="">Todas las provincias</option>
            <option v-for="p in PROVINCIAS" :key="p.valor" :value="p.valor">{{ p.etiqueta }}</option>
          </select>
        </div>
        <div>
          <label class="label">Vencimiento</label>
          <select v-model="filtroVencimiento" class="input">
            <option v-for="v in VENCIMIENTOS" :key="v.valor" :value="v.valor">{{ v.etiqueta }}</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <Cargando v-if="cargando" texto="Cargando…" compacto />
      <p v-else-if="facturas.length === 0" class="text-sm text-slate-500">No hay facturas en esta categoría.</p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="f in facturasVisibles" :key="f.id" class="rounded-xl border border-slate-200 p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-base font-semibold text-slate-900">
                {{ f.cliente.nombre }}
                <span v-if="f.cliente.provincia" class="font-normal text-slate-500"> · {{ etiquetaProvincia(f.cliente.provincia) }}</span>
              </p>
              <p class="text-sm text-slate-500">
                {{ f.numeroOrden ? `Orden #${f.numeroOrden}` : 'Factura manual' }} · {{ f.consecutivo }} · Facturada {{ formatearFecha(f.fecha) }} ·
                {{ f.tipoPago === 'credito' ? 'Crédito' : 'Contado' }}
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-2">
                <span class="text-xs text-slate-500">Estado de emisión</span>
                <EstadoEmision :estado="f.estadoHacienda" :mensaje="f.mensajeHacienda" />
              </p>
              <p v-if="f.estadoHacienda === 'rechazada' && f.mensajeHacienda" class="text-xs font-medium text-red-600">{{ f.mensajeHacienda }}</p>
              <p v-if="f.notaCredito" class="text-sm font-medium text-red-600">
                Nota de crédito {{ f.notaCredito.consecutivo }} · {{ formatearFecha(f.notaCredito.fecha) }}
              </p>
            </div>
            <div class="text-right">
              <p v-if="f.diasParaVencer != null" class="text-base font-bold" :class="claseVencimiento(f.diasParaVencer)">
                {{ textoVencimiento(f.diasParaVencer) }}
              </p>
              <p class="text-sm text-slate-500">
                <template v-if="f.categoria === 'pendiente' && Number(f.pagado) > 0">Saldo {{ formatearColones(f.saldo) }} de {{ formatearColones(f.total) }}</template>
                <template v-else>{{ formatearColones(f.total) }}</template>
              </p>
              <router-link :to="{ name: 'admin-factura-detalle', params: { id: f.id } }" class="text-sm font-semibold text-blue-700 underline">Ver / imprimir</router-link>
              <button
                v-if="f.categoria !== 'anulada'"
                type="button"
                class="mt-1 flex items-center gap-1 text-sm font-semibold text-red-600 underline"
                @click="alternarAnular(f.id)"
              >
                <Undo2 class="size-4" />
                Nota de crédito
              </button>
            </div>
          </div>

          <div v-if="anulandoId === f.id" class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <label class="label">Motivo de la anulación</label>
            <input
              v-model="motivoAnular"
              type="text"
              placeholder="Ej. Error en el pedido, devolución del cliente…"
              class="input mb-2 bg-white"
            />
            <p v-if="errorAnular" class="mb-2 text-sm font-medium text-red-600">{{ errorAnular }}</p>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary flex-1" @click="anulandoId = ''">Cancelar</button>
              <button
                type="button"
                class="btn-primary flex-1 bg-red-600 hover:bg-red-700"
                :disabled="anulando"
                @click="confirmarAnular(f)"
              >
                {{ anulando ? 'Generando…' : 'Generar nota de crédito' }}
              </button>
            </div>
          </div>
        </li>
      </ul>
      <MostrarMas :restantes="facturasRestantes" :paso="pasoFacturas" @mas="mostrarMasFacturas" />
    </div>
  </div>
</template>
