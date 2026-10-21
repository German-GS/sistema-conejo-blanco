<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Barcode, CloudOff, Cloud, Minus, Plus, Printer, RefreshCw, Trash2, TriangleAlert, X } from '@lucide/vue';
import { useAuthStore } from '../../stores/auth.js';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFechaHora } from '../../lib/format.js';
import {
  abrirCaja, alertasLocales, buscar, buscarExacto, cambiarTienda, cerrarCaja, cobrar, descargarCatalogo, detenerPos, efectivoEsperado, elegirTienda,
  guardarImprimirAuto, iniciarPos, numeroTexto, pendientes, pos, rechazadas, reintentarRechazadas, resumenTurno, sincronizar, stockDe, sugerenciasPedido, ordenesPendientes,
} from '../../lib/pos.js';
import TiquetePos from './TiquetePos.vue';
import PedidoReposicion from './PedidoReposicion.vue';

const auth = useAuthStore();
const router = useRouter();
const cajero = computed(() => ({ id: auth.usuario.id, nombre: auth.usuario.nombre }));

// ---- Tienda de esta terminal
const tiendas = ref([]);
const errorTienda = ref('');
async function cargarTiendas() {
  errorTienda.value = '';
  try {
    tiendas.value = await api.get('/pos/tiendas');
  } catch (err) {
    errorTienda.value = err instanceof ApiError ? err.message : 'No se pudo leer la lista de tiendas. Se necesita internet la primera vez.';
  }
}

// ---- Búsqueda y tiquete
const texto = ref('');
const entrada = ref(null);
const carrito = ref([]);
const resultados = computed(() => buscar(texto.value));
const total = computed(() => Math.round(carrito.value.reduce((a, l) => a + l.precio * l.cantidad, 0) * 100) / 100);
const pares = computed(() => carrito.value.reduce((a, l) => a + l.cantidad, 0));
const aviso = ref('');
let avisoTimer = null;
function avisar(m) {
  aviso.value = m;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (aviso.value = ''), 4000);
}

function agregar(v) {
  const existente = carrito.value.find((l) => l.varianteId === v.varianteId);
  if (existente) existente.cantidad += 1;
  else carrito.value.push({ varianteId: v.varianteId, codigo: v.codigo, nombre: v.nombre, color: v.color, precio: v.precio, cantidad: 1 });
  if (stockDe(v.varianteId) - (carrito.value.find((l) => l.varianteId === v.varianteId)?.cantidad ?? 0) < 0) avisar(`${v.codigo} ${v.color}: según el sistema no hay existencias suficientes. Puede venderlo igual y revisar el conteo después.`);
  texto.value = '';
  entrada.value?.focus();
}

function alEnter() {
  const exacto = buscarExacto(texto.value);
  if (exacto) return agregar(exacto);
  if (resultados.value.length === 1) return agregar(resultados.value[0]);
  if (!resultados.value.length && texto.value.trim()) avisar('No se encontró ese producto (¿tiene precio de tienda y código?).');
}

function cambiarCantidad(l, d) {
  l.cantidad = Math.max(1, l.cantidad + d);
}
function quitar(l) {
  carrito.value = carrito.value.filter((x) => x !== l);
  entrada.value?.focus();
}
function vaciar() {
  if (!carrito.value.length || window.confirm('¿Vaciar el tiquete?')) carrito.value = [];
  entrada.value?.focus();
}

// ---- Cobro
const cobrando = ref(false);
const pagos = ref([]);
const errorCobro = ref('');
const guardando = ref(false);
const MEDIOS = [
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta'],
  ['sinpe', 'SINPE Móvil'],
  ['transferencia', 'Transferencia'],
];
const pagado = computed(() => Math.round(pagos.value.reduce((a, p) => a + (Number(p.monto) || 0), 0) * 100) / 100);
const faltante = computed(() => Math.round((total.value - pagado.value) * 100) / 100);
const vuelto = computed(() => pagos.value.filter((p) => p.medio === 'efectivo' && p.recibido !== '' && p.recibido !== null).reduce((a, p) => a + Math.max(0, Number(p.recibido) - Number(p.monto)), 0));

