<script setup>
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Printer, ClipboardList, TriangleAlert, Search, Receipt, Pencil, Plus, Trash2, History } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFecha, formatearFechaHora } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';
import { TIPOS_IDENTIFICACION } from '../../lib/clientes.js';
import VerFotosProducto from '../../components/VerFotosProducto.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const auth = useAuthStore();
const pedido = ref(null);
const cargando = ref(true);
const error = ref('');

// Editar/anular pedidos ya guardados es lo mismo permiso — quien puede
// gestionar pedidos puede corregirlos (ej. faltante detectado en bodega).
const puedeGestionar = auth.tienePermiso('pedidos.gestionar');

async function cargarPedido() {
  pedido.value = await api.get(`/pedidos/${props.id}`);
  if (pedido.value.clientePendiente && !pedido.value.clienteId) {
    Object.assign(registro, {
      nombre: pedido.value.clientePendiente.nombre ?? '',
      cedula: pedido.value.clientePendiente.cedula ?? '',
      telefono: pedido.value.clientePendiente.telefono ?? '',
      direccion: pedido.value.clientePendiente.direccion ?? '',
    });
  }
}

async function cargarEdiciones() {
  if (!puedeGestionar) return;
  try {
    ediciones.value = await api.get(`/pedidos/${props.id}/ediciones`);
  } catch {
    // El historial es informativo — si falla, no bloquea el resto de la página.
  }
}

onMounted(async () => {
  try {
    await cargarPedido();
    await cargarEdiciones();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el pedido.';
  } finally {
    cargando.value = false;
  }
});

// --- Registro del cliente pendiente (solo administración) ---------------
// Nombre/cédula/teléfono ya vienen del vendedor (mínimo para contactarlo).
// Acá se completan tipo de identificación y correo — los datos que Hacienda
// va a pedir el día que este cliente reciba una Factura Electrónica.
const mostrarRegistro = computed(() => auth.tienePermiso('clientes.gestionar') && pedido.value && !pedido.value.clienteId);
const modoBusquedaExistente = ref(false);
const registro = reactive({ nombre: '', tipoIdentificacion: '', cedula: '', telefono: '', email: '', direccion: '' });
const registrando = ref(false);
const errorRegistro = ref('');

const registroValido = computed(
  () =>
    registro.nombre.trim() &&
    registro.tipoIdentificacion &&
    registro.cedula.trim() &&
    registro.telefono.trim() &&
    registro.email.trim(),
);

async function registrarClienteNuevo() {
  if (!registroValido.value) return;
  errorRegistro.value = '';
  registrando.value = true;
  try {
    await api.post(`/pedidos/${props.id}/cliente`, {
      nombre: registro.nombre.trim(),
      tipoIdentificacion: registro.tipoIdentificacion,
      cedula: registro.cedula.trim(),
      telefono: registro.telefono.trim(),
      email: registro.email.trim(),
      direccion: registro.direccion.trim() || undefined,
    });
    await cargarPedido();
  } catch (err) {
    errorRegistro.value = err instanceof ApiError ? err.message : 'No se pudo registrar el cliente.';
  } finally {
    registrando.value = false;
  }
}

// Para el caso en que el cliente pendiente resulta ser uno que ya existe
// en la base (el vendedor no lo encontró, o lo escribió distinto).
const busquedaExistente = ref('');
const clientesEncontrados = ref([]);
const buscandoExistentes = ref(false);
let temporizadorBusqueda = null;

function alEscribirBusquedaExistente() {
  clearTimeout(temporizadorBusqueda);
  if (busquedaExistente.value.trim().length < 2) {
    clientesEncontrados.value = [];
    return;
  }
  temporizadorBusqueda = setTimeout(async () => {
    buscandoExistentes.value = true;
    errorRegistro.value = '';
    try {
      clientesEncontrados.value = await api.get(`/clientes?buscar=${encodeURIComponent(busquedaExistente.value.trim())}`);
    } catch (err) {
      errorRegistro.value = err instanceof ApiError ? err.message : 'No se pudo buscar el cliente.';
    } finally {
      buscandoExistentes.value = false;
    }
  }, 300);
}

