<script setup>
import ImagenConRespaldo from '../../components/ImagenConRespaldo.vue';
import Cargando from '../../components/Cargando.vue';
import { onMounted, ref } from 'vue';
import { api, ApiError, API_URL, subirArchivo } from '../../lib/api.js';
import FacturaEncabezado from '../../components/FacturaEncabezado.vue';

const cargando = ref(true);
const error = ref('');
const guardando = ref(false);
const guardadoOk = ref(false);

// Tope de descuento que cualquier vendedor puede aplicar por su cuenta en
// un pedido, sin depender de que el cliente tenga un descuento asignado
// más alto (ver Cliente.descuentoPorcentaje en Clientes). Protege que no
// se venda por debajo del costo de producción — ver también el costo por
// color en Inventario.
const descuentoMaximoVendedorPorcentaje = ref('');

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const config = await api.get('/configuracion/descuentos');
    descuentoMaximoVendedorPorcentaje.value = config.descuentoMaximoVendedorPorcentaje;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la configuración.';
  } finally {
    cargando.value = false;
  }
}

// ---- Datos de la factura (encabezado y textos fijos) ----
const factura = ref(null);
const guardandoFactura = ref(false);
const facturaOk = ref(false);
const errorFactura = ref('');
const subiendoLogo = ref(false);

async function cargarFactura() {
  try {
    factura.value = await api.get('/configuracion/factura');
  } catch (err) {
    errorFactura.value = err instanceof ApiError ? err.message : 'No se pudo cargar la configuración de factura.';
  }
}

async function guardarFactura() {
  errorFactura.value = '';
  facturaOk.value = false;
  guardandoFactura.value = true;
  try {
    const { id: _id, logoUrl: _logo, ...campos } = factura.value;
    factura.value = await api.patch('/configuracion/factura', campos);
    facturaOk.value = true;
  } catch (err) {
    errorFactura.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardandoFactura.value = false;
  }
}

async function elegirLogo(ev) {
  const archivo = ev.target.files?.[0];
  if (!archivo) return;
  errorFactura.value = '';
  subiendoLogo.value = true;
  try {
    const f = new FormData();
    f.append('logo', archivo);
    const nueva = await subirArchivo('/configuracion/factura/logo', f);
    factura.value.logoUrl = nueva.logoUrl;
  } catch (err) {
    errorFactura.value = err instanceof ApiError ? err.message : 'No se pudo subir el logo.';
  } finally {
    subiendoLogo.value = false;
    ev.target.value = '';
  }
}

async function quitarLogo() {
  const nueva = await api.delete('/configuracion/factura/logo');
  factura.value.logoUrl = nueva.logoUrl;
}

// ---- Cuentas bancarias (donde se reciben los pagos) ----
const cuentas = ref([]);
const errorCuentas = ref('');
const guardandoCuenta = ref(false);
const mostrandoFormCuenta = ref(false);
const editandoCuentaId = ref(null);
const formCuenta = ref({ nombre: '', numeroCuenta: '', titular: '', mostrarEnFactura: true });

async function cargarCuentas() {
  try {
    cuentas.value = await api.get('/cuentas-bancarias');
  } catch (err) {
    errorCuentas.value = err instanceof ApiError ? err.message : 'No se pudieron cargar las cuentas.';
  }
}
function nuevaCuenta() {
  editandoCuentaId.value = null;
  formCuenta.value = { nombre: '', numeroCuenta: '', titular: '', mostrarEnFactura: true };
  errorCuentas.value = '';
  mostrandoFormCuenta.value = true;
}
function editarCuenta(c) {
  editandoCuentaId.value = c.id;
  formCuenta.value = { nombre: c.nombre, numeroCuenta: c.numeroCuenta, titular: c.titular, mostrarEnFactura: c.mostrarEnFactura };
  errorCuentas.value = '';
  mostrandoFormCuenta.value = true;
}
async function guardarCuenta() {
  errorCuentas.value = '';
  guardandoCuenta.value = true;
  try {
    const cuerpo = { ...formCuenta.value, titular: formCuenta.value.titular.trim() };
    if (editandoCuentaId.value) await api.patch(`/cuentas-bancarias/${editandoCuentaId.value}`, cuerpo);
    else await api.post('/cuentas-bancarias', cuerpo);
    mostrandoFormCuenta.value = false;
    await cargarCuentas();
  } catch (err) {
    errorCuentas.value = err instanceof ApiError ? err.message : 'No se pudo guardar la cuenta.';
  } finally {
    guardandoCuenta.value = false;
  }
}
async function alternarCuenta(c) {
  try {
    await api.patch(`/cuentas-bancarias/${c.id}`, { activa: !c.activa });
    await cargarCuentas();
  } catch (err) {
    errorCuentas.value = err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.';
  }
}

