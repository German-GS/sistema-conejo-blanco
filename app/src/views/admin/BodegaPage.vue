<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Package, Plus, TriangleAlert, Search, X } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';

const auth = useAuthStore();
const puedeGestionar = auth.tienePermiso('inventario.gestionar');

// El pedido descuenta esta misma bodega apenas se crea (ver
// PedidosService.crear en el backend) — este panel es lo que bodega
// mira para saber qué le queda de verdad, no una foto aparte. El
// colchón de sobreventa configurado permite que una fila quede en
// negativo hasta cierto punto; se marca en rojo para que no pase
// desapercibido.
const VISTAS = [
  { valor: 'existencias', etiqueta: 'Existencias' },
  { valor: 'movimientos', etiqueta: 'Movimientos (kardex)' },
];
const vista = ref('existencias');

const ubicaciones = ref([]);
const filtroUbicacion = ref('');
const textoBusqueda = ref('');

const stock = ref([]);
const kardex = ref([]);
const cargando = ref(true);
const error = ref('');

function normalizar(valor) {
  return (valor ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const params = filtroUbicacion.value ? `?ubicacionId=${filtroUbicacion.value}` : '';
    if (vista.value === 'existencias') {
      stock.value = await api.get(`/inventario/stock${params}`);
    } else {
      kardex.value = await api.get(`/inventario/kardex${params}`);
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la bodega.';
  } finally {
    cargando.value = false;
  }
}

onMounted(async () => {
  try {
    ubicaciones.value = await api.get('/ubicaciones');
  } catch {
    // El filtro por ubicación es informativo — si falla, la página igual carga sin él.
  }
  await cargar();
});

watch([vista, filtroUbicacion], cargar);

const stockFiltrado = computed(() => {
  const palabras = normalizar(textoBusqueda.value).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return stock.value;
  return stock.value.filter((s) => {
    const texto = normalizar(
      [s.variante.producto.codigo, s.variante.producto.nombre, s.variante.color, s.ubicacion.nombre].join(' '),
    );
    return palabras.every((p) => texto.includes(p));
  });
});

const kardexFiltrado = computed(() => {
  const palabras = normalizar(textoBusqueda.value).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return kardex.value;
  return kardex.value.filter((m) => {
    const texto = normalizar(
      [m.variante.producto.codigo, m.variante.producto.nombre, m.variante.color, m.ubicacion.nombre].join(' '),
    );
    return palabras.every((p) => texto.includes(p));
  });
});

const ETIQUETAS_MOVIMIENTO = {
  ingreso_inicial: 'Ingreso',
  traspaso_salida: 'Traspaso (salida)',
  traspaso_entrada: 'Traspaso (entrada)',
  reserva_pedido: 'Pedido',
  liberacion_reserva: 'Pedido anulado',
  venta_facturada: 'Venta facturada',
  devolucion_venta: 'Nota de crédito',
  ajuste_conteo: 'Ajuste de conteo',
  ajuste_merma: 'Merma',
};
function etiquetaMovimiento(tipo) {
  return ETIQUETAS_MOVIMIENTO[tipo] ?? tipo;
}

// --- Ingreso manual de stock ---------------------------------------------
const mostrarIngreso = ref(false);
const ingresoUbicacionId = ref('');
const ingresoVarianteSeleccionada = ref(null);
const ingresoCantidad = ref('');
const guardandoIngreso = ref(false);
const errorIngreso = ref('');

const ingresoProductoTexto = ref('');
const ingresoProductosEncontrados = ref([]);
const buscandoIngresoProductos = ref(false);
let temporizadorIngreso = null;

function alEscribirIngresoProducto() {
  clearTimeout(temporizadorIngreso);
  if (ingresoProductoTexto.value.trim().length < 1) {
    ingresoProductosEncontrados.value = [];
    return;
  }
  temporizadorIngreso = setTimeout(async () => {
    buscandoIngresoProductos.value = true;
    try {
      ingresoProductosEncontrados.value = await api.get(
        `/catalogo/productos?buscar=${encodeURIComponent(ingresoProductoTexto.value.trim())}`,
      );
    } catch {
      ingresoProductosEncontrados.value = [];
    } finally {
      buscandoIngresoProductos.value = false;
    }
  }, 300);
}

function alternarIngreso() {
  mostrarIngreso.value = !mostrarIngreso.value;
  mostrarAjuste.value = false;
  errorIngreso.value = '';
  ingresoUbicacionId.value = filtroUbicacion.value || '';
  ingresoVarianteSeleccionada.value = null;
  ingresoCantidad.value = '';
  ingresoProductoTexto.value = '';
  ingresoProductosEncontrados.value = [];
}

function elegirVarianteIngreso(producto, variante) {
  ingresoVarianteSeleccionada.value = { producto, variante };
  ingresoProductoTexto.value = '';
  ingresoProductosEncontrados.value = [];
}

const ingresoValido = computed(
  () => ingresoUbicacionId.value && ingresoVarianteSeleccionada.value && Number(ingresoCantidad.value) > 0,
);

async function confirmarIngreso() {
  if (!ingresoValido.value) return;
  errorIngreso.value = '';
  guardandoIngreso.value = true;
  try {
    await api.post('/inventario/ingreso', {
      ubicacionId: ingresoUbicacionId.value,
      varianteId: ingresoVarianteSeleccionada.value.variante.id,
      cantidad: Number(ingresoCantidad.value),
    });
    mostrarIngreso.value = false;
    await cargar();
  } catch (err) {
    errorIngreso.value = err instanceof ApiError ? err.message : 'No se pudo registrar el ingreso.';
  } finally {
    guardandoIngreso.value = false;
  }
}

// --- Ajuste (conteo físico o merma) --------------------------------------
const TIPOS_AJUSTE = [
  { valor: 'ajuste_conteo', etiqueta: 'Ajuste de conteo (el físico no cuadraba)' },
  { valor: 'ajuste_merma', etiqueta: 'Merma (dañado, perdido)' },
];
const mostrarAjuste = ref(false);
const ajusteUbicacionId = ref('');
const ajusteVarianteSeleccionada = ref(null);
const ajusteCantidad = ref('');
const ajusteTipo = ref('ajuste_conteo');
const guardandoAjuste = ref(false);
const errorAjuste = ref('');

const ajusteProductoTexto = ref('');
const ajusteProductosEncontrados = ref([]);
const buscandoAjusteProductos = ref(false);
let temporizadorAjuste = null;

function alEscribirAjusteProducto() {
  clearTimeout(temporizadorAjuste);
  if (ajusteProductoTexto.value.trim().length < 1) {
    ajusteProductosEncontrados.value = [];
    return;
  }
  temporizadorAjuste = setTimeout(async () => {
    buscandoAjusteProductos.value = true;
    try {
      ajusteProductosEncontrados.value = await api.get(
        `/catalogo/productos?buscar=${encodeURIComponent(ajusteProductoTexto.value.trim())}`,
      );
    } catch {
      ajusteProductosEncontrados.value = [];
    } finally {
      buscandoAjusteProductos.value = false;
    }
  }, 300);
}

function alternarAjuste() {
  mostrarAjuste.value = !mostrarAjuste.value;
  mostrarIngreso.value = false;
  errorAjuste.value = '';
  ajusteUbicacionId.value = filtroUbicacion.value || '';
  ajusteVarianteSeleccionada.value = null;
  ajusteCantidad.value = '';
  ajusteTipo.value = 'ajuste_conteo';
  ajusteProductoTexto.value = '';
  ajusteProductosEncontrados.value = [];
}

function elegirVarianteAjuste(producto, variante) {
  ajusteVarianteSeleccionada.value = { producto, variante };
  ajusteProductoTexto.value = '';
  ajusteProductosEncontrados.value = [];
}

const ajusteValido = computed(
  () => ajusteUbicacionId.value && ajusteVarianteSeleccionada.value && Number(ajusteCantidad.value) !== 0,
);

async function confirmarAjuste() {
  if (!ajusteValido.value) return;
  errorAjuste.value = '';
  guardandoAjuste.value = true;
  try {
    await api.post('/inventario/ajuste', {
      ubicacionId: ajusteUbicacionId.value,
      varianteId: ajusteVarianteSeleccionada.value.variante.id,
      cantidad: Number(ajusteCantidad.value),
      tipo: ajusteTipo.value,
    });
    mostrarAjuste.value = false;
    await cargar();
  } catch (err) {
    errorAjuste.value = err instanceof ApiError ? err.message : 'No se pudo registrar el ajuste.';
  } finally {
    guardandoAjuste.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Package class="size-5 text-teal-600" />
        <h1 class="text-xl font-bold text-slate-900">Bodega</h1>
      </div>
      <div v-if="puedeGestionar" class="flex gap-2">
        <button type="button" class="btn-secondary min-h-11 px-4 text-base" @click="alternarIngreso">
          <Plus class="size-5" />
          Ingreso
        </button>
        <button type="button" class="btn-secondary min-h-11 px-4 text-base" @click="alternarAjuste">
          <Plus class="size-5" />
          Ajuste
        </button>
      </div>
    </div>

    <!-- Ingreso manual -->
    <div v-if="mostrarIngreso" class="card flex flex-col gap-3 border-2 border-teal-200 bg-teal-50">
      <p class="text-base font-semibold text-slate-900">Ingreso de stock</p>
      <p class="text-sm text-slate-600">
        Carga manual de producto terminado que ya existe o llega de producción externa — Conejo Blanco todavía no
        fabrica dentro del sistema.
      </p>
      <div>
        <label class="label">Ubicación *</label>
        <select v-model="ingresoUbicacionId" class="input bg-white">
          <option value="" disabled>Elegir…</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="label">Producto *</label>
        <div v-if="ingresoVarianteSeleccionada" class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-medium text-slate-900">
            {{ ingresoVarianteSeleccionada.producto.codigo }} · {{ ingresoVarianteSeleccionada.variante.color }}
          </p>
          <button type="button" class="text-sm font-semibold text-red-600 underline" @click="ingresoVarianteSeleccionada = null">
            Cambiar
          </button>
        </div>
        <template v-else>
          <div class="relative">
            <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              v-model="ingresoProductoTexto"
              type="text"
              placeholder="Buscar por código, nombre o color…"
              class="input bg-white pl-12"
              @input="alEscribirIngresoProducto"
            />
          </div>
          <p v-if="buscandoIngresoProductos" class="mt-1 text-sm text-slate-500">Buscando…</p>
          <div v-if="ingresoProductosEncontrados.length > 0" class="mt-2 flex flex-col gap-2">
            <div v-for="producto in ingresoProductosEncontrados" :key="producto.id" class="rounded-xl border border-slate-200 bg-white p-2">
              <p class="mb-1 text-sm font-semibold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="variante in producto.variantes"
                  :key="variante.id"
                  type="button"
                  class="rounded-full border-2 border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                  @click="elegirVarianteIngreso(producto, variante)"
                >
                  {{ variante.color }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div>
        <label class="label">Cantidad (pares) *</label>
        <input v-model="ingresoCantidad" type="number" min="1" step="1" class="input bg-white" />
      </div>
      <p v-if="errorIngreso" class="text-sm font-medium text-red-600">{{ errorIngreso }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary flex-1" @click="mostrarIngreso = false">Cancelar</button>
        <button type="button" class="btn-primary flex-1" :disabled="!ingresoValido || guardandoIngreso" @click="confirmarIngreso">
          {{ guardandoIngreso ? 'Guardando…' : 'Registrar ingreso' }}
        </button>
      </div>
    </div>

    <!-- Ajuste -->
    <div v-if="mostrarAjuste" class="card flex flex-col gap-3 border-2 border-amber-200 bg-amber-50">
      <p class="text-base font-semibold text-slate-900">Ajuste de inventario</p>
      <div>
        <label class="label">Motivo *</label>
        <select v-model="ajusteTipo" class="input bg-white">
          <option v-for="t in TIPOS_AJUSTE" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option>
        </select>
      </div>
      <div>
        <label class="label">Ubicación *</label>
        <select v-model="ajusteUbicacionId" class="input bg-white">
          <option value="" disabled>Elegir…</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="label">Producto *</label>
        <div v-if="ajusteVarianteSeleccionada" class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-medium text-slate-900">
            {{ ajusteVarianteSeleccionada.producto.codigo }} · {{ ajusteVarianteSeleccionada.variante.color }}
          </p>
          <button type="button" class="text-sm font-semibold text-red-600 underline" @click="ajusteVarianteSeleccionada = null">
            Cambiar
          </button>
        </div>
        <template v-else>
          <div class="relative">
            <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              v-model="ajusteProductoTexto"
              type="text"
              placeholder="Buscar por código, nombre o color…"
              class="input bg-white pl-12"
              @input="alEscribirAjusteProducto"
            />
          </div>
          <p v-if="buscandoAjusteProductos" class="mt-1 text-sm text-slate-500">Buscando…</p>
          <div v-if="ajusteProductosEncontrados.length > 0" class="mt-2 flex flex-col gap-2">
            <div v-for="producto in ajusteProductosEncontrados" :key="producto.id" class="rounded-xl border border-slate-200 bg-white p-2">
              <p class="mb-1 text-sm font-semibold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="variante in producto.variantes"
                  :key="variante.id"
                  type="button"
                  class="rounded-full border-2 border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                  @click="elegirVarianteAjuste(producto, variante)"
                >
                  {{ variante.color }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div>
        <label class="label">Cantidad (pares, con signo) *</label>
        <p class="mb-1 text-sm text-slate-600">Positivo si el conteo encontró más de lo que el sistema tenía, negativo si encontró menos.</p>
        <input v-model="ajusteCantidad" type="number" step="1" placeholder="Ej. -5" class="input bg-white" />
      </div>
      <p v-if="errorAjuste" class="text-sm font-medium text-red-600">{{ errorAjuste }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary flex-1" @click="mostrarAjuste = false">Cancelar</button>
        <button type="button" class="btn-primary flex-1" :disabled="!ajusteValido || guardandoAjuste" @click="confirmarAjuste">
          {{ guardandoAjuste ? 'Guardando…' : 'Registrar ajuste' }}
        </button>
      </div>
    </div>

    <div class="flex gap-2 border-b border-slate-200">
      <button
        v-for="v in VISTAS"
        :key="v.valor"
        type="button"
        class="border-b-2 px-4 py-2 text-base font-semibold transition-colors"
        :class="vista === v.valor ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="vista = v.valor"
      >
        {{ v.etiqueta }}
      </button>
    </div>

    <div class="card flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div class="relative">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="textoBusqueda"
            type="text"
            placeholder="Buscar por código, nombre, color o ubicación…"
            class="input pl-12 pr-12"
          />
          <button
            v-if="textoBusqueda"
            type="button"
            aria-label="Limpiar búsqueda"
            class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            @click="textoBusqueda = ''"
          >
            <X class="size-4" />
          </button>
        </div>
        <select v-model="filtroUbicacion" class="input">
          <option value="">Todas las ubicaciones</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>

      <!-- Existencias -->
      <template v-else-if="vista === 'existencias'">
        <p v-if="stockFiltrado.length === 0" class="text-sm text-slate-500">Nada que mostrar con estos filtros.</p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="s in stockFiltrado"
            :key="s.id"
            class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
          >
            <div>
              <p class="text-base font-semibold text-slate-900">
                {{ s.variante.producto.codigo }} · {{ s.variante.color }}
              </p>
              <p class="text-sm text-slate-500">{{ s.variante.producto.nombre }} · {{ s.ubicacion.nombre }}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold" :class="s.cantidad < 0 ? 'text-red-600' : 'text-slate-900'">
                {{ s.cantidad }} <span class="text-sm font-normal text-slate-500">pares</span>
              </p>
              <p v-if="s.cantidad < 0" class="flex items-center gap-1 text-xs font-semibold text-red-600">
                <TriangleAlert class="size-3" />
                Sobrevendido (dentro del colchón)
              </p>
            </div>
          </li>
        </ul>
      </template>

      <!-- Movimientos (kardex) -->
      <template v-else>
        <p v-if="kardexFiltrado.length === 0" class="text-sm text-slate-500">Nada que mostrar con estos filtros.</p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="m in kardexFiltrado" :key="m.id" class="rounded-xl border border-slate-200 p-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-base font-semibold text-slate-900">
                  {{ m.variante.producto.codigo }} · {{ m.variante.color }}
                  <span class="font-normal text-slate-500">· {{ m.ubicacion.nombre }}</span>
                </p>
                <p class="text-sm text-slate-500">
                  {{ etiquetaMovimiento(m.tipo) }} · {{ m.creadoPor?.nombre ?? 'Usuario eliminado' }} ·
                  {{ formatearFechaHora(m.creadoEn) }}
                </p>
              </div>
              <p class="text-lg font-bold" :class="m.cantidad < 0 ? 'text-red-600' : 'text-teal-700'">
                {{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}
              </p>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