async function vincularClienteExistente(cliente) {
  errorRegistro.value = '';
  registrando.value = true;
  try {
    await api.patch(`/pedidos/${props.id}/cliente`, { clienteId: cliente.id });
    await cargarPedido();
  } catch (err) {
    errorRegistro.value = err instanceof ApiError ? err.message : 'No se pudo vincular el cliente.';
  } finally {
    registrando.value = false;
  }
}

function etiquetaTipoIdentificacion(codigo) {
  return TIPOS_IDENTIFICACION.find((t) => t.valor === codigo)?.etiqueta ?? codigo;
}

// --- Facturar (solo administración) -------------------------------------
// Arma el comprobante (consecutivo + clave numérica oficiales de
// Hacienda) a partir de los datos ya confirmados del pedido y el
// cliente. El envío real a Hacienda queda pendiente hasta que se
// conecte la llave criptográfica — ver HaciendaClient en el backend.
const mostrarFacturar = computed(
  () =>
    (auth.tienePermiso('facturacion.gestionar')) &&
    pedido.value &&
    pedido.value.cliente &&
    pedido.value.estado === 'activo' &&
    !pedido.value.factura,
);
const facturando = ref(false);
const errorFacturar = ref('');

async function facturar() {
  errorFacturar.value = '';
  facturando.value = true;
  try {
    await api.post(`/pedidos/${props.id}/facturar`);
    await cargarPedido();
  } catch (err) {
    errorFacturar.value = err instanceof ApiError ? err.message : 'No se pudo facturar el pedido.';
  } finally {
    facturando.value = false;
  }
}