function abrirCobro() {
  if (!carrito.value.length) return;
  if (!pos.caja) return avisar('Abra la caja antes de cobrar.');
  errorCobro.value = '';
  pagos.value = [{ medio: 'efectivo', monto: total.value, referencia: '', recibido: '' }];
  cobrando.value = true;
}
function agregarPago(medio) {
  pagos.value.push({ medio, monto: Math.max(0, faltante.value), referencia: '', recibido: '' });
}
function quitarPago(i) {
  pagos.value.splice(i, 1);
}
function billete(p, v) {
  p.recibido = v;
}
const RAPIDOS = [1000, 2000, 5000, 10000, 20000, 50000];

async function confirmarCobro() {
  errorCobro.value = '';
  for (const p of pagos.value) {
    if (!(Number(p.monto) > 0)) return (errorCobro.value = 'Cada forma de pago debe tener un monto.');
    if (p.medio === 'efectivo' && p.recibido !== '' && Number(p.recibido) < Number(p.monto)) return (errorCobro.value = 'El efectivo recibido es menor que el monto.');
  }
  if (Math.abs(faltante.value) > 0.001) return (errorCobro.value = faltante.value > 0 ? `Faltan ${formatearColones(faltante.value)}.` : `Los pagos se pasan por ${formatearColones(-faltante.value)}.`);
  guardando.value = true;
  try {
    const venta = await cobrar(
      carrito.value,
      pagos.value.map((p) => ({ medio: p.medio, monto: Number(p.monto), referencia: p.referencia, recibido: p.medio === 'efectivo' && p.recibido !== '' ? Number(p.recibido) : undefined })),
      cajero.value,
    );
    carrito.value = [];
    cobrando.value = false;
    ultimaVenta.value = venta;
    if (pos.imprimirAuto) await imprimir(venta);
  } catch (err) {
    errorCobro.value = err instanceof Error ? err.message : 'No se pudo guardar la venta.';
  } finally {
    guardando.value = false;
  }
}

// ---- Tiquete e impresión
const ultimaVenta = ref(null);
const ventaImpresion = ref(null);
async function imprimir(venta) {
  ventaImpresion.value = venta;
  await nextTick();
  document.body.classList.add('imprimiendo-tiquete');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo-tiquete');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
  setTimeout(limpiar, 1500);
}

// ---- Caja
const panel = ref(''); // '', 'caja', 'turno', 'alertas', 'rechazadas'
const pidiendo = ref(false);
const enCaminoTienda = computed(() => pos.ordenesRecientes.filter((o) => o.puedeRecibir).length);
const fondo = ref('');
const contado = ref('');
const notasCaja = ref('');
const errorCaja = ref('');
async function hacerAbrirCaja() {
  errorCaja.value = '';
  try {
    await abrirCaja(Number(fondo.value || 0), cajero.value);
    fondo.value = '';
    panel.value = '';
    entrada.value?.focus();
  } catch (err) {
    errorCaja.value = err instanceof Error ? err.message : 'No se pudo abrir la caja.';
  }
}
const cierreHecho = ref(null);
async function hacerCerrarCaja() {
  errorCaja.value = '';
  if (contado.value === '') return (errorCaja.value = 'Cuente el efectivo de la gaveta e indíquelo.');
  if (carrito.value.length && !window.confirm('Hay un tiquete sin cobrar que se perderá. ¿Cerrar la caja de todos modos?')) return;
  try {
    carrito.value = [];
    cierreHecho.value = await cerrarCaja(Number(contado.value), notasCaja.value);
    contado.value = '';
    notasCaja.value = '';
  } catch (err) {
    errorCaja.value = err instanceof Error ? err.message : 'No se pudo cerrar la caja.';
  }
}
const turno = computed(() => resumenTurno());
const ventasTurno = computed(() => [...pos.ventas].filter((v) => pos.caja && v.cajaId === pos.caja.id).reverse());
const ETIQUETA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE', transferencia: 'Transferencia' };

// ---- Salir
function salir() {
  if (auth.esAdministracion) router.push({ name: 'admin-home' });
  else {
    auth.logout();
    router.push({ name: 'login' });
  }
}
async function elegir(t) {
  await elegirTienda(t);
}
async function cambiar() {
  try {
    if (!window.confirm('¿Cambiar la tienda de esta terminal?')) return;
    await cambiarTienda();
    cargarTiendas();
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo cambiar la tienda.');
  }
}

