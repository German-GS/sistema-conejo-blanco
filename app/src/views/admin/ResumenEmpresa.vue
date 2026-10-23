<script setup>
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, ref } from 'vue';
import { Users, Package, UserCog, ClipboardList, LayoutGrid, TrendingUp, AlertTriangle, PackageSearch } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { formatearColones, formatearFecha } from '../../lib/format.js';
import AlertasInventario from './pos/AlertasInventario.vue';

const auth = useAuthStore();
const resumen = ref({ pedidos: 0, clientes: 0, productos: 0, personal: 0 });
const error = ref('');

// Cada tarjeta solo se pide y se muestra si el usuario tiene el permiso
// correspondiente — un contador o asistente no debe ni intentar golpear
// /usuarios (exclusivo de administración) o ver la tarjeta de Personal.
// color/borde: mismo criterio visual que un panel de indicadores — cada
// tarjeta con su propio acento para distinguirlas de un vistazo.
const TARJETAS = [
  {
    icono: ClipboardList,
    etiqueta: 'Pedidos',
    clave: 'pedidos',
    to: { name: 'admin-pedidos' },
    permiso: 'pedidos.ver',
    endpoint: '/pedidos',
    borde: 'border-blue-600',
    color: 'text-blue-600',
  },
  {
    icono: Users,
    etiqueta: 'Clientes',
    clave: 'clientes',
    to: { name: 'admin-clientes' },
    permiso: 'clientes.gestionar',
    endpoint: '/clientes',
    borde: 'border-purple-600',
    color: 'text-purple-600',
  },
  {
    icono: Package,
    etiqueta: 'Inventario',
    clave: 'productos',
    to: { name: 'admin-inventario' },
    permiso: 'catalogo.gestionar',
    endpoint: '/catalogo/productos',
    borde: 'border-teal-600',
    color: 'text-teal-600',
  },
  {
    icono: UserCog,
    etiqueta: 'Accesos',
    clave: 'personal',
    to: { name: 'admin-accesos' },
    soloSistema: true,
    endpoint: '/usuarios',
    borde: 'border-amber-600',
    color: 'text-amber-600',
  },
];

const tarjetas = computed(() =>
  TARJETAS.filter((t) => {
    if (t.soloSistema) return auth.esSistema;
    return auth.tienePermiso(t.permiso);
  }),
);

onMounted(async () => {
  // Cada tarjeta se pide por separado: si una falla (ej. sin permiso para
  // ese endpoint) las demás igual se cargan en vez de dejar todo en 0.
  for (const t of tarjetas.value) {
    try {
      const datos = await api.get(t.endpoint);
      resumen.value[t.clave] = t.clave === 'personal' ? datos.filter((u) => u.rol === 'vendedor').length : datos.length;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el resumen.';
    }
  }
});

// --- Gráfico: ventas de los últimos 6 meses (contado vs crédito) --------
const puedeVerFacturas = auth.tienePermiso('facturacion.gestionar');
const pedidosTienda = ref(null);
const puedeVerPedidosTienda = auth.tienePermiso('pos.ver') && auth.moduloActivo('pos');
onMounted(async () => {
  if (!puedeVerPedidosTienda) return;
  try {
    pedidosTienda.value = await api.get('/pos/ordenes/resumen');
  } catch {
    /* el aviso es informativo */
  }
});
const irAPedidosTienda = () => sessionStorage.setItem('cb-pedidos-pestana', 'tiendas');
const irAAlertas = () => sessionStorage.setItem('cb-tienda-pestana', 'alertas');
const puedeVerAlertas = auth.tienePermiso('inventario.ver') && auth.moduloActivo('inventario');
const resumenVentas = ref([]);
const cargandoVentas = ref(true);

const CHART_W = 560;
const CHART_H = 180;
const CHART_PAD_BOTTOM = 22;

const barras = computed(() => {
  const meses = resumenVentas.value;
  if (meses.length === 0) return [];
  const gap = 14;
  const ancho = (CHART_W - gap * (meses.length + 1)) / meses.length;
  const maxTotal = Math.max(1, ...meses.map((m) => m.total));
  const alturaDisponible = CHART_H - CHART_PAD_BOTTOM;

  return meses.map((m, i) => {
    const x = gap + i * (ancho + gap);
    const alturaContado = (m.contado / maxTotal) * alturaDisponible;
    const alturaCredito = (m.credito / maxTotal) * alturaDisponible;
    const separador = alturaContado > 0 && alturaCredito > 0 ? 2 : 0;
    const base = CHART_H - CHART_PAD_BOTTOM;
    return {
      ...m,
      x,
      ancho,
      yContado: base - alturaContado,
      alturaContado,
      yCredito: base - alturaContado - separador - alturaCredito,
      alturaCredito,
      yEtiqueta: base + 14,
    };
  });
});

