<script setup>
import { redondear } from '../../lib/dinero.js';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Search } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { fechaHoyISO, formatearColones, formatearFecha } from '../../lib/format.js';

// Pago recibido (recibo de caja), igual que en Alegra: o paga facturas a
// crédito de un cliente, o es "otros ingresos". La plata entra a la
// cuenta bancaria (o caja) elegida — las cuentas se configuran en
// Configuración → Cuentas bancarias.
const router = useRouter();
const MEDIOS = [
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'sinpe', etiqueta: 'SINPE Móvil' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'cheque', etiqueta: 'Cheque' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const config = ref(null);
const cuentas = ref([]);
const error = ref('');
const guardando = ref(false);

const form = reactive({ tipo: 'factura', cuentaBancariaId: '', fecha: fechaHoyISO(), medioPago: 'transferencia', concepto: '', monto: '', notas: '' });

onMounted(async () => {
  try {
    [config.value, cuentas.value] = await Promise.all([api.get('/configuracion/factura'), api.get('/cuentas-bancarias?activas=true')]);
    form.cuentaBancariaId = (cuentas.value.find((c) => !c.esCaja) ?? cuentas.value[0])?.id ?? '';
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la información.';
  }
});

// ---- Cliente y sus facturas por cobrar ----
const clienteTexto = ref('');
const clientesEncontrados = ref([]);
const cliente = ref(null);
const facturas = ref([]);
const montos = reactive({}); // facturaId -> monto a pagar
let temporizador;

function buscarCliente() {
  clearTimeout(temporizador);
  cliente.value = null;
  facturas.value = [];
  if (clienteTexto.value.trim().length < 2) {
    clientesEncontrados.value = [];
    return;
  }
  temporizador = setTimeout(async () => {
    try {
      clientesEncontrados.value = await api.get(`/clientes?buscar=${encodeURIComponent(clienteTexto.value.trim())}`);
    } catch {
      clientesEncontrados.value = [];
    }
  }, 300);
}
async function elegirCliente(c) {
  cliente.value = c;
  clienteTexto.value = c.nombre;
  clientesEncontrados.value = [];
  error.value = '';
  try {
    facturas.value = await api.get(`/pagos/por-cobrar/${c.id}`);
    for (const k of Object.keys(montos)) delete montos[k];
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron traer las facturas por cobrar.';
  }
}
const pagarTodo = (f) => (montos[f.id] = f.saldo);

const total = computed(() => {
  if (form.tipo === 'otros') return Number(form.monto) || 0;
  return redondear(facturas.value.reduce((a, f) => a + (Number(montos[f.id]) || 0), 0));
});
const excedido = computed(() => facturas.value.find((f) => Number(montos[f.id]) > f.saldo + 0.005));
const problema = computed(() => {
  if (!form.cuentaBancariaId) return 'Elegí la cuenta bancaria (se configuran en Configuración).';
  if (form.tipo === 'factura') {
    if (!cliente.value) return 'Elegí el cliente.';
    if (excedido.value) return `Se pasa del saldo de la factura ${excedido.value.consecutivo}.`;
  } else if (form.concepto.trim().length < 3) {
    return 'Anotá de qué es el ingreso.';
  }
  if (total.value <= 0) return 'El total debe ser mayor a cero.';
  return '';
});

async function guardar() {
  if (problema.value) {
    error.value = problema.value;
    return;
  }
  error.value = '';
  guardando.value = true;
  try {
    const cuerpo = {
      tipo: form.tipo,
      cuentaBancariaId: form.cuentaBancariaId,
      fecha: form.fecha,
      medioPago: form.medioPago,
      notas: form.notas.trim() || undefined,
      ...(form.tipo === 'factura'
        ? {
            clienteId: cliente.value.id,
            aplicaciones: facturas.value.filter((f) => Number(montos[f.id]) > 0).map((f) => ({ facturaId: f.id, monto: Number(montos[f.id]) })),
          }
        : { concepto: form.concepto.trim(), monto: Number(form.monto), ...(cliente.value ? { clienteId: cliente.value.id } : {}) }),
    };
    const pago = await api.post('/pagos', cuerpo);
    router.push({ name: 'admin-pago-detalle', params: { id: pago.id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar el pago.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-5">
    <div class="flex items-center justify-between">
      <router-link :to="{ name: 'admin-pagos' }" class="flex items-center gap-1 text-sm font-semibold text-blue-700"><ArrowLeft class="size-4" /> Volver a pagos</router-link>
      <h1 class="text-xl font-bold text-slate-900">Nuevo pago recibido</h1>
      <span class="w-28" />
    </div>

    <section class="card flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div v-if="config">
          <p class="text-base font-bold text-slate-900">{{ config.razonSocial || 'Empresa' }} <span v-if="config.cedulaJuridica" class="text-sm font-normal text-slate-500">CJ {{ config.cedulaJuridica }}</span></p>
          <p v-if="config.direccion" class="text-xs text-slate-500">{{ config.direccion }}</p>
        </div>
        <p class="text-sm text-slate-500">Recibo de caja · el número se asigna al guardar</p>
      </div>

      <div>
        <label class="label">Tipo de ingreso</label>
        <div class="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
          <button type="button" class="px-4 py-2" :class="form.tipo === 'factura' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'" @click="form.tipo = 'factura'">Pago a factura de cliente</button>
          <button type="button" class="border-l border-slate-300 px-4 py-2" :class="form.tipo === 'otros' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'" @click="form.tipo = 'otros'">Otros ingresos</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="relative">
          <label class="label">Cliente {{ form.tipo === 'factura' ? '*' : '(opcional)' }}</label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input v-model="clienteTexto" class="input pl-9" placeholder="Buscar por nombre o cédula…" @input="buscarCliente" />
          </div>
          <ul v-if="clientesEncontrados.length" class="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <li v-for="c in clientesEncontrados" :key="c.id">
              <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" @click="elegirCliente(c)">
                <span class="font-medium">{{ c.nombre }}</span> <span class="text-slate-500">· {{ c.cedula }}</span>
              </button>
            </li>
          </ul>
        </div>
        <div>
          <label class="label">Cuenta bancaria *</label>
          <select v-model="form.cuentaBancariaId" class="input">
            <option v-for="c in cuentas" :key="c.id" :value="c.id">{{ c.nombre }}{{ c.numeroCuenta ? ` — ${c.numeroCuenta}` : '' }}</option>
          </select>
        </div>
        <div><label class="label">Fecha de pago *</label><input v-model="form.fecha" type="date" :max="fechaHoyISO()" class="input" /></div>
        <div>
          <label class="label">Medio de pago *</label>
          <select v-model="form.medioPago" class="input"><option v-for="m in MEDIOS" :key="m.valor" :value="m.valor">{{ m.etiqueta }}</option></select>
        </div>
        <div><label class="label">Moneda</label><input class="input" value="CRC - Colón costarricense" disabled /></div>
      </div>
      <p v-if="cuentas.length <= 1" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Solo hay la caja general. Para recibir pagos en un banco, agregá la cuenta en
        <router-link :to="{ name: 'admin-configuracion' }" class="font-semibold underline">Configuración → Cuentas bancarias</router-link>.
      </p>

      <template v-if="form.tipo === 'factura'">
        <p v-if="!cliente" class="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Seleccioná un cliente para traer sus facturas por cobrar.</p>
        <p v-else-if="facturas.length === 0" class="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Este cliente no tiene facturas a crédito con saldo pendiente.</p>
        <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr><th class="px-3 py-2">Factura</th><th class="px-3">Vence</th><th class="px-3 text-right">Total</th><th class="px-3 text-right">Saldo</th><th class="px-3">Monto a pagar</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in facturas" :key="f.id" class="border-t border-slate-100">
                <td class="px-3 py-2 font-medium tabular-nums">{{ f.consecutivo }}</td>
                <td class="px-3" :class="f.diasParaVencer < 0 ? 'font-semibold text-red-600' : ''">{{ formatearFecha(f.fechaVencimiento) }}</td>
                <td class="px-3 text-right tabular-nums">{{ formatearColones(f.total) }}</td>
                <td class="px-3 text-right tabular-nums">{{ formatearColones(f.saldo) }}</td>
                <td class="px-3 py-1.5">
                  <div class="flex items-center gap-2">
                    <input v-model="montos[f.id]" type="number" min="0" step="0.01" class="input w-36" :class="Number(montos[f.id]) > f.saldo + 0.005 && 'border-red-500'" />
                    <button type="button" class="text-xs font-semibold text-blue-700 underline" @click="pagarTodo(f)">Todo</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="sm:col-span-2"><label class="label">Concepto *</label><input v-model="form.concepto" class="input" placeholder="Ej. Venta de retazos, reembolso…" /></div>
        <div><label class="label">Monto *</label><input v-model="form.monto" type="number" min="0" step="0.01" class="input" /></div>
      </div>

      <div class="flex items-center justify-end gap-6 border-t border-slate-200 pt-3">
        <span class="text-base font-semibold text-slate-700">Total</span>
        <span class="text-2xl font-bold tabular-nums text-slate-900">{{ formatearColones(total) }}</span>
      </div>

      <div><label class="label">Notas</label><textarea v-model="form.notas" rows="3" class="input" placeholder="Detalles adicionales que saldrán en el recibo (ej. # de transferencia)" /></div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <div class="flex items-center justify-end gap-3">
        <p v-if="problema" class="text-xs text-slate-500">{{ problema }}</p>
        <router-link :to="{ name: 'admin-pagos' }" class="btn-secondary">Cancelar</router-link>
        <button type="button" class="btn-primary" :disabled="guardando || Boolean(problema)" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </section>
  </div>
</template>
