<script setup>
import { usarBorrador } from '../../lib/borrador.js';
import BorradorAviso from '../../components/BorradorAviso.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Search, Plus, Trash2, UserPlus, Check, TriangleAlert } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, fechaHoyISO } from '../../lib/format.js';
import { redondear } from '../../lib/dinero.js';
import VerFotosProducto from '../../components/VerFotosProducto.vue';

// Debe coincidir con IVA_PORCENTAJE del backend (common/constants/negocio.constant.ts)
// — se recalcula igual acá solo para que el vendedor vea el total antes de
// guardar; el monto real y definitivo siempre lo calcula el servidor.
const IVA_PORCENTAJE = 13;
const UNIDADES_POR_DOCENA = 12;

const router = useRouter();

// Tope general de descuento configurado por administración (ver
// Configuración) — el vendedor puede llegar hasta acá aunque el cliente
// no tenga un descuento propio asignado. Esto es solo para que la
// pantalla avise ANTES de mandar el pedido; la validación real y
// definitiva (incluyendo que no se venda bajo el costo de producción) la
// hace siempre el backend.
const descuentoMaximoGeneral = ref(0);
onMounted(async () => {
  try {
    const config = await api.get('/configuracion/descuentos');
    descuentoMaximoGeneral.value = Number(config.descuentoMaximoVendedorPorcentaje);
  } catch {
    // Si falla, el vendedor simplemente no ve el aviso local — el backend
    // igual valida al guardar.
  }
});

// --- Paso 1: cliente ---------------------------------------------------
const clienteTexto = ref('');
const clientesEncontrados = ref([]);
const clienteSeleccionado = ref(null);
const buscandoClientes = ref(false);
const mostrarFormClienteNuevo = ref(false);
const clienteNuevo = reactive({ nombre: '', cedula: '', telefono: '', direccion: '' });

// Cliente que el vendedor tecleó a mano porque no lo encontró en la
// base. A propósito NO se crea acá — el vendedor no da de alta clientes
// en el sistema, solo captura los datos. El pedido se guarda con estos
// datos "flotando" (clienteNuevo, sin clienteId) y queda marcado como
// pendiente hasta que administración lo revisa y lo registra de verdad.
const clienteNuevoPendiente = ref(null);

let temporizadorCliente = null;
function alEscribirCliente() {
  clienteSeleccionado.value = null;
  clearTimeout(temporizadorCliente);
  if (clienteTexto.value.trim().length < 2) {
    clientesEncontrados.value = [];
    return;
  }
  temporizadorCliente = setTimeout(async () => {
    buscandoClientes.value = true;
    error.value = '';
    try {
      clientesEncontrados.value = await api.get(`/clientes?buscar=${encodeURIComponent(clienteTexto.value.trim())}`);
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No se pudo buscar el cliente.';
    } finally {
      buscandoClientes.value = false;
    }
  }, 300);
}

function elegirCliente(cliente) {
  clienteSeleccionado.value = cliente;
  clienteNuevoPendiente.value = null;
  clienteTexto.value = cliente.nombre;
  clientesEncontrados.value = [];
}

// Mínimo para poder contactar al cliente — cédula y teléfono, además del
// nombre, son obligatorios acá. Los datos de facturación electrónica
// (tipo de identificación, correo) los completa administración cuando
// registra al cliente de verdad, no el vendedor en la calle.
const clienteNuevoValido = computed(
  () => clienteNuevo.nombre.trim() && clienteNuevo.cedula.trim() && clienteNuevo.telefono.trim(),
);

function confirmarClienteNuevo() {
  if (!clienteNuevoValido.value) return;
  clienteNuevoPendiente.value = {
    nombre: clienteNuevo.nombre.trim(),
    cedula: clienteNuevo.cedula.trim(),
    telefono: clienteNuevo.telefono.trim(),
    direccion: clienteNuevo.direccion.trim() || undefined,
  };
  clienteSeleccionado.value = null;
  mostrarFormClienteNuevo.value = false;
  clienteNuevo.nombre = '';
  clienteNuevo.cedula = '';
  clienteNuevo.telefono = '';
  clienteNuevo.direccion = '';
}

