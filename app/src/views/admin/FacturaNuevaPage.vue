<script setup>
import ImagenConRespaldo from '../../components/ImagenConRespaldo.vue';
import { usarBorrador } from '../../lib/borrador.js';
import BorradorAviso from '../../components/BorradorAviso.vue';
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Eye, Plus, Search, Trash2, X } from '@lucide/vue';
import { api, ApiError, API_URL } from '../../lib/api.js';
import { fechaHoyISO, formatearColones } from '../../lib/format.js';
import { redondear } from '../../lib/dinero.js';
import { useAuthStore } from '../../stores/auth.js';
import FacturaDocumento from '../../components/FacturaDocumento.vue';
import { avisarEmision } from '../../lib/emision.js';

// Factura hecha a mano, con el mismo orden que Alegra: encabezado,
// ajustes, información de la factura, ítems, totales, notas, términos,
// vista previa y emitir. El encabezado y los textos fijos vienen de
// Configuración → Datos de la factura.
const router = useRouter();
const auth = useAuthStore();

const IMPUESTOS = [
  { valor: 13, etiqueta: 'IVA 13 %' },
  { valor: 8, etiqueta: 'IVA 8 %' },
  { valor: 4, etiqueta: 'IVA 4 %' },
  { valor: 2, etiqueta: 'IVA 2 %' },
  { valor: 1, etiqueta: 'IVA 1 %' },
  { valor: 0, etiqueta: 'Ninguno' },
];
const MEDIOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'sinpe', etiqueta: 'SINPE Móvil' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'cheque', etiqueta: 'Cheque' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const config = ref(null);
const ubicaciones = ref([]);
const error = ref('');
const emitiendo = ref(false);
const verPrevia = ref(false);

const form = reactive({
  tipoPago: 'contado',
  diasCredito: 30,
  medioPago: 'transferencia',
  vendedor: auth.usuario?.nombre ?? '',
  ordenCompra: '',
  ubicacionId: '',
  notas: '',
  terminos: '',
  leyenda: '',
});
const fecha = fechaHoyISO();

onMounted(async () => {
  try {
    const [c, u] = await Promise.all([api.get('/configuracion/factura'), api.get('/ubicaciones')]);
    config.value = c;
    form.notas = c.notasPredeterminadas;
    form.terminos = c.terminosCondiciones;
    form.leyenda = c.leyendaAutorizacion;
    ubicaciones.value = u.filter((x) => x.permiteVenta);
    form.ubicacionId = (ubicaciones.value.find((x) => x.tipo === 'bodega_distribucion') ?? ubicaciones.value[0])?.id ?? '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la configuración.';
  }
});

// ---- Cliente ----
const clienteTexto = ref('');
const clientesEncontrados = ref([]);
const cliente = ref(null);
let temporizadorCliente;
function buscarCliente() {
  clearTimeout(temporizadorCliente);
  cliente.value = null;
  if (clienteTexto.value.trim().length < 2) {
    clientesEncontrados.value = [];
    return;
  }
  temporizadorCliente = setTimeout(async () => {
    try {
      clientesEncontrados.value = await api.get(`/clientes?buscar=${encodeURIComponent(clienteTexto.value.trim())}`);
    } catch {
      clientesEncontrados.value = [];
    }
  }, 300);
}
function elegirCliente(c) {
  cliente.value = c;
  clienteTexto.value = c.nombre;
  clientesEncontrados.value = [];
}

// ---- Ítems ----
const lineas = ref([]);
function lineaVacia() {
  return { varianteId: null, descripcion: '', cantidad: 1, precio: 0, descuento: 0, impuesto: 13 };
}
function agregarLinea() {
  lineas.value.push(lineaVacia());
}
function quitarLinea(i) {
  lineas.value.splice(i, 1);
}
agregarLinea();