const ETIQUETAS_ESTADO_FACTURA = {
  pendiente_envio: 'Pendiente de envío a Hacienda',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

function etiquetaEstadoFactura(estado) {
  return ETIQUETAS_ESTADO_FACTURA[estado] ?? estado;
}

function claseEstadoFactura(estado) {
  if (estado === 'aceptada') return 'bg-green-100 text-green-700';
  if (estado === 'rechazada') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

// --- Editar líneas (solo quien puede gestionar pedidos) -----------------
// Caso típico: bodega alistó y encontró menos stock del que el pedido
// pide. Se corrige acá, con motivo y usuario quedando en la bitácora
// (ver PedidoEdicion en el backend) — nunca se pierde el rastro de qué
// cambió ni quién lo cambió.
const puedeEditar = computed(
  () => puedeGestionar && pedido.value && pedido.value.estado === 'activo' && !pedido.value.factura,
);
const mostrarEdicion = ref(false);
const lineasEdicion = ref([]);
const motivoEdicion = ref('');
const metodoEntregaEdicion = ref('');
const empresaEncomiendaEdicion = ref('');
const guardandoEdicion = ref(false);
const errorEdicion = ref('');
const ediciones = ref([]);

function abrirEdicion() {
  lineasEdicion.value = pedido.value.lineas.map((l) => ({
    varianteId: l.varianteId,
    codigoProducto: l.codigoProducto,
    color: l.color,
    docenas: Number(l.docenas),
    precioPorPar: l.precioPorPar,
    descuentoPorcentaje: Number(l.descuentoPorcentaje) || 0,
  }));
  motivoEdicion.value = '';
  metodoEntregaEdicion.value = pedido.value.metodoEntrega ?? '';
  empresaEncomiendaEdicion.value = pedido.value.empresaEncomienda ?? '';
  errorEdicion.value = '';
  productoTextoEdicion.value = '';
  productosEncontradosEdicion.value = [];
  mostrarEdicion.value = true;
}

function quitarLineaEdicion(index) {
  lineasEdicion.value.splice(index, 1);
}

const productoTextoEdicion = ref('');
const productosEncontradosEdicion = ref([]);
const buscandoProductosEdicion = ref(false);
let temporizadorProductoEdicion = null;

function alEscribirProductoEdicion() {
  clearTimeout(temporizadorProductoEdicion);
  if (productoTextoEdicion.value.trim().length < 1) {
    productosEncontradosEdicion.value = [];
    return;
  }
  temporizadorProductoEdicion = setTimeout(async () => {
    buscandoProductosEdicion.value = true;
    errorEdicion.value = '';
    try {
      productosEncontradosEdicion.value = await api.get(
        `/catalogo/productos?buscar=${encodeURIComponent(productoTextoEdicion.value.trim())}`,
      );
    } catch (err) {
      errorEdicion.value = err instanceof ApiError ? err.message : 'No se pudo buscar el producto.';
    } finally {
      buscandoProductosEdicion.value = false;
    }
  }, 300);
}

function agregarLineaEdicion(producto, variante) {
  if (lineasEdicion.value.some((l) => l.varianteId === variante.id)) {
    errorEdicion.value = 'Ese color ya está en el pedido — ajuste la cantidad en la línea existente.';
    return;
  }
  errorEdicion.value = '';
  lineasEdicion.value.push({
    varianteId: variante.id,
    codigoProducto: producto.codigo,
    color: variante.color,
    docenas: 1,
    precioPorPar: variante.precioPorPar,
    descuentoPorcentaje: Number(pedido.value.cliente?.descuentoPorcentaje ?? 0),
  });
  productoTextoEdicion.value = '';
  productosEncontradosEdicion.value = [];
}

async function guardarEdicion() {
  if (lineasEdicion.value.length === 0) {
    errorEdicion.value = 'El pedido necesita al menos un producto.';
    return;
  }
  if (metodoEntregaEdicion.value === 'encomienda' && !empresaEncomiendaEdicion.value.trim()) {
    errorEdicion.value = 'Indique el nombre de la empresa de encomienda.';
    return;
  }
  errorEdicion.value = '';
  guardandoEdicion.value = true;
  try {
    await api.patch(`/pedidos/${props.id}/lineas`, {
      lineas: lineasEdicion.value.map((l) => ({
        varianteId: l.varianteId,
        docenas: Number(l.docenas),
        descuentoPorcentaje: Number(l.descuentoPorcentaje) || 0,
        precioPorPar: Number(l.precioPorPar),
      })),
      motivo: motivoEdicion.value.trim() || undefined,
      metodoEntrega: metodoEntregaEdicion.value || undefined,
      empresaEncomienda: metodoEntregaEdicion.value === 'encomienda' ? empresaEncomiendaEdicion.value.trim() : undefined,
    });
    mostrarEdicion.value = false;
    await cargarPedido();
    await cargarEdiciones();
  } catch (err) {
    errorEdicion.value = err instanceof ApiError ? err.message : 'No se pudo guardar la edición.';
  } finally {
    guardandoEdicion.value = false;
  }
}

const ETIQUETAS_METODO_ENTREGA = { encomienda: 'Encomienda', entrega_propia: 'Entrega propia' };
function etiquetaMetodoEntrega(metodo) {
  return ETIQUETAS_METODO_ENTREGA[metodo] ?? '—';
}

// `window` no está en la lista de globals que el compilador de plantillas
// de Vue resuelve — usado directo en el template (@click="window.print()")
// se compila como _ctx.window.print() y explota en silencio. Envuelto acá
// en <script setup> sí es el `window` real del navegador.
function imprimir() {
  window.print();
}
</script>

<template>
  <div class="flex flex-col gap-6 pb-10">
    <div class="flex items-center justify-between print:hidden">
      <button type="button" class="flex items-center gap-1 text-lg font-medium text-slate-600" @click="router.back()">
        <ArrowLeft class="size-5" />
        Volver
      </button>
      <div v-if="pedido" class="flex gap-2">
        <button
          v-if="puedeEditar"
          type="button"
          class="btn-secondary min-h-11 px-4 text-base"
          @click="mostrarEdicion ? (mostrarEdicion = false) : abrirEdicion()"
        >
          <Pencil class="size-5" />
          Editar
        </button>
        <button
          type="button"
          class="btn-secondary min-h-11 px-4 text-base"
          @click="router.push({ name: 'pedido-alistamiento', params: { id: pedido.id } })"
        >
          <ClipboardList class="size-5" />
          Hoja de bodega
        </button>
        <button type="button" class="btn-secondary min-h-11 px-4 text-base" @click="imprimir">
          <Printer class="size-5" />
          Imprimir
        </button>
      </div>
    </div>

    <Cargando v-if="cargando" texto="Cargando…" />
    <p v-if="error" class="text-lg font-medium text-red-600">{{ error }}</p>

    <div v-else-if="pedido" class="card">
      <div class="mb-4 flex items-start justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Orden #{{ pedido.numeroOrden }}</h1>
          <p class="text-lg text-slate-500">{{ formatearFecha(pedido.fecha) }}</p>
        </div>
        <span
          v-if="pedido.estado === 'anulado'"
          class="rounded-full bg-red-100 px-3 py-1 text-base font-semibold text-red-700"
        >
          Anulado
        </span>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p class="label">Cliente</p>
          <template v-if="pedido.cliente">
            <p class="text-lg font-semibold text-slate-900">{{ pedido.cliente.nombre }}</p>
            <p class="text-base text-slate-500">
              Cédula: {{ pedido.cliente.cedula }} ({{ etiquetaTipoIdentificacion(pedido.cliente.tipoIdentificacion) }})
            </p>
            <p class="text-base text-slate-500">Tel: {{ pedido.cliente.telefono }}</p>
            <p class="text-base text-slate-500">Correo: {{ pedido.cliente.email }}</p>
            <p v-if="pedido.cliente.direccion" class="text-base text-slate-500">{{ pedido.cliente.direccion }}</p>
          </template>
          <template v-else>
            <p class="flex items-center gap-1.5 text-lg font-semibold text-amber-700">
              <TriangleAlert class="size-4 shrink-0" />
              {{ pedido.clientePendiente?.nombre ?? 'Cliente pendiente' }}
            </p>
            <p v-if="pedido.clientePendiente?.cedula" class="text-base text-slate-500">
              Cédula: {{ pedido.clientePendiente.cedula }}
            </p>
            <p v-if="pedido.clientePendiente?.telefono" class="text-base text-slate-500">
              Tel: {{ pedido.clientePendiente.telefono }}
            </p>
            <p v-if="pedido.clientePendiente?.direccion" class="text-base text-slate-500">
              {{ pedido.clientePendiente.direccion }}
            </p>
            <p class="text-sm text-amber-700">Todavía no existe en el sistema.</p>
          </template>
        </div>
        <div>
          <p class="label">Vendedor</p>
          <p class="text-lg font-semibold text-slate-900">{{ pedido.vendedor?.nombre ?? '—' }}</p>
        </div>
        <div>
          <p class="label">Forma de pago</p>
          <p class="text-lg font-semibold text-slate-900">
            {{ pedido.tipoPago === 'credito' ? `Crédito a ${pedido.diasCredito} días` : 'Contado' }}
          </p>
        </div>
        <div>
          <p class="label">Vía de entrega</p>
          <p class="text-lg font-semibold text-slate-900">
            {{ etiquetaMetodoEntrega(pedido.metodoEntrega) }}
            <span v-if="pedido.empresaEncomienda" class="font-normal text-slate-500">({{ pedido.empresaEncomienda }})</span>
          </p>
        </div>
      </div>

      <!-- Registro del cliente pendiente: solo administración lo ve -->
      <div v-if="mostrarRegistro" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 print:hidden">
        <p class="mb-3 text-base font-semibold text-amber-900">Registrar este cliente en el sistema</p>

        <div class="mb-3 flex gap-4 text-sm">
          <button
            type="button"
            class="font-semibold underline"
            :class="!modoBusquedaExistente ? 'text-amber-900' : 'text-amber-700'"
            @click="modoBusquedaExistente = false"
          >
            Cliente nuevo
          </button>
          <button
            type="button"
            class="font-semibold underline"
            :class="modoBusquedaExistente ? 'text-amber-900' : 'text-amber-700'"
            @click="modoBusquedaExistente = true"
          >
            Ya existe, buscarlo
          </button>
        </div>

        <template v-if="!modoBusquedaExistente">
          <p class="mb-3 text-sm text-amber-700">
            Nombre, cédula y teléfono ya los capturó el vendedor. Complete el resto — son los datos que se piden
            para factura electrónica.
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Nombre *</label>
              <input v-model="registro.nombre" type="text" class="input" />
            </div>
            <div>
              <label class="label">Tipo de identificación *</label>
              <select v-model="registro.tipoIdentificacion" class="input">
                <option value="" disabled>Elegir…</option>
                <option v-for="tipo in TIPOS_IDENTIFICACION" :key="tipo.valor" :value="tipo.valor">
                  {{ tipo.etiqueta }}
                </option>
              </select>
            </div>
            <div>
              <label class="label">Cédula *</label>
              <input v-model="registro.cedula" type="text" class="input" />
            </div>
            <div>
              <label class="label">Teléfono *</label>
              <input v-model="registro.telefono" type="tel" class="input" />
            </div>
            <div>
              <label class="label">Correo *</label>
              <input v-model="registro.email" type="email" class="input" />
            </div>
            <div>
              <label class="label">Dirección</label>
              <input v-model="registro.direccion" type="text" class="input" />
            </div>
          </div>
          <p v-if="errorRegistro" class="mt-2 text-sm font-medium text-red-600">{{ errorRegistro }}</p>
          <button type="button" class="btn-primary mt-3" :disabled="!registroValido || registrando" @click="registrarClienteNuevo">
            {{ registrando ? 'Registrando…' : 'Registrar y vincular al pedido' }}
          </button>
        </template>

        <template v-else>
          <div class="relative mb-2">
            <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            <input
              v-model="busquedaExistente"
              type="text"
              placeholder="Nombre, cédula o teléfono"
              class="input pl-12"
              @input="alEscribirBusquedaExistente"
            />
          </div>
          <p v-if="buscandoExistentes" class="text-sm text-slate-500">Buscando…</p>
          <p v-if="errorRegistro" class="text-sm font-medium text-red-600">{{ errorRegistro }}</p>
          <ul v-if="clientesEncontrados.length > 0" class="flex flex-col gap-2">
            <li v-for="cliente in clientesEncontrados" :key="cliente.id">
              <button
                type="button"
                class="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                :disabled="registrando"
                @click="vincularClienteExistente(cliente)"
              >
                <p class="text-base font-medium text-slate-900">{{ cliente.nombre }}</p>
                <p v-if="cliente.telefono" class="text-sm text-slate-500">{{ cliente.telefono }}</p>
              </button>
            </li>
          </ul>
        </template>
      </div>

      <!-- Editar líneas: corrige cantidades o quita/agrega productos, con motivo y bitácora -->
      <div v-if="mostrarEdicion" class="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 print:hidden">
        <p class="mb-3 text-base font-semibold text-blue-900">Editar pedido</p>

        <ul class="mb-3 flex flex-col gap-2">
          <li
            v-for="(linea, index) in lineasEdicion"
            :key="linea.varianteId"
            class="flex items-center gap-3 rounded-xl bg-white p-3"
          >
            <div class="flex-1">
              <p class="text-base font-medium text-slate-900">{{ linea.codigoProducto }} · {{ linea.color }}</p>
              <div class="mt-1 flex items-center gap-1">
                <span class="text-sm text-slate-500">₡</span>
                <input
                  v-model.number="linea.precioPorPar"
                  type="number"
                  min="0.01"
                  step="0.01"
                  class="input h-8 w-24 py-1 text-sm"
                />
                <span class="text-sm text-slate-500">/ par</span>
              </div>
            </div>
            <div class="flex flex-col items-center">
              <input v-model.number="linea.docenas" type="number" min="0.5" step="0.5" class="input w-20 text-center" />
              <span class="text-xs text-slate-500">docenas</span>
            </div>
            <div class="flex flex-col items-center">
              <input v-model.number="linea.descuentoPorcentaje" type="number" min="0" max="100" step="1" class="input w-20 text-center" />
              <span class="text-xs text-slate-500">% desc.</span>
            </div>
            <button type="button" class="text-red-600" @click="quitarLineaEdicion(index)">
              <Trash2 class="size-5" />
            </button>
          </li>
        </ul>

        <div class="relative mb-2">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
          <input
            v-model="productoTextoEdicion"
            type="text"
            placeholder="Código o nombre del producto"
            class="input pl-12"
            @input="alEscribirProductoEdicion"
          />
        </div>
        <p v-if="buscandoProductosEdicion" class="mb-2 text-sm text-slate-500">Buscando…</p>
        <div v-if="productosEncontradosEdicion.length > 0" class="mb-3 flex flex-col gap-2">
          <div v-for="producto in productosEncontradosEdicion" :key="producto.id" class="rounded-xl border border-slate-200 bg-white p-3">
            <div class="mb-2 flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}</p>
              <VerFotosProducto :producto="producto" />
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="variante in producto.variantes"
                :key="variante.id"
                type="button"
                class="rounded-full border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
                @click="agregarLineaEdicion(producto, variante)"
              >
                {{ variante.color }} · {{ formatearColones(variante.precioPorPar) }}
              </button>
            </div>
          </div>
        </div>

        <label class="label">Vía de entrega</label>
        <div class="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn min-h-12 text-sm"
            :class="metodoEntregaEdicion === 'encomienda' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
            @click="metodoEntregaEdicion = 'encomienda'"
          >
            Encomienda
          </button>
          <button
            type="button"
            class="btn min-h-12 text-sm"
            :class="metodoEntregaEdicion === 'entrega_propia' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
            @click="metodoEntregaEdicion = 'entrega_propia'"
          >
            Entrega propia
          </button>
        </div>
        <input
          v-if="metodoEntregaEdicion === 'encomienda'"
          v-model="empresaEncomiendaEdicion"
          type="text"
          placeholder="Empresa de encomienda"
          class="input mb-3 bg-white"
        />

        <label class="label">Motivo (opcional)</label>
        <input v-model="motivoEdicion" type="text" placeholder="Ej. Faltante en bodega" class="input mb-3" />

        <p v-if="errorEdicion" class="mb-2 text-sm font-medium text-red-600">{{ errorEdicion }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary flex-1" @click="mostrarEdicion = false">Cancelar</button>
          <button type="button" class="btn-primary flex-1" :disabled="guardandoEdicion" @click="guardarEdicion">
            {{ guardandoEdicion ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      </div>

      <div class="mb-4 -mx-4 overflow-x-auto px-4">
        <table class="w-full min-w-[520px] text-left text-base">
          <thead>
            <tr class="border-b border-slate-200 text-slate-500">
              <th class="py-2">Código</th>
              <th class="py-2">Color</th>
              <th class="py-2 text-right">Docenas</th>
              <th class="py-2 text-right">Pares</th>
              <th class="py-2 text-right">₡/par</th>
              <th class="py-2 text-right">Desc.</th>
              <th class="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linea in pedido.lineas" :key="linea.id" class="border-b border-slate-100">
              <td class="py-2 font-medium">{{ linea.codigoProducto }}</td>
              <td class="py-2">{{ linea.color }}</td>
              <td class="py-2 text-right">{{ linea.docenas }}</td>
              <td class="py-2 text-right">{{ linea.pares }}</td>
              <td class="py-2 text-right">{{ formatearColones(linea.precioPorPar) }}</td>
              <td class="py-2 text-right">{{ Number(linea.descuentoPorcentaje) > 0 ? `${Number(linea.descuentoPorcentaje)}%` : '—' }}</td>
              <td class="py-2 text-right font-medium">{{ formatearColones(linea.montoLinea) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ml-auto flex max-w-xs flex-col gap-2 text-lg">
        <div class="flex justify-between">
          <span class="text-slate-600">Subtotal</span>
          <span class="font-medium">{{ formatearColones(pedido.subtotal) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">IVA ({{ pedido.ivaPorcentaje }}%)</span>
          <span class="font-medium">{{ formatearColones(pedido.ivaMonto) }}</span>
        </div>
        <div class="flex justify-between border-t border-slate-200 pt-2 text-xl">
          <span class="font-bold">Total</span>
          <span class="font-bold text-teal-700">{{ formatearColones(pedido.total) }}</span>
        </div>
      </div>

      <!-- Factura: ya emitida, o botón para generarla (solo administración) -->
      <div v-if="pedido.factura" class="mt-6 border-t border-slate-200 pt-4">
        <p class="label">Factura</p>
        <p class="text-base font-semibold text-slate-900">Consecutivo: {{ pedido.factura.consecutivo }}</p>
        <p class="break-all text-sm text-slate-500">Clave numérica: {{ pedido.factura.claveNumerica }}</p>
        <span
          class="mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
          :class="claseEstadoFactura(pedido.factura.estado)"
        >
          {{ etiquetaEstadoFactura(pedido.factura.estado) }}
        </span>
        <p v-if="pedido.factura.mensajeHacienda" class="mt-2 text-sm text-slate-500 print:hidden">
          {{ pedido.factura.mensajeHacienda }}
        </p>
      </div>

      <div v-else-if="mostrarFacturar" class="mt-6 border-t border-slate-200 pt-4 print:hidden">
        <p class="mb-2 text-sm text-slate-600">
          El pedido tiene cliente registrado y está listo para facturar. Esto arma el consecutivo y la clave
          numérica oficiales — el envío a Hacienda queda pendiente hasta que se conecte la llave criptográfica.
        </p>
        <p v-if="errorFacturar" class="mb-2 text-sm font-medium text-red-600">{{ errorFacturar }}</p>
        <button type="button" class="btn-primary" :disabled="facturando" @click="facturar">
          <Receipt class="size-5" />
          {{ facturando ? 'Facturando…' : 'Facturar' }}
        </button>
      </div>

      <!-- Bitácora de ediciones: quién cambió qué y cuándo -->
      <div v-if="ediciones.length > 0" class="mt-6 border-t border-slate-200 pt-4 print:hidden">
        <p class="mb-3 flex items-center gap-1.5 text-base font-semibold text-slate-900">
          <History class="size-5" />
          Historial de cambios
        </p>
        <ul class="flex flex-col gap-3">
          <li v-for="edicion in ediciones" :key="edicion.id" class="rounded-xl bg-slate-50 p-3">
            <p class="text-sm font-medium text-slate-900">
              {{ edicion.usuario?.nombre ?? 'Usuario eliminado' }} · {{ formatearFechaHora(edicion.creadoEn) }}
            </p>
            <p v-if="edicion.motivo" class="mt-1 text-sm text-slate-600">Motivo: {{ edicion.motivo }}</p>
            <ul class="mt-1 list-inside list-disc text-sm text-slate-500">
              <li v-for="(cambio, i) in edicion.cambios" :key="i">{{ cambio }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