function cambiarCliente() {
  clienteSeleccionado.value = null;
  clienteNuevoPendiente.value = null;
  clienteTexto.value = '';
}

// Hasta cuánto se puede descontar en este pedido: lo que tenga asignado
// el cliente (si es mayor) o el tope general — lo que sea más alto. Un
// cliente pendiente (todavía no registrado) no tiene descuento propio,
// así que solo cuenta el tope general.
const topeDescuento = computed(() => Math.max(Number(clienteSeleccionado.value?.descuentoPorcentaje ?? 0), descuentoMaximoGeneral.value));

// --- Paso 2: datos del pedido -------------------------------------------
const fecha = ref(fechaHoyISO());
const tipoPago = ref('contado');
const diasCredito = ref(30);

// Todo pedido sale de la bodega de distribución central — el vendedor no
// elige ubicación (el backend la resuelve solo, ver PedidosService.crear).
// Lo que sí se anota es la vía de entrega: a veces se manda por una
// empresa de encomienda, otras veces la empresa misma la entrega.
const metodoEntrega = ref('');
const empresaEncomienda = ref('');

// --- Paso 3: productos ---------------------------------------------------
const productoTexto = ref('');
const productosEncontrados = ref([]);
const buscandoProductos = ref(false);
const varianteParaAgregar = ref(null); // { variante, producto }
const docenasParaAgregar = ref(1);

let temporizadorProducto = null;
function alEscribirProducto() {
  clearTimeout(temporizadorProducto);
  if (productoTexto.value.trim().length < 1) {
    productosEncontrados.value = [];
    return;
  }
  temporizadorProducto = setTimeout(async () => {
    buscandoProductos.value = true;
    error.value = '';
    try {
      productosEncontrados.value = await api.get(`/catalogo/productos?buscar=${encodeURIComponent(productoTexto.value.trim())}`);
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No se pudo buscar el producto.';
    } finally {
      buscandoProductos.value = false;
    }
  }, 300);
}

function elegirVariante(producto, variante) {
  varianteParaAgregar.value = { producto, variante };
  docenasParaAgregar.value = 1;
}

const lineas = ref([]);

function agregarLinea() {
  if (!varianteParaAgregar.value || !docenasParaAgregar.value || docenasParaAgregar.value <= 0) return;
  const { producto, variante } = varianteParaAgregar.value;
  const docenas = Number(docenasParaAgregar.value);
  const pares = Math.round(docenas * UNIDADES_POR_DOCENA);
  const precioPorPar = Number(variante.precioPorPar);
  // El descuento del cliente se sugiere solo — el vendedor puede subirlo
  // hasta topeDescuento o bajarlo, línea por línea.
  const descuentoPorcentaje = Number(clienteSeleccionado.value?.descuentoPorcentaje ?? 0);
  const montoLinea = redondear(pares * precioPorPar * (1 - descuentoPorcentaje / 100));

  lineas.value.push({
    varianteId: variante.id,
    codigoProducto: producto.codigo,
    nombreProducto: producto.nombre,
    color: variante.color,
    costo: variante.costo != null ? Number(variante.costo) : null,
    docenas,
    pares,
    precioPorPar,
    descuentoPorcentaje,
    montoLinea,
  });

  varianteParaAgregar.value = null;
  productoTexto.value = '';
  productosEncontrados.value = [];
}

function quitarLinea(index) {
  lineas.value.splice(index, 1);
}

// Recalcula pares y monto cuando se corrige la cantidad o el descuento de
// una línea ya agregada.
function recalcularLinea(linea) {
  const docenas = Number(linea.docenas);
  if (!Number.isFinite(docenas) || docenas <= 0) return;
  linea.pares = Math.round(docenas * UNIDADES_POR_DOCENA);
  const descuento = Number(linea.descuentoPorcentaje) || 0;
  linea.montoLinea = redondear(linea.pares * linea.precioPorPar * (1 - descuento / 100));
}