// ---- Teclado: F2 buscar, F12 cobrar, Esc cierra
function teclas(e) {
  if (e.key === 'F2') {
    e.preventDefault();
    entrada.value?.focus();
  } else if (e.key === 'F12') {
    e.preventDefault();
    if (!cobrando.value) abrirCobro();
    else confirmarCobro();
  } else if (e.key === 'Escape') {
    if (cobrando.value) cobrando.value = false;
    else if (panel.value) panel.value = '';
    else if (pidiendo.value) pidiendo.value = false;
  }
}

onMounted(async () => {
  await iniciarPos();
  // El encargado de tienda entra directo a la caja de SU tienda (la que tiene asignada en Control de accesos).
  const asignada = auth.tiendaAsignada;
  if (auth.esEncargadoTienda) {
    if (!asignada) errorTienda.value = 'Su cuenta no tiene una tienda asignada. Pídale al administrador que se la asigne en Control de accesos.';
    else if (pos.tienda?.id !== asignada.id) await elegirTienda(asignada);
  } else if (!pos.tienda) cargarTiendas();
  window.addEventListener('keydown', teclas);
  entrada.value?.focus();
});
onBeforeUnmount(() => {
  detenerPos();
  window.removeEventListener('keydown', teclas);
});
watch(
  () => [pos.tienda, pos.caja],
  async () => {
    await nextTick();
    entrada.value?.focus();
  },
);
</script>