const productoTexto = ref('');
const productos = ref([]);
let temporizadorProducto;
function buscarProducto() {
  clearTimeout(temporizadorProducto);
  if (productoTexto.value.trim().length < 1) {
    productos.value = [];
    return;
  }
  temporizadorProducto = setTimeout(async () => {
    try {
      productos.value = await api.get(`/catalogo/productos?buscar=${encodeURIComponent(productoTexto.value.trim())}`);
    } catch {
      productos.value = [];
    }
  }, 300);
}
function agregarProducto(producto, variante) {
  const nueva = {
    varianteId: variante.id,
    descripcion: `${producto.codigo} — ${producto.nombre} (${variante.color})`,
    cantidad: 12,
    precio: Number(variante.precioPorPar),
    descuento: 0,
    impuesto: 13,
  };
  // Reemplaza la primera línea si está vacía; si no, agrega al final.
  const vacia = lineas.value.findIndex((l) => !l.varianteId && !l.descripcion.trim() && !Number(l.precio));
  if (vacia >= 0) lineas.value.splice(vacia, 1, nueva);
  else lineas.value.push(nueva);
  productoTexto.value = '';
  productos.value = [];
}

function calcular(l) {
  const bruto = redondear(Number(l.cantidad || 0) * Number(l.precio || 0));
  const descuento = redondear(bruto * (Number(l.descuento || 0) / 100));
  const subtotal = redondear(bruto - descuento);
  return { bruto, descuento, subtotal, impuesto: redondear(subtotal * (Number(l.impuesto) / 100)) };
}
const totales = computed(() => {
  let subtotalBruto = 0;
  let descuento = 0;
  let subtotal = 0;
  let impuestos = 0;
  for (const l of lineas.value) {
    const c = calcular(l);
    subtotalBruto += c.bruto;
    descuento += c.descuento;
    subtotal += c.subtotal;
    impuestos += c.impuesto;
  }
  return {
    subtotalBruto: redondear(subtotalBruto),
    descuento: redondear(descuento),
    subtotal: redondear(subtotal),
    impuestos: redondear(impuestos),
    total: redondear(subtotal + impuestos),
  };
});
const hayCatalogo = computed(() => lineas.value.some((l) => l.varianteId));

const fechaVencimiento = computed(() => {
  if (form.tipoPago !== 'credito') return fecha;
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + Number(form.diasCredito || 0));
  return d.toISOString().slice(0, 10);
});

const lineasValidas = computed(() => lineas.value.filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0));
const problema = computed(() => {
  if (!cliente.value) return 'Elija el cliente.';
  if (lineasValidas.value.length === 0) return 'Agregue al menos una línea con descripción y cantidad.';
  if (lineasValidas.value.length !== lineas.value.length) return 'Hay líneas incompletas: completalas o quitalas.';
  if (hayCatalogo.value && !form.ubicacionId) return 'Elija de qué ubicación sale el producto.';
  if (hayCatalogo.value && lineas.value.some((l) => l.varianteId && !Number.isInteger(Number(l.cantidad)))) {
    return 'Los productos del catálogo van en pares enteros.';
  }
  if (form.tipoPago === 'credito' && !(Number(form.diasCredito) > 0)) return 'Indique los días de crédito.';
  if (totales.value.total <= 0) return 'El total debe ser mayor a cero.';
  return '';
});

// Lo que se ve en la vista previa: igual que el documento ya emitido.
const documentoPrevia = computed(() => ({
  id: '',
  origen: 'manual',
  consecutivo: '',
  fecha,
  fechaVencimiento: fechaVencimiento.value,
  condicion: form.tipoPago === 'credito' ? `Crédito ${form.diasCredito} días` : 'Contado',
  medioPago: MEDIOS_PAGO.find((m) => m.valor === form.medioPago)?.etiqueta ?? form.medioPago,
  ordenCompra: form.ordenCompra || null,
  vendedor: form.vendedor || null,
  anulada: false,
  encabezado: config.value ?? {},
  cliente: {
    nombre: cliente.value?.nombre ?? '—',
    cedula: cliente.value?.cedula ?? '',
    telefono: cliente.value?.telefono ?? '',
    email: cliente.value?.email ?? '',
    direccion: cliente.value?.direccion ?? null,
  },
  lineas: lineas.value.map((l) => ({
    descripcion: l.descripcion || '—',
    cantidad: Number(l.cantidad || 0),
    precioUnitario: Number(l.precio || 0),
    descuentoPorcentaje: Number(l.descuento || 0),
    impuestoPorcentaje: Number(l.impuesto),
    subtotal: calcular(l).subtotal,
  })),
  totales: totales.value,
  notas: form.notas || null,
  terminos: form.terminos || null,
  leyenda: form.leyenda || null,
}));