// Mensaje de aviso local por línea — el backend siempre revalida esto al
// guardar, esto es solo para que el vendedor lo vea antes de intentarlo.
function errorLinea(linea) {
  const descuento = Number(linea.descuentoPorcentaje) || 0;
  if (descuento > topeDescuento.value) {
    return `El descuento máximo permitido es ${topeDescuento.value}%.`;
  }
  if (linea.costo != null) {
    const precioConDescuento = redondear(linea.precioPorPar * (1 - descuento / 100));
    if (precioConDescuento < linea.costo) {
      return `Ese descuento deja el precio en ${formatearColones(precioConDescuento)}, por debajo del costo (${formatearColones(linea.costo)}).`;
    }
  }
  return '';
}

const lineasValidas = computed(() => lineas.value.every((l) => !errorLinea(l)));

// --- Totales ---------------------------------------------------------
const subtotal = computed(() => lineas.value.reduce((acc, l) => acc + l.montoLinea, 0));
const ivaMonto = computed(() => redondear(subtotal.value * (IVA_PORCENTAJE / 100)));
const total = computed(() => subtotal.value + ivaMonto.value);

// --- Guardar ---------------------------------------------------------
const error = ref('');
const guardando = ref(false);

const puedeGuardar = computed(
  () =>
    (clienteSeleccionado.value || clienteNuevoPendiente.value) &&
    Boolean(metodoEntrega.value) &&
    (metodoEntrega.value !== 'encomienda' || empresaEncomienda.value.trim()) &&
    lineas.value.length > 0 &&
    lineas.value.every((l) => Number(l.docenas) > 0) &&
    lineasValidas.value &&
    (tipoPago.value === 'contado' || (diasCredito.value && diasCredito.value >= 30)),
);

// Qué falta para poder guardar (se muestra sobre el botón, para que la persona nunca tenga que adivinar).
const faltante = computed(() => {
  const f = [];
  if (!(clienteSeleccionado.value || clienteNuevoPendiente.value)) f.push('el cliente');
  if (!metodoEntrega.value) f.push('la vía de entrega');
  else if (metodoEntrega.value === 'encomienda' && !empresaEncomienda.value.trim()) f.push('la empresa de encomienda');
  if (!lineas.value.length) f.push('al menos un producto');
  else if (!lineasValidas.value || lineas.value.some((l) => !(Number(l.docenas) > 0))) f.push('corregir las líneas con error');
  if (tipoPago.value === 'credito' && !(diasCredito.value && diasCredito.value >= 30)) f.push('los días de crédito (mínimo 30)');
  return f.length ? `Falta: ${f.join(', ')}.` : '';
});