<template>
  <div class="fixed inset-0 z-40 flex flex-col bg-slate-100 text-slate-900">
    <!-- Barra superior -->
    <header class="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
      <p class="text-base font-bold">{{ pos.tienda?.nombre ?? 'Punto de venta' }}</p>
      <span v-if="pos.caja" class="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Caja abierta</span>
      <span v-else-if="pos.tienda" class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Caja cerrada</span>
      <span class="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <span class="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold" :class="pos.enLinea ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
          <component :is="pos.enLinea ? Cloud : CloudOff" class="h-3.5 w-3.5" /> {{ pos.enLinea ? 'En línea' : 'Sin conexión' }}
        </span>
        <button v-if="pendientes.length || rechazadas.length || pos.sincronizando" type="button" class="flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900" @click="rechazadas.length ? (panel = 'rechazadas') : sincronizar()">
          <RefreshCw class="h-3.5 w-3.5" :class="pos.sincronizando ? 'animate-spin' : ''" />
          {{ rechazadas.length ? `${rechazadas.length} rechazada(s)` : `${pendientes.length} sin enviar` }}
        </button>
        <button v-if="pos.tienda" type="button" class="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" :class="alertasLocales.length ? 'border-red-400 bg-red-50 text-red-700' : ''" @click="panel = 'alertas'">
          <TriangleAlert v-if="alertasLocales.length" class="mr-1 inline h-3.5 w-3.5" />Inventario bajo ({{ alertasLocales.length }})
        </button>
        <button v-if="pos.tienda" type="button" class="rounded border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800" @click="pidiendo = true">Pedir mercadería<span v-if="sugerenciasPedido.length" class="ml-1 rounded-full bg-blue-600 px-1.5 text-white">{{ sugerenciasPedido.length }}</span><span v-if="ordenesPendientes.length" class="ml-1 text-amber-700">· {{ ordenesPendientes.length }} sin enviar</span><span v-if="enCaminoTienda" class="ml-1 rounded-full bg-indigo-600 px-1.5 text-white">{{ enCaminoTienda }} en camino</span></button>
        <button v-if="pos.tienda" type="button" class="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" @click="panel = 'turno'">Ventas del turno</button>
        <button v-if="pos.tienda" type="button" class="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" @click="panel = 'caja'">{{ pos.caja ? 'Cerrar caja' : 'Abrir caja' }}</button>
        <span class="hidden text-xs text-slate-500 sm:inline">{{ auth.usuario?.nombre }}</span>
        <button type="button" class="rounded bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white" @click="salir">{{ auth.esAdministracion ? 'Volver al panel' : 'Salir' }}</button>
      </span>
    </header>

    <p v-if="!pos.enLinea" class="bg-red-600 px-3 py-1 text-center text-sm font-semibold text-white">Sin conexión a internet: puede seguir vendiendo. Las ventas se guardan en esta computadora y se envían solas cuando vuelva la conexión.</p>
    <p v-if="pos.avisoSync" class="bg-amber-100 px-3 py-1 text-center text-sm text-amber-900">{{ pos.avisoSync }}</p>
    <p v-if="pos.error" class="bg-red-100 px-3 py-1 text-center text-sm text-red-800">{{ pos.error }}</p>

    <!-- Elegir la tienda de esta terminal (solo la primera vez) -->
    <main v-if="pos.listo && !pos.tienda && auth.esEncargadoTienda" class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 text-center">
        <p class="text-lg font-bold">Caja de tienda</p>
        <p v-if="errorTienda" class="mt-2 text-sm font-medium text-red-600">{{ errorTienda }}</p>
        <p v-else class="mt-2 text-sm text-slate-600">Preparando la caja de su tienda…</p>
      </div>
    </main>
    <main v-else-if="pos.listo && !pos.tienda" class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6">
        <p class="text-lg font-bold">¿De qué tienda es esta terminal?</p>
        <p class="mb-3 text-sm text-slate-600">Se elige una sola vez (hace falta internet). Después la terminal trabaja sola, también sin conexión.</p>
        <p v-if="errorTienda" class="mb-2 text-sm font-medium text-red-600">{{ errorTienda }}</p>
        <button v-for="t in tiendas" :key="t.id" type="button" class="mb-2 w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-left text-base font-semibold hover:border-blue-500 hover:bg-blue-50" @click="elegir(t)">{{ t.nombre }} <span class="text-sm font-normal text-slate-500">({{ t.codigo }})</span></button>
        <p v-if="!tiendas.length && !errorTienda" class="text-sm text-slate-500">No hay tiendas activas. Cree una en Bodega → Ubicaciones.</p>
        <button type="button" class="mt-2 text-sm text-slate-500 underline" @click="cargarTiendas">Actualizar lista</button>
      </div>
    </main>

    <!-- Pantalla de venta -->
    <main v-else-if="pos.listo" class="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section class="flex min-h-0 flex-col gap-2">
        <div class="relative">
          <Barcode class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input ref="entrada" v-model="texto" type="text" autocomplete="off" placeholder="Escanee el código o escriba el producto (F2)" class="w-full rounded-xl border-2 border-slate-300 bg-white py-3 pl-11 pr-3 text-lg outline-none focus:border-blue-500" @keydown.enter.prevent="alEnter" />
        </div>
        <p v-if="aviso" class="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{{ aviso }}</p>
        <p v-if="!pos.catalogo" class="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-700">Descargando el catálogo de la tienda… (se necesita internet la primera vez)</p>
        <p v-else-if="!pos.catalogo.variantes.length" class="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Todavía no hay productos con precio de tienda. En el panel, Tienda → Productos de tienda, asigne el precio al detalle.</p>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <ul v-if="resultados.length" class="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <li v-for="v in resultados" :key="v.varianteId">
              <button type="button" class="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left hover:border-blue-500 hover:bg-blue-50" @click="agregar(v)">
                <span class="min-w-0"><span class="block truncate text-base font-semibold">{{ v.codigo }} · {{ v.color }}</span><span class="block truncate text-xs text-slate-500">{{ v.nombre }}</span></span>
                <span class="text-right"><span class="block text-base font-bold">{{ formatearColones(v.precio) }}</span><span class="block text-xs" :class="stockDe(v.varianteId) <= 0 ? 'font-semibold text-red-600' : stockDe(v.varianteId) <= v.minimo ? 'font-semibold text-amber-600' : 'text-slate-500'">{{ stockDe(v.varianteId) <= 0 ? 'Sin existencias' : `${stockDe(v.varianteId)} en tienda` }}</span></span>
              </button>
            </li>
          </ul>
          <div v-else-if="ultimaVenta" class="rounded-xl border border-green-300 bg-green-50 p-4">
            <p class="text-base font-bold text-green-900">Venta guardada: tiquete {{ numeroTexto(ultimaVenta) }} · {{ formatearColones(ultimaVenta.total) }}</p>
            <p v-if="ultimaVenta.pagos.some((p) => p.medio === 'efectivo' && p.recibido > p.monto)" class="text-lg font-bold text-green-900">Vuelto: {{ formatearColones(ultimaVenta.pagos.filter((p) => p.medio === 'efectivo' && p.recibido !== undefined).reduce((a, p) => a + Math.max(0, p.recibido - p.monto), 0)) }}</p>
            <p class="text-xs text-green-800">{{ ultimaVenta.enviada ? 'Ya está en el sistema.' : pos.enLinea ? 'Enviando…' : 'Guardada en esta computadora; se enviará cuando haya internet.' }}</p>
            <div class="mt-2 flex gap-2">
              <button type="button" class="btn-secondary" @click="imprimir(ultimaVenta)"><Printer class="h-4 w-4" /> Reimprimir tiquete</button>
              <button type="button" class="btn-secondary" @click="ultimaVenta = null">Cerrar</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Tiquete en curso -->
      <aside class="flex min-h-0 flex-col rounded-2xl border border-slate-300 bg-white">
        <div class="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <p class="font-semibold">Tiquete en curso <span class="text-sm font-normal text-slate-500">({{ pares }} {{ pares === 1 ? 'par' : 'pares' }})</span></p>
          <button v-if="carrito.length" type="button" class="text-sm text-slate-500 underline" @click="vaciar">Vaciar</button>
        </div>
        <ul class="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          <li v-for="l in carrito" :key="l.varianteId" class="flex items-center gap-2 px-3 py-2">
            <div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">{{ l.codigo }} · {{ l.color }}</p><p class="text-xs text-slate-500">{{ formatearColones(l.precio) }} c/u</p></div>
            <div class="flex items-center gap-1">
              <button type="button" class="rounded border border-slate-300 p-1.5" aria-label="Menos" @click="cambiarCantidad(l, -1)"><Minus class="h-4 w-4" /></button>
              <span class="w-8 text-center text-base font-bold">{{ l.cantidad }}</span>
              <button type="button" class="rounded border border-slate-300 p-1.5" aria-label="Más" @click="cambiarCantidad(l, 1)"><Plus class="h-4 w-4" /></button>
            </div>
            <p class="w-24 text-right text-sm font-semibold">{{ formatearColones(l.precio * l.cantidad) }}</p>
            <button type="button" class="p-1 text-slate-400 hover:text-red-600" aria-label="Quitar" @click="quitar(l)"><Trash2 class="h-4 w-4" /></button>
          </li>
          <li v-if="!carrito.length" class="px-3 py-8 text-center text-sm text-slate-500">Escanee un producto para empezar.</li>
        </ul>
        <div class="border-t border-slate-200 p-3">
          <p class="flex items-baseline justify-between text-2xl font-extrabold"><span>Total</span><span>{{ formatearColones(total) }}</span></p>
          <button type="button" class="btn-primary mt-2 w-full !min-h-14 text-lg" :disabled="!carrito.length" @click="abrirCobro">{{ pos.caja ? 'Cobrar (F12)' : 'Abrir caja para cobrar' }}</button>
        </div>
      </aside>
    </main>

    <!-- Cobro -->
    <div v-if="cobrando" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3">
      <div class="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <div class="mb-2 flex items-start justify-between"><p class="text-lg font-bold">Cobrar</p><button type="button" aria-label="Cerrar" @click="cobrando = false"><X class="h-5 w-5" /></button></div>
        <p class="text-3xl font-extrabold">{{ formatearColones(total) }}</p>
        <div v-for="(p, i) in pagos" :key="i" class="mt-3 rounded-xl border border-slate-300 p-3">
          <div class="flex items-center gap-2">
            <select v-model="p.medio" class="input !w-auto"><option v-for="m in MEDIOS" :key="m[0]" :value="m[0]">{{ m[1] }}</option></select>
            <input v-model="p.monto" type="number" min="0" step="0.01" class="input" aria-label="Monto" />
            <button v-if="pagos.length > 1" type="button" class="p-1 text-slate-400 hover:text-red-600" aria-label="Quitar pago" @click="quitarPago(i)"><Trash2 class="h-4 w-4" /></button>
          </div>
          <template v-if="p.medio === 'efectivo'">
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button type="button" class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold" @click="billete(p, p.monto)">Exacto</button>
              <button v-for="b in RAPIDOS" :key="b" type="button" class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold" @click="billete(p, b)">{{ formatearColones(b).replace(',00', '') }}</button>
            </div>
            <input v-model="p.recibido" type="number" min="0" step="1" placeholder="Efectivo recibido" class="input mt-2" aria-label="Efectivo recibido" />
            <p v-if="p.recibido !== '' && Number(p.recibido) >= Number(p.monto)" class="mt-1 text-lg font-bold text-green-700">Vuelto: {{ formatearColones(Number(p.recibido) - Number(p.monto)) }}</p>
          </template>
          <input v-else v-model="p.referencia" type="text" maxlength="60" :placeholder="p.medio === 'tarjeta' ? 'Voucher o últimos 4 dígitos (opcional)' : 'Número de comprobante (opcional)'" class="input mt-2" />
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5"><span class="text-xs text-slate-500">Dividir el pago:</span><button v-for="m in MEDIOS" :key="m[0]" type="button" class="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" @click="agregarPago(m[0])">+ {{ m[1] }}</button></div>
        <p class="mt-2 text-sm" :class="Math.abs(faltante) < 0.005 ? 'text-green-700' : 'text-amber-700'">{{ Math.abs(faltante) < 0.005 ? 'El pago cubre el total.' : faltante > 0 ? `Faltan ${formatearColones(faltante)}` : `Se pasa por ${formatearColones(-faltante)}` }}</p>
        <label class="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" :checked="pos.imprimirAuto" @change="guardarImprimirAuto($event.target.checked)" /> Imprimir el tiquete al cobrar</label>
        <p v-if="errorCobro" class="mt-2 text-sm font-medium text-red-600">{{ errorCobro }}</p>
        <button type="button" class="btn-primary mt-3 w-full !min-h-14 text-lg" :disabled="guardando" @click="confirmarCobro">{{ guardando ? 'Guardando…' : 'Confirmar cobro (F12)' }}</button>
      </div>
    </div>

    <!-- Paneles -->
    <div v-if="panel" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3" @click.self="panel = ''">
      <div class="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5">
        <div class="mb-3 flex items-start justify-between">
          <p class="text-lg font-bold">{{ { caja: cierreHecho ? 'Caja cerrada' : pos.caja ? 'Cerrar caja' : 'Abrir caja', turno: 'Ventas del turno', alertas: 'Inventario bajo en la tienda', rechazadas: 'Ventas que el servidor rechazó' }[panel] }}</p>
          <button type="button" aria-label="Cerrar" @click="panel = ''; cierreHecho = null"><X class="h-5 w-5" /></button>
        </div>

        <template v-if="panel === 'caja'">
          <template v-if="!pos.caja && !cierreHecho">
            <p class="mb-2 text-sm text-slate-600">Cuente el efectivo con que empieza la gaveta (fondo de caja).</p>
            <input v-model="fondo" type="number" min="0" step="1" placeholder="Fondo inicial ₡" class="input" />
            <p v-if="errorCaja" class="mt-2 text-sm font-medium text-red-600">{{ errorCaja }}</p>
            <button type="button" class="btn-primary mt-3 w-full" @click="hacerAbrirCaja">Abrir caja</button>
          </template>
          <template v-else-if="pos.caja">
            <div class="mb-3 rounded-xl bg-slate-100 p-3 text-sm">
              <p>Abierta desde {{ formatearFechaHora(pos.caja.abiertaEn) }} · fondo {{ formatearColones(pos.caja.fondoInicial) }}</p>
              <p>{{ turno.ventas }} venta(s) · {{ formatearColones(turno.total) }}</p>
              <p v-for="(m, k) in turno.porMedio" :key="k">{{ ETIQUETA[k] ?? k }}: {{ formatearColones(m) }}</p>
              <p class="mt-1 font-semibold">Efectivo que debería haber en la gaveta: {{ formatearColones(efectivoEsperado()) }}</p>
            </div>
            <input v-model="contado" type="number" min="0" step="1" placeholder="Efectivo contado ₡" class="input" />
            <input v-model="notasCaja" type="text" maxlength="300" placeholder="Notas (opcional)" class="input mt-2" />
            <p v-if="errorCaja" class="mt-2 text-sm font-medium text-red-600">{{ errorCaja }}</p>
            <button type="button" class="btn-danger mt-3 w-full" @click="hacerCerrarCaja">Cerrar caja</button>
          </template>
          <template v-else-if="cierreHecho">
            <p class="text-base font-bold" :class="cierreHecho.diferencia === 0 ? 'text-green-700' : 'text-amber-700'">{{ cierreHecho.diferencia === 0 ? 'Caja cerrada: cuadra exacto.' : cierreHecho.diferencia < 0 ? `Caja cerrada con faltante de ${formatearColones(-cierreHecho.diferencia)}.` : `Caja cerrada con sobrante de ${formatearColones(cierreHecho.diferencia)}.` }}</p>
            <p class="text-sm text-slate-600">Esperado {{ formatearColones(cierreHecho.efectivoEsperado) }} · contado {{ formatearColones(cierreHecho.efectivoContado) }}</p>
            <button type="button" class="btn-secondary mt-3 w-full" @click="panel = ''; cierreHecho = null">Listo</button>
          </template>
        </template>

        <template v-else-if="panel === 'turno'">
          <p v-if="!pos.caja" class="text-sm text-slate-500">No hay un turno abierto.</p>
          <ul v-else class="divide-y divide-slate-100">
            <li v-for="v in ventasTurno" :key="v.id" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span><span class="font-semibold">{{ numeroTexto(v) }}</span> · {{ new Date(v.fecha).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false }) }}<span v-if="!v.enviada" class="ml-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">{{ v.rechazada ? 'rechazada' : 'sin enviar' }}</span></span>
              <span class="flex items-center gap-2"><b>{{ formatearColones(v.total) }}</b><button type="button" class="rounded border border-slate-300 p-1.5" aria-label="Reimprimir" @click="imprimir(v)"><Printer class="h-4 w-4" /></button></span>
            </li>
            <li v-if="!ventasTurno.length" class="py-3 text-sm text-slate-500">Todavía no hay ventas en este turno.</li>
          </ul>
        </template>

        <template v-else-if="panel === 'alertas'">
          <p class="mb-2 text-xs text-slate-500">Productos que llegaron a su mínimo. Avise a la bodega para pedir un traspaso.</p>
          <ul class="divide-y divide-slate-100">
            <li v-for="a in alertasLocales" :key="a.varianteId" class="flex items-center justify-between py-2 text-sm"><span>{{ a.codigo }} · {{ a.color }}</span><span class="font-semibold" :class="a.stock <= 0 ? 'text-red-600' : 'text-amber-600'">{{ a.stock <= 0 ? 'Agotado' : `${a.stock} (mín. ${a.minimo})` }}</span></li>
            <li v-if="!alertasLocales.length" class="py-3 text-sm text-slate-500">Todo en orden: ningún producto está en su mínimo.</li>
          </ul>
          <button type="button" class="btn-secondary mt-3 w-full" @click="descargarCatalogo">Actualizar existencias</button>
          <button v-if="!auth.esEncargadoTienda" type="button" class="mt-2 w-full text-xs text-slate-500 underline" @click="cambiar">Cambiar la tienda de esta terminal</button>
        </template>

        <template v-else-if="panel === 'rechazadas'">
          <p class="mb-2 text-sm text-slate-600">El servidor no aceptó estas ventas (por ejemplo, un producto que ya no existe). Avise al administrador; las ventas siguen guardadas aquí.</p>
          <ul class="divide-y divide-slate-100">
            <li v-for="v in rechazadas" :key="v.id" class="py-2 text-sm"><span class="font-semibold">{{ numeroTexto(v) }}</span> · {{ formatearColones(v.total) }}<p class="text-xs text-red-600">{{ v.error }}</p></li>
          </ul>
          <button type="button" class="btn-primary mt-3 w-full" @click="reintentarRechazadas">Reintentar envío</button>
        </template>
      </div>
    </div>

    <PedidoReposicion v-if="pidiendo" @cerrar="pidiendo = false" />

    <!-- Tiquete para imprimir: vive fuera de la pantalla y solo se ve al imprimir -->
    <Teleport to="body">
      <div id="ticket-print"><TiquetePos v-if="ventaImpresion" :venta="ventaImpresion" /></div>
    </Teleport>
  </div>
</template>