async function cargarResumenVentas() {
  cargandoVentas.value = true;
  try {
    resumenVentas.value = await api.get('/facturas/resumen-mensual?meses=6');
  } catch {
    // El gráfico es informativo — si falla, el resto del dashboard igual carga.
  } finally {
    cargandoVentas.value = false;
  }
}

// --- Facturas próximas a vencer (15 días), sin filtros — la vista con
// filtros completos vive en Ingresos > Facturas. ---------------------
const facturasUrgentes = ref([]);
const cargandoFacturasUrgentes = ref(true);

async function cargarFacturasUrgentes() {
  cargandoFacturasUrgentes.value = true;
  try {
    const pendientes = await api.get('/facturas?estado=pendiente');
    facturasUrgentes.value = pendientes.filter((f) => f.diasParaVencer != null && f.diasParaVencer <= 15).slice(0, 8);
  } catch {
    // Informativo — no bloquea el resto del dashboard.
  } finally {
    cargandoFacturasUrgentes.value = false;
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

// --- Pedidos pendientes de alistar ---------------------------------------
// No existe (todavía) un estado digital de "alistado" — bodega marca la
// hoja impresa a mano. La mejor señal disponible hoy es: pedido activo
// que aún no se facturó (facturar es el momento en que este sistema
// considera la venta ya despachada/real).
const puedeVerPedidos = auth.tienePermiso('pedidos.ver');
const pedidosPorAlistar = ref([]);
const cargandoPedidos = ref(true);

async function cargarPedidosPorAlistar() {
  cargandoPedidos.value = true;
  try {
    const pedidos = await api.get('/pedidos');
    pedidosPorAlistar.value = pedidos.filter((p) => p.estado === 'activo' && !p.factura).slice(0, 8);
  } catch {
    // Informativo — no bloquea el resto del dashboard.
  } finally {
    cargandoPedidos.value = false;
  }
}

onMounted(() => {
  if (puedeVerFacturas) {
    cargarResumenVentas();
    cargarFacturasUrgentes();
  }
  if (puedeVerPedidos) {
    cargarPedidosPorAlistar();
  }
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Resumen</h1>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div class="card flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <LayoutGrid class="size-5 text-slate-500" />
        <h2 class="text-base font-bold text-slate-900">Indicadores</h2>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <router-link
          v-for="t in tarjetas"
          :key="t.clave"
          :to="t.to"
          class="flex flex-col gap-2 rounded-xl border-l-4 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
          :class="t.borde"
        >
          <component :is="t.icono" class="size-5" :class="t.color" />
          <p class="text-2xl font-bold text-slate-900">{{ resumen[t.clave] }}</p>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ t.etiqueta }}</p>
        </router-link>
      </div>
    </div>

    <!-- Pedidos de reposición de las tiendas -->
    <router-link v-if="pedidosTienda && (pedidosTienda.pendientes > 0 || pedidosTienda.enProceso > 0 || pedidosTienda.enCamino > 0)" :to="{ name: 'admin-pedidos' }" class="card flex items-center justify-between gap-3 border-l-4 border-blue-500 hover:bg-slate-50" @click="irAPedidosTienda">
      <div><p class="text-base font-bold text-slate-900">Pedidos de mercadería de las tiendas</p><p class="text-sm text-slate-600"><b>{{ pedidosTienda.pendientes }}</b> por revisar<span v-if="pedidosTienda.urgentes" class="font-semibold text-red-600"> ({{ pedidosTienda.urgentes }} urgente(s))</span> · {{ pedidosTienda.enProceso }} por alistar o enviar · {{ pedidosTienda.enCamino }} en camino</p></div>
      <span class="text-sm font-semibold text-blue-600 underline">Atender</span>
    </router-link>

    <!-- Alertas de inventario bajo (bodega y tiendas) -->
    <div v-if="puedeVerAlertas" class="card flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2"><AlertTriangle class="size-5 text-amber-500" /><h2 class="text-base font-bold text-slate-900">Inventario bajo</h2></div>
        <router-link v-if="auth.tienePermiso('pos.ver')" :to="{ name: 'admin-tienda' }" class="text-sm text-blue-600 underline" @click="irAAlertas">Ver todas</router-link>
      </div>
      <AlertasInventario compacto />
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Ventas de los últimos 6 meses -->
      <div v-if="puedeVerFacturas" class="card flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <TrendingUp class="size-5 text-blue-600" />
          <h2 class="text-base font-bold text-slate-900">Ventas — últimos 6 meses</h2>
        </div>

        <Cargando v-if="cargandoVentas" texto="Cargando…" compacto />
        <template v-else-if="barras.length > 0">
          <svg :viewBox="`0 0 ${CHART_W} ${CHART_H + 8}`" class="w-full" role="img" aria-label="Ventas facturadas por mes, contado y crédito">
            <line x1="0" :y1="CHART_H - CHART_PAD_BOTTOM" :x2="CHART_W" :y2="CHART_H - CHART_PAD_BOTTOM" stroke="#e2e8f0" stroke-width="1" />
            <g v-for="b in barras" :key="b.mes">
              <rect v-if="b.alturaContado > 0" :x="b.x" :y="b.yContado" :width="b.ancho" :height="b.alturaContado" rx="3" fill="#2563eb">
                <title>{{ b.etiqueta }} · Contado: {{ formatearColones(b.contado) }}</title>
              </rect>
              <rect v-if="b.alturaCredito > 0" :x="b.x" :y="b.yCredito" :width="b.ancho" :height="b.alturaCredito" rx="3" fill="#0d9488">
                <title>{{ b.etiqueta }} · Crédito: {{ formatearColones(b.credito) }}</title>
              </rect>
              <rect
                v-if="b.alturaContado === 0 && b.alturaCredito === 0"
                :x="b.x"
                :y="CHART_H - CHART_PAD_BOTTOM - 2"
                :width="b.ancho"
                height="2"
                rx="1"
                fill="#e2e8f0"
              />
              <text :x="b.x + b.ancho / 2" :y="b.yEtiqueta" text-anchor="middle" class="fill-slate-500" font-size="11">
                {{ b.etiqueta }}
              </text>
            </g>
          </svg>
          <div class="flex items-center gap-4 text-sm text-slate-600">
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-blue-600"></span>Contado</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-teal-600"></span>Crédito</span>
          </div>
        </template>
        <p v-else class="text-sm text-slate-500">Todavía no hay ventas facturadas.</p>
      </div>

      <!-- Facturas próximas a vencer (15 días, sin filtros) -->
      <div v-if="puedeVerFacturas" class="card flex flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <AlertTriangle class="size-5 text-amber-600" />
            <h2 class="text-base font-bold text-slate-900">Facturas próximas a vencer</h2>
          </div>
          <router-link :to="{ name: 'admin-facturas' }" class="text-sm font-semibold text-blue-600 underline">Ver todas</router-link>
        </div>
        <p class="-mt-2 text-xs text-slate-500">Pendientes que vencen dentro de 15 días (o ya vencidas).</p>

        <Cargando v-if="cargandoFacturasUrgentes" texto="Cargando…" compacto />
        <p v-else-if="facturasUrgentes.length === 0" class="text-sm text-slate-500">Ninguna factura pendiente vence pronto.</p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="f in facturasUrgentes" :key="f.id" class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">{{ f.cliente.nombre }}</p>
              <p class="text-sm text-slate-500">Orden #{{ f.numeroOrden }} · Facturada {{ formatearFecha(f.fecha) }}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold" :class="claseVencimiento(f.diasParaVencer)">{{ textoVencimiento(f.diasParaVencer) }}</p>
              <p class="text-sm text-slate-500">{{ formatearColones(f.saldo) }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Pedidos pendientes de alistar -->
      <div v-if="puedeVerPedidos" class="card flex flex-col gap-4 lg:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <PackageSearch class="size-5 text-purple-600" />
            <h2 class="text-base font-bold text-slate-900">Pedidos pendientes de alistar</h2>
          </div>
          <router-link :to="{ name: 'admin-pedidos' }" class="text-sm font-semibold text-blue-600 underline">Ver todos</router-link>
        </div>
        <p class="-mt-2 text-xs text-slate-500">Pedidos activos que todavía no se facturaron.</p>

        <Cargando v-if="cargandoPedidos" texto="Cargando…" compacto />
        <p v-else-if="pedidosPorAlistar.length === 0" class="text-sm text-slate-500">No hay pedidos pendientes de alistar.</p>
        <ul v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <li v-for="p in pedidosPorAlistar" :key="p.id">
            <router-link
              :to="{ name: 'pedido-detalle', params: { id: p.id } }"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
            >
              <div>
                <p class="text-sm font-semibold text-slate-900">
                  Orden #{{ p.numeroOrden }} — {{ p.cliente?.nombre ?? p.clientePendiente?.nombre ?? 'Cliente sin nombre' }}
                </p>
                <p class="text-sm text-slate-500">{{ formatearFecha(p.fecha) }} · {{ p.vendedor?.nombre }}</p>
              </div>
              <p class="text-sm font-bold text-slate-900">{{ formatearColones(p.total) }}</p>
            </router-link>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