async function guardarPedido() {
  if (!puedeGuardar.value) return;
  error.value = '';
  guardando.value = true;
  try {
    const pedido = await api.post('/pedidos', {
      clienteId: clienteSeleccionado.value?.id,
      clienteNuevo: clienteSeleccionado.value ? undefined : clienteNuevoPendiente.value,
      fecha: fecha.value,
      tipoPago: tipoPago.value,
      diasCredito: tipoPago.value === 'credito' ? Number(diasCredito.value) : undefined,
      metodoEntrega: metodoEntrega.value,
      empresaEncomienda: metodoEntrega.value === 'encomienda' ? empresaEncomienda.value.trim() : undefined,
      lineas: lineas.value.map((l) => ({
        varianteId: l.varianteId,
        docenas: l.docenas,
        descuentoPorcentaje: Number(l.descuentoPorcentaje) || 0,
      })),
    });
    borrador.limpiar();
    router.replace({ name: 'pedido-detalle', params: { id: pedido.id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar el pedido.';
  } finally {
    guardando.value = false;
  }
}

// Borrador automático: si la sesión se cierra o se pierde la señal, al volver se puede recuperar el pedido a medias.
const borrador = usarBorrador({
  clave: 'pedido-nuevo',
  obtener: () => JSON.parse(JSON.stringify({ cliente: clienteSeleccionado.value, clienteNuevo: clienteNuevoPendiente.value, fecha: fecha.value, tipoPago: tipoPago.value, diasCredito: diasCredito.value, metodoEntrega: metodoEntrega.value, empresaEncomienda: empresaEncomienda.value, lineas: lineas.value })),
  aplicar: (d) => {
    clienteSeleccionado.value = d.cliente ?? null;
    clienteNuevoPendiente.value = d.clienteNuevo ?? null;
    fecha.value = d.fecha ?? fecha.value;
    tipoPago.value = d.tipoPago ?? 'contado';
    diasCredito.value = d.diasCredito ?? 30;
    metodoEntrega.value = d.metodoEntrega ?? '';
    empresaEncomienda.value = d.empresaEncomienda ?? '';
    lineas.value = d.lineas ?? [];
  },
  tieneDatos: (d) => Boolean(d.cliente || d.clienteNuevo) || (d.lineas?.length ?? 0) > 0,
});
</script>

<template>
  <div class="flex flex-col gap-6 pb-10">
    <button type="button" class="flex items-center gap-1 text-lg font-medium text-slate-600" @click="router.back()">
      <ArrowLeft class="size-5" />
      Volver
    </button>

    <BorradorAviso :borrador="borrador" />

    <h1 class="text-2xl font-bold text-slate-900">Nuevo pedido</h1>

    <!-- 1. Cliente -->
    <section class="card">
      <h2 class="mb-3 text-xl font-bold text-slate-900">1. Cliente</h2>

      <div v-if="clienteSeleccionado" class="flex items-center justify-between rounded-xl bg-teal-50 p-4">
        <div>
          <p class="text-lg font-semibold text-teal-900">{{ clienteSeleccionado.nombre }}</p>
          <p v-if="clienteSeleccionado.telefono" class="text-base text-teal-700">{{ clienteSeleccionado.telefono }}</p>
        </div>
        <button type="button" class="text-base font-semibold text-teal-700 underline" @click="cambiarCliente">
          Cambiar
        </button>
      </div>

      <div v-else-if="clienteNuevoPendiente" class="rounded-xl bg-amber-50 p-4">
        <div class="mb-1 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <TriangleAlert class="size-5 text-amber-600" />
            <p class="text-lg font-semibold text-amber-900">{{ clienteNuevoPendiente.nombre }}</p>
          </div>
          <button type="button" class="text-base font-semibold text-amber-700 underline" @click="cambiarCliente">
            Cambiar
          </button>
        </div>
        <p v-if="clienteNuevoPendiente.telefono" class="text-base text-amber-700">{{ clienteNuevoPendiente.telefono }}</p>
        <p class="mt-1 text-sm text-amber-700">
          Cliente nuevo, todavía no existe en el sistema. Administración lo va a registrar.
        </p>
      </div>

      <template v-else>
        <div class="relative mb-2">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
          <input
            v-model="clienteTexto"
            type="text"
            placeholder="Nombre, cédula o teléfono"
            class="input pl-12"
            @input="alEscribirCliente"
          />
        </div>

        <p v-if="buscandoClientes" class="text-base text-slate-500">Buscando…</p>

        <ul v-if="clientesEncontrados.length > 0" class="mb-2 flex flex-col gap-2">
          <li v-for="cliente in clientesEncontrados" :key="cliente.id">
            <button type="button" class="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50" @click="elegirCliente(cliente)">
              <p class="text-lg font-medium text-slate-900">{{ cliente.nombre }}</p>
              <p v-if="cliente.telefono" class="text-base text-slate-500">{{ cliente.telefono }}</p>
            </button>
          </li>
        </ul>

        <button
          v-if="!mostrarFormClienteNuevo"
          type="button"
          class="btn-secondary w-full"
          @click="mostrarFormClienteNuevo = true"
        >
          <UserPlus class="size-5" />
          Cliente nuevo
        </button>

        <div v-else class="mt-2 flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
          <div>
            <label class="label">Nombre *</label>
            <input v-model="clienteNuevo.nombre" type="text" class="input" />
          </div>
          <div>
            <label class="label">Cédula *</label>
            <input v-model="clienteNuevo.cedula" type="text" class="input" />
          </div>
          <div>
            <label class="label">Teléfono *</label>
            <input v-model="clienteNuevo.telefono" type="tel" class="input" />
          </div>
          <div>
            <label class="label">Dirección</label>
            <input v-model="clienteNuevo.direccion" type="text" class="input" />
          </div>
          <p class="text-sm text-slate-500">
            Nombre, cédula y teléfono son obligatorios — es lo mínimo para poder contactar al cliente. Quedan
            guardados en el pedido como pendientes; administración completa el resto y da de alta al cliente en el
            sistema.
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary flex-1" @click="mostrarFormClienteNuevo = false">Cancelar</button>
            <button type="button" class="btn-primary flex-1" :disabled="!clienteNuevoValido" @click="confirmarClienteNuevo">
              Usar estos datos
            </button>
          </div>
        </div>
      </template>
    </section>

    <!-- 2. Datos del pedido -->
    <section class="card">
      <h2 class="mb-3 text-xl font-bold text-slate-900">2. Datos del pedido</h2>

      <label class="label" for="fecha">Fecha</label>
      <input id="fecha" v-model="fecha" type="date" class="input mb-4" />

      <label class="label">Vía de entrega</label>
      <div class="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          class="btn min-h-16"
          :class="metodoEntrega === 'encomienda' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
          @click="metodoEntrega = 'encomienda'"
        >
          Encomienda
        </button>
        <button
          type="button"
          class="btn min-h-16"
          :class="metodoEntrega === 'entrega_propia' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
          @click="metodoEntrega = 'entrega_propia'"
        >
          Entrega propia
        </button>
      </div>

      <template v-if="metodoEntrega === 'encomienda'">
        <label class="label" for="empresaEncomienda">Empresa de encomienda</label>
        <input id="empresaEncomienda" v-model="empresaEncomienda" type="text" placeholder="Ej. Correos de Costa Rica" class="input mb-4" />
      </template>

      <label class="label">Tipo de pago</label>
      <div class="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          class="btn min-h-16"
          :class="tipoPago === 'contado' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
          @click="tipoPago = 'contado'"
        >
          Contado
        </button>
        <button
          type="button"
          class="btn min-h-16"
          :class="tipoPago === 'credito' ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-700'"
          @click="tipoPago = 'credito'"
        >
          Crédito
        </button>
      </div>

      <template v-if="tipoPago === 'credito'">
        <label class="label" for="dias">Días de crédito (mínimo 30)</label>
        <input id="dias" v-model.number="diasCredito" type="number" min="30" step="1" class="input" />
        <p v-if="diasCredito < 30" class="mt-1 text-base font-medium text-red-600">El mínimo autorizado es 30 días.</p>
      </template>
    </section>

    <!-- 3. Productos -->
    <section class="card">
      <h2 class="mb-3 text-xl font-bold text-slate-900">3. Productos</h2>

      <div class="relative mb-2">
        <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
        <input
          v-model="productoTexto"
          type="text"
          placeholder="Código o nombre del producto"
          class="input pl-12"
          @input="alEscribirProducto"
        />
      </div>

      <p v-if="buscandoProductos" class="text-base text-slate-500">Buscando…</p>

      <div v-if="productosEncontrados.length > 0" class="mb-2 flex flex-col gap-3">
        <div v-for="producto in productosEncontrados" :key="producto.id" class="rounded-xl border border-slate-200 p-3">
          <div class="mb-2 flex items-center gap-2">
            <p class="text-lg font-semibold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}</p>
            <VerFotosProducto :producto="producto" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="variante in producto.variantes"
              :key="variante.id"
              type="button"
              class="rounded-full border-2 px-4 py-2 text-base font-medium"
              :class="
                varianteParaAgregar?.variante.id === variante.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              "
              @click="elegirVariante(producto, variante)"
            >
              {{ variante.color }} · {{ formatearColones(variante.precioPorPar) }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="varianteParaAgregar" class="flex items-end gap-3 rounded-xl bg-teal-50 p-4">
        <div class="flex-1">
          <label class="label">
            Docenas de {{ varianteParaAgregar.producto.codigo }} {{ varianteParaAgregar.variante.color }}
          </label>
          <input v-model.number="docenasParaAgregar" type="number" min="0.5" step="0.5" class="input" />
        </div>
        <button type="button" class="btn-primary" @click="agregarLinea">
          <Plus class="size-5" />
          Agregar
        </button>
      </div>

      <p v-if="topeDescuento > 0" class="mt-2 text-sm text-slate-500">
        Puede descontar hasta {{ topeDescuento }}% en este pedido.
      </p>

      <p v-if="lineas.length === 0" class="mt-2 text-base text-slate-500">Todavía no agregó productos.</p>

      <ul v-else class="mt-3 flex flex-col gap-2">
        <li v-for="(linea, index) in lineas" :key="index" class="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1">
              <p class="text-lg font-medium text-slate-900">{{ linea.codigoProducto }} · {{ linea.color }}</p>
              <p class="text-base text-slate-500">{{ linea.pares }} pares × {{ formatearColones(linea.precioPorPar) }}</p>
            </div>
            <div class="flex flex-col items-center">
              <input
                v-model.number="linea.docenas"
                type="number"
                min="0.5"
                step="0.5"
                class="input w-20 text-center"
                @input="recalcularLinea(linea)"
              />
              <span class="text-sm text-slate-500">docenas</span>
            </div>
            <div class="flex flex-col items-center">
              <input
                v-model.number="linea.descuentoPorcentaje"
                type="number"
                min="0"
                :max="topeDescuento"
                step="1"
                class="input w-20 text-center"
                @input="recalcularLinea(linea)"
              />
              <span class="text-sm text-slate-500">% desc.</span>
            </div>
            <div class="flex items-center gap-3">
              <p class="text-lg font-bold text-slate-900">{{ formatearColones(linea.montoLinea) }}</p>
              <button type="button" class="text-red-600" @click="quitarLinea(index)">
                <Trash2 class="size-6" />
              </button>
            </div>
          </div>
          <p v-if="errorLinea(linea)" class="text-sm font-medium text-red-600">{{ errorLinea(linea) }}</p>
        </li>
      </ul>
    </section>

    <!-- 4. Totales -->
    <section class="card">
      <h2 class="mb-3 text-xl font-bold text-slate-900">4. Total</h2>
      <div class="flex flex-col gap-2 text-lg">
        <div class="flex justify-between">
          <span class="text-slate-600">Subtotal</span>
          <span class="font-medium text-slate-900">{{ formatearColones(subtotal) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">IVA ({{ IVA_PORCENTAJE }}%)</span>
          <span class="font-medium text-slate-900">{{ formatearColones(ivaMonto) }}</span>
        </div>
        <div class="flex justify-between border-t border-slate-200 pt-2 text-xl">
          <span class="font-bold text-slate-900">Total</span>
          <span class="font-bold text-teal-700">{{ formatearColones(total) }}</span>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-lg font-medium text-red-600">{{ error }}</p>

    <p v-if="faltante && !guardando" class="text-center text-base font-semibold text-amber-700">{{ faltante }}</p>
    <button type="button" class="btn-primary w-full min-h-16 text-xl" :disabled="!puedeGuardar || guardando" @click="guardarPedido">
      <Check class="size-6" />
      {{ guardando ? 'Guardando…' : 'Guardar pedido' }}
    </button>
  </div>
</template>