async function emitir() {
  if (problema.value) {
    error.value = problema.value;
    return;
  }
  error.value = '';
  emitiendo.value = true;
  try {
    const factura = await api.post('/facturas/manual', {
      clienteId: cliente.value.id,
      tipoPago: form.tipoPago,
      ...(form.tipoPago === 'credito' ? { diasCredito: Number(form.diasCredito) } : {}),
      medioPago: form.medioPago,
      ordenCompra: form.ordenCompra.trim() || undefined,
      vendedor: form.vendedor.trim() || undefined,
      ...(hayCatalogo.value ? { ubicacionId: form.ubicacionId } : {}),
      notas: form.notas,
      terminos: form.terminos,
      leyenda: form.leyenda,
      lineas: lineas.value.map((l) => ({
        ...(l.varianteId ? { varianteId: l.varianteId } : {}),
        descripcion: l.descripcion.trim(),
        cantidad: Number(l.cantidad),
        precioUnitario: Number(l.precio),
        descuentoPorcentaje: Number(l.descuento || 0),
        impuestoPorcentaje: Number(l.impuesto),
      })),
    });
    borrador.limpiar();
    avisarEmision(factura);
    router.push({ name: 'admin-factura-detalle', params: { id: factura.id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo emitir la factura.';
  } finally {
    emitiendo.value = false;
  }
}

// Borrador automático: si la sesión se cierra o se pierde la ventana, al volver se puede recuperar lo escrito.
const borrador = usarBorrador({
  clave: 'factura-nueva',
  obtener: () => JSON.parse(JSON.stringify({ form: { ...form }, cliente: cliente.value, clienteTexto: clienteTexto.value, lineas: lineas.value })),
  aplicar: (d) => {
    Object.assign(form, d.form);
    cliente.value = d.cliente ?? null;
    clienteTexto.value = d.clienteTexto ?? '';
    if (d.lineas?.length) lineas.value = d.lineas;
  },
  tieneDatos: (d) => Boolean(d.cliente) || d.lineas.some((l) => l.descripcion?.trim()),
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <BorradorAviso :borrador="borrador" />
    <div class="flex items-center justify-between">
      <router-link :to="{ name: 'admin-facturas' }" class="flex items-center gap-1 text-sm font-semibold text-blue-700">
        <ArrowLeft class="size-4" /> Volver a facturas
      </router-link>
      <h1 class="text-xl font-bold text-slate-900">Nueva factura de venta</h1>
      <span class="w-32" />
    </div>

    <Cargando v-if="!config" texto="Cargando…" compacto />

    <template v-else>
      <div v-if="!config.razonSocial" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Todavía no se configuró el encabezado de la factura (logo, razón social, cédula). Completalo en
        <router-link :to="{ name: 'admin-configuracion' }" class="font-semibold underline">Configuración</router-link>.
      </div>

      <section class="card">
        <div class="flex flex-wrap items-center gap-6">
          <ImagenConRespaldo v-if="config.logoUrl" :src="`${API_URL}${config.logoUrl}`" alt="Logo" silencioso class="h-20 object-contain" />
          <div class="text-sm text-slate-700">
            <p class="text-base font-bold text-slate-900">{{ config.razonSocial || 'Razón social sin configurar' }}</p>
            <p v-if="config.cedulaJuridica">CJ: {{ config.cedulaJuridica }}</p>
            <p v-if="config.descripcionActividad" class="max-w-xl text-xs">{{ config.descripcionActividad }}</p>
            <p v-if="config.correo" class="text-xs">{{ config.correo }}</p>
          </div>
          <div class="ml-auto text-sm text-slate-600">
            <p class="font-semibold text-slate-900">Factura electrónica</p>
            <p>No. <span class="text-slate-500">se asigna al emitir</span></p>
          </div>
        </div>
      </section>

      <section class="card flex flex-col gap-3">
        <p class="text-base font-semibold text-slate-900">Ajustes</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label class="label">Tipo de documento</label><input class="input" value="Factura electrónica" disabled /></div>
          <div><label class="label">Tipo de factura</label><input class="input" value="Factura de venta" disabled /></div>
          <div><label class="label">Actividad económica</label><input class="input" :value="config.actividadEconomica || '—'" disabled /></div>
          <div><label class="label">Vendedor</label><input v-model="form.vendedor" class="input" /></div>
          <div><label class="label">Orden de compra</label><input v-model="form.ordenCompra" class="input" placeholder="Número de orden del cliente" /></div>
        </div>
      </section>

      <section class="card flex flex-col gap-3">
        <p class="text-base font-semibold text-slate-900">Información de la factura</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="relative sm:col-span-2">
            <label class="label">Cliente *</label>
            <div class="relative">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input v-model="clienteTexto" class="input pl-9" placeholder="Buscar por nombre o cédula…" @input="buscarCliente" />
            </div>
            <ul v-if="clientesEncontrados.length" class="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              <li v-for="c in clientesEncontrados" :key="c.id">
                <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" @click="elegirCliente(c)">
                  <span class="font-medium">{{ c.nombre }}</span> <span class="text-slate-500">· {{ c.cedula }}</span>
                </button>
              </li>
            </ul>
            <p v-if="cliente" class="mt-1 text-xs text-teal-700">Cliente seleccionado: {{ cliente.nombre }} ({{ cliente.cedula }})</p>
          </div>
          <div><label class="label">Fecha de creación</label><input class="input" :value="fecha" disabled /></div>
          <div><label class="label">Fecha de vencimiento</label><input class="input" :value="fechaVencimiento" disabled /></div>
          <div>
            <label class="label">Condición *</label>
            <select v-model="form.tipoPago" class="input">
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </div>
          <div v-if="form.tipoPago === 'credito'">
            <label class="label">Días de crédito *</label>
            <input v-model="form.diasCredito" type="number" min="1" max="365" class="input" />
          </div>
          <div>
            <label class="label">Medio de pago *</label>
            <select v-model="form.medioPago" class="input">
              <option v-for="m in MEDIOS_PAGO" :key="m.valor" :value="m.valor">{{ m.etiqueta }}</option>
            </select>
          </div>
        </div>
      </section>

      <section class="card flex flex-col gap-3">
        <p class="text-base font-semibold text-slate-900">Ítems</p>

        <div class="relative max-w-md">
          <label class="label">Agregar producto del catálogo (descuenta inventario)</label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input v-model="productoTexto" class="input pl-9" placeholder="Código o nombre del producto…" @input="buscarProducto" />
          </div>
          <div v-if="productos.length" class="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <div v-for="p in productos" :key="p.id" class="border-b border-slate-100 p-2 last:border-0">
              <p class="text-sm font-semibold">{{ p.codigo }} — {{ p.nombre }}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <button
                  v-for="v in p.variantes.filter((x) => x.activo)"
                  :key="v.id"
                  type="button"
                  class="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-blue-50"
                  @click="agregarProducto(p, v)"
                >
                  {{ v.color }} · {{ formatearColones(v.precioPorPar) }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th class="w-8 px-1 py-2">#</th>
                <th class="min-w-64 px-1">Ítem / descripción</th>
                <th class="w-24 px-1">Cantidad</th>
                <th class="w-32 px-1">Precio</th>
                <th class="w-24 px-1">Desc. %</th>
                <th class="w-32 px-1">Impuesto</th>
                <th class="w-32 px-1 text-right">Subtotal</th>
                <th class="w-8" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in lineas" :key="i" class="align-top">
                <td class="px-1 py-2 text-slate-500">{{ i + 1 }}</td>
                <td class="px-1 py-1.5">
                  <input v-model="l.descripcion" class="input" placeholder="Descripción del producto o servicio" />
                  <p v-if="l.varianteId" class="mt-0.5 text-[11px] text-blue-700">Producto del catálogo · cantidad en pares</p>
                </td>
                <td class="px-1 py-1.5"><input v-model="l.cantidad" type="number" min="0.01" step="any" class="input" aria-label="Cantidad" /></td>
                <td class="px-1 py-1.5"><input v-model="l.precio" type="number" min="0" step="any" class="input" aria-label="Precio unitario" /></td>
                <td class="px-1 py-1.5"><input v-model="l.descuento" type="number" min="0" max="100" step="any" class="input" aria-label="Descuento en porcentaje" /></td>
                <td class="px-1 py-1.5">
                  <select v-model="l.impuesto" class="input" aria-label="Impuesto">
                    <option v-for="im in IMPUESTOS" :key="im.valor" :value="im.valor">{{ im.etiqueta }}</option>
                  </select>
                </td>
                <td class="px-1 py-3 text-right tabular-nums">{{ formatearColones(calcular(l).subtotal) }}</td>
                <td class="px-1 py-2">
                  <button type="button" class="text-slate-500 hover:text-red-600" aria-label="Quitar línea" @click="quitarLinea(i)"><Trash2 class="size-4" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" class="flex w-fit items-center gap-1 text-sm font-semibold text-blue-700" @click="agregarLinea">
          <Plus class="size-4" /> Agregar línea
        </button>

        <div v-if="hayCatalogo" class="max-w-sm">
          <label class="label">El inventario sale de *</label>
          <select v-model="form.ubicacionId" class="input">
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
        </div>

        <div class="ml-auto w-full max-w-xs text-sm">
          <div class="flex justify-between py-0.5"><span class="text-slate-600">Subtotal</span><span class="tabular-nums">{{ formatearColones(totales.subtotalBruto) }}</span></div>
          <div class="flex justify-between py-0.5"><span class="text-slate-600">Descuento</span><span class="tabular-nums">{{ formatearColones(totales.descuento) }}</span></div>
          <div class="flex justify-between py-0.5"><span class="text-slate-600">Impuestos</span><span class="tabular-nums">{{ formatearColones(totales.impuestos) }}</span></div>
          <div class="mt-1 flex justify-between border-t-2 border-slate-300 pt-1 text-lg font-bold text-slate-900">
            <span>Total</span><span class="tabular-nums">{{ formatearColones(totales.total) }}</span>
          </div>
        </div>
      </section>

      <section class="card flex flex-col gap-3">
        <div><label class="label">Notas</label><textarea v-model="form.notas" rows="4" class="input" placeholder="Cuentas bancarias, indicaciones de pago…" /></div>
        <div><label class="label">Términos y condiciones</label><textarea v-model="form.terminos" rows="4" class="input" /></div>
        <div><label class="label">Leyenda de autorización</label><textarea v-model="form.leyenda" rows="2" class="input" /></div>
        <p class="text-xs text-slate-500">Estos textos salen precargados de Configuración; acá se pueden ajustar solo para esta factura.</p>
      </section>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <router-link :to="{ name: 'admin-facturas' }" class="btn-secondary">Cancelar</router-link>
        <button type="button" class="btn-secondary" @click="verPrevia = true"><Eye class="size-4" /> Vista previa</button>
        <button type="button" class="btn-primary" :disabled="emitiendo || Boolean(problema)" :title="problema" @click="emitir">
          {{ emitiendo ? 'Emitiendo…' : 'Emitir' }}
        </button>
      </div>
      <p v-if="problema" class="text-right text-sm font-semibold text-amber-700">{{ problema }}</p>
    </template>

    <div v-if="verPrevia" class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4 sm:p-8" @click.self="verPrevia = false">
      <div class="mx-auto max-w-4xl">
        <div class="mb-2 flex justify-end">
          <button type="button" class="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold" @click="verPrevia = false">
            <X class="size-4" /> Cerrar vista previa
          </button>
        </div>
        <FacturaDocumento :doc="documentoPrevia" />
      </div>
    </div>
  </div>
</template>