onMounted(() => {
  cargar();
  cargarFactura();
  cargarCuentas();
});

async function guardar() {
  error.value = '';
  guardadoOk.value = false;
  guardando.value = true;
  try {
    await api.patch('/configuracion/descuentos', {
      descuentoMaximoVendedorPorcentaje: Number(descuentoMaximoVendedorPorcentaje.value),
    });
    guardadoOk.value = true;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar la configuración.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-xl font-bold text-slate-900">Configuración</h1>

    <Cargando v-if="cargando" texto="Cargando…" />

    <div v-else class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">Descuentos</p>
      <div>
        <label class="label">Tope de descuento del vendedor (%)</label>
        <p class="mb-2 text-sm text-slate-500">
          Hasta cuánto puede descontar cualquier vendedor por su cuenta al armar un pedido, sin necesidad de que el
          cliente tenga un descuento especial asignado. Un cliente con un descuento mayor asignado en Clientes igual
          puede usar ese descuento más alto. Ningún descuento puede dejar un producto por debajo de su costo de
          producción (se carga por color en Inventario) — eso se valida siempre, sin importar este tope.
        </p>
        <input
          v-model="descuentoMaximoVendedorPorcentaje"
          type="number"
          min="0"
          max="100"
          step="0.01"
          class="input w-40"
        />
      </div>
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <p v-if="guardadoOk" class="text-sm font-medium text-teal-700">Guardado.</p>
      <button type="button" class="btn-primary w-fit" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar' }}
      </button>
    </div>

    <div v-if="factura" class="card flex flex-col gap-4">
      <div>
        <p class="text-base font-semibold text-slate-900">Datos de la factura</p>
        <p class="text-sm text-slate-500">
          Encabezado y textos que salen impresos en las facturas hechas a mano. Cada factura guarda una copia al
          emitirse, así que cambiar esto no modifica facturas anteriores.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div class="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <ImagenConRespaldo v-if="factura.logoUrl" :src="`${API_URL}${factura.logoUrl}`" alt="Logo" texto="El logo guardado ya no está disponible: suba uno nuevo" class="max-h-full max-w-full object-contain" />
          <span v-else class="text-xs text-slate-500">Sin logo</span>
        </div>
        <div class="flex flex-col gap-2">
          <label class="btn-secondary cursor-pointer">
            {{ subiendoLogo ? 'Subiendo…' : factura.logoUrl ? 'Cambiar logo' : 'Subir logo' }}
            <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" :disabled="subiendoLogo" @change="elegirLogo" />
          </label>
          <button v-if="factura.logoUrl" type="button" class="text-left text-sm font-semibold text-red-700 underline" @click="quitarLogo">Quitar logo</button>
          <p class="text-xs text-slate-500">PNG, JPG o WEBP, hasta 3 MB. Mejor con fondo blanco o transparente.</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label class="label">Razón social</label><input v-model="factura.razonSocial" class="input" placeholder="Ej. Conejo Dorado SRL" /></div>
        <div><label class="label">Cédula jurídica</label><input v-model="factura.cedulaJuridica" class="input" placeholder="Ej. 3-102-123456" /></div>
        <div class="sm:col-span-2"><label class="label">Descripción de la actividad (bajo el nombre)</label><input v-model="factura.descripcionActividad" class="input" placeholder="Ej. Fabricación de artículos confeccionados con materiales textiles…" /></div>
        <div class="sm:col-span-2"><label class="label">Actividad económica (código y nombre)</label><input v-model="factura.actividadEconomica" class="input" placeholder="Ej. 1392.0 - Fabricación de artículos confeccionados de materiales textiles" /></div>
        <div><label class="label">Correo</label><input v-model="factura.correo" type="email" class="input" /></div>
        <div><label class="label">Teléfono</label><input v-model="factura.telefono" class="input" /></div>
        <div class="sm:col-span-2"><label class="label">Dirección</label><input v-model="factura.direccion" class="input" /></div>
        <div class="sm:col-span-2">
          <label class="label">Notas predeterminadas</label>
          <textarea v-model="factura.notasPredeterminadas" rows="4" class="input" placeholder="Cuentas bancarias, SINPE Móvil, indicaciones de pago…" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Términos y condiciones</label>
          <textarea v-model="factura.terminosCondiciones" rows="5" class="input" placeholder="Condiciones para cambio, garantía…" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Leyenda de autorización</label>
          <textarea v-model="factura.leyendaAutorizacion" rows="2" class="input" placeholder="Autorizada mediante resolución MH-DGT-RES-…" />
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="mb-2 text-xs font-semibold uppercase text-slate-500">Así se verá el encabezado</p>
        <FacturaEncabezado :encabezado="factura" consecutivo="" />
      </div>

      <p v-if="errorFactura" class="text-sm font-medium text-red-600">{{ errorFactura }}</p>
      <p v-if="facturaOk" class="text-sm font-medium text-teal-700">Guardado.</p>
      <button type="button" class="btn-primary w-fit" :disabled="guardandoFactura" @click="guardarFactura">
        {{ guardandoFactura ? 'Guardando…' : 'Guardar datos de la factura' }}
      </button>
    </div>

    <div class="card flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-base font-semibold text-slate-900">Cuentas bancarias</p>
          <p class="max-w-2xl text-sm text-slate-500">
            Cuentas donde se reciben los pagos. Al registrar un pago recibido, el dinero entra a la cuenta que elijas y
            baja la cuenta por cobrar. Cada cuenta tiene su propia cuenta contable. Las marcadas para factura salen
            impresas en las facturas nuevas como «cuentas bancarias para el pago».
          </p>
        </div>
        <button type="button" class="btn-primary" @click="nuevaCuenta">Agregar cuenta</button>
      </div>

      <div v-if="mostrandoFormCuenta" class="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <div><label class="label">Banco / nombre *</label><input v-model="formCuenta.nombre" class="input" placeholder="Ej. Banco Costa Rica — colones" /></div>
        <div><label class="label">Número de cuenta o IBAN *</label><input v-model="formCuenta.numeroCuenta" class="input" placeholder="CR94015201001031091192" /></div>
        <div><label class="label">Titular</label><input v-model="formCuenta.titular" class="input" placeholder="Ej. Conejo Dorado SRL" /></div>
        <label class="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input v-model="formCuenta.mostrarEnFactura" type="checkbox" class="size-4" /> Mostrar en las facturas
        </label>
        <p v-if="errorCuentas" class="text-sm font-medium text-red-600 sm:col-span-2">{{ errorCuentas }}</p>
        <div class="flex gap-2 sm:col-span-2">
          <button type="button" class="btn-secondary" @click="mostrandoFormCuenta = false">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="guardandoCuenta || formCuenta.nombre.trim().length < 2 || formCuenta.numeroCuenta.trim().length < 4" @click="guardarCuenta">
            {{ guardandoCuenta ? 'Guardando…' : 'Guardar cuenta' }}
          </button>
        </div>
      </div>
      <p v-else-if="errorCuentas" class="text-sm font-medium text-red-600">{{ errorCuentas }}</p>

      <ul class="flex flex-col gap-2">
        <li v-for="c in cuentas" :key="c.id" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3" :class="!c.activa && 'opacity-60'">
          <div>
            <p class="text-sm font-semibold text-slate-900">
              {{ c.nombre }}
              <span v-if="c.esCaja" class="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Efectivo</span>
              <span v-if="!c.activa" class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Desactivada</span>
            </p>
            <p class="text-xs text-slate-500">
              <template v-if="c.numeroCuenta">{{ c.numeroCuenta }}<template v-if="c.titular"> · {{ c.titular }}</template> · </template>
              Cuenta contable {{ c.cuentaContable.codigo }}
              <template v-if="!c.esCaja"> · {{ c.mostrarEnFactura ? 'sale en facturas' : 'no sale en facturas' }}</template>
            </p>
          </div>
          <div v-if="!c.esCaja" class="flex gap-3 text-sm font-semibold text-blue-700">
            <button type="button" class="underline" @click="editarCuenta(c)">Editar</button>
            <button type="button" class="underline" @click="alternarCuenta(c)">{{ c.activa ? 'Desactivar' : 'Activar' }}</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
