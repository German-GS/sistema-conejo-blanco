<script setup>
import { confirmar } from '../../lib/confirmar.js';
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Search, Trash2, X } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { TIPOS_IDENTIFICACION } from '../../lib/clientes.js';
import { PROVINCIAS, etiquetaProvincia } from '../../lib/provincias.js';

const auth = useAuthStore();
const clientes = ref([]);
const cargando = ref(true);

// --- Búsqueda instantánea (sin ir al servidor: ya está todo cargado) ----
// Por nombre, cédula, teléfono, correo, dirección o provincia — varias
// palabras exigen que cada una aparezca en algún campo, no todas en el
// mismo (ej. "Heredia Esperanza" encuentra un cliente de Heredia cuyo
// nombre trae "Esperanza"). Acentos y mayúsculas no importan.
const textoBusqueda = ref('');

function normalizar(valor) {
  return (valor ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const palabrasBusqueda = computed(() => normalizar(textoBusqueda.value).split(/\s+/).filter(Boolean));

function textoBuscableCliente(cliente) {
  return normalizar(
    [
      cliente.nombre,
      cliente.cedula,
      cliente.telefono,
      cliente.email,
      cliente.direccion,
      cliente.provincia ? etiquetaProvincia(cliente.provincia) : null,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

const clientesFiltrados = computed(() => {
  if (palabrasBusqueda.value.length === 0) return clientes.value;
  return clientes.value.filter((cliente) => {
    const texto = textoBuscableCliente(cliente);
    return palabrasBusqueda.value.every((palabra) => texto.includes(palabra));
  });
});
const formularioAbierto = ref(false);
const editandoId = ref(null); // null = creando un cliente nuevo
const guardando = ref(false);
const error = ref('');
const formulario = reactive({
  nombre: '',
  tipoIdentificacion: '',
  cedula: '',
  telefono: '',
  email: '',
  direccion: '',
  provincia: '',
  descuentoPorcentaje: '',
});

// Nombre/cédula/teléfono/tipo de identificación/correo son obligatorios:
// son los datos mínimos para contactar al cliente y los que Hacienda pide
// para una Factura Electrónica (dirección queda como dato opcional).
const formularioValido = computed(
  () =>
    formulario.nombre.trim() &&
    formulario.tipoIdentificacion &&
    formulario.cedula.trim() &&
    formulario.telefono.trim() &&
    formulario.email.trim(),
);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    clientes.value = await api.get('/clientes');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clientes.';
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

function abrirNuevo() {
  editandoId.value = null;
  error.value = '';
  Object.assign(formulario, {
    nombre: '',
    tipoIdentificacion: '',
    cedula: '',
    telefono: '',
    email: '',
    direccion: '',
    provincia: '',
    descuentoPorcentaje: '',
  });
  formularioAbierto.value = true;
}

function abrirEditar(cliente) {
  editandoId.value = cliente.id;
  error.value = '';
  Object.assign(formulario, {
    nombre: cliente.nombre,
    tipoIdentificacion: cliente.tipoIdentificacion,
    cedula: cliente.cedula,
    telefono: cliente.telefono,
    email: cliente.email,
    direccion: cliente.direccion ?? '',
    provincia: cliente.provincia ?? '',
    descuentoPorcentaje: cliente.descuentoPorcentaje ?? '',
  });
  formularioAbierto.value = true;
}

async function guardar() {
  if (!formularioValido.value) return;
  error.value = '';
  guardando.value = true;
  try {
    const datos = {
      nombre: formulario.nombre.trim(),
      tipoIdentificacion: formulario.tipoIdentificacion,
      cedula: formulario.cedula.trim(),
      telefono: formulario.telefono.trim(),
      email: formulario.email.trim(),
      direccion: formulario.direccion.trim() || undefined,
      provincia: formulario.provincia || undefined,
      descuentoPorcentaje: formulario.descuentoPorcentaje !== '' ? Number(formulario.descuentoPorcentaje) : undefined,
    };
    if (editandoId.value) {
      await api.patch(`/clientes/${editandoId.value}`, datos);
    } else {
      await api.post('/clientes', datos);
    }
    formularioAbierto.value = false;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar el cliente.';
  } finally {
    guardando.value = false;
  }
}

// Solo gerencia y el administrador del sistema; solo si el cliente nunca tuvo movimientos.
async function eliminar(cliente, event) {
  event.stopPropagation();
  if (!await confirmar(`¿Eliminar a "${cliente.nombre}"? No se puede deshacer. Solo se elimina si nunca tuvo pedidos, facturas ni pagos.`, { palabra: 'ELIMINAR' })) return;
  error.value = '';
  try {
    await api.delete(`/clientes/${cliente.id}`);
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo eliminar el cliente.';
  }
}

async function alternarActivo(cliente, event) {
  event.stopPropagation();
  error.value = '';
  try {
    await api.patch(`/clientes/${cliente.id}`, { activo: !cliente.activo });
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo actualizar el cliente.';
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-slate-900">Clientes</h1>
      <button type="button" class="btn-primary min-h-11 px-4 text-base" @click="formularioAbierto ? (formularioAbierto = false) : abrirNuevo()">
        <Plus class="size-5" />
        Nuevo
      </button>
    </div>

    <div v-if="formularioAbierto" class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">{{ editandoId ? 'Editar cliente' : 'Cliente nuevo' }}</p>
      <div>
        <label class="label">Nombre *</label>
        <input v-model="formulario.nombre" type="text" class="input" />
      </div>
      <div>
        <label class="label">Tipo de identificación *</label>
        <select v-model="formulario.tipoIdentificacion" class="input">
          <option value="" disabled>Elegir…</option>
          <option v-for="tipo in TIPOS_IDENTIFICACION" :key="tipo.valor" :value="tipo.valor">
            {{ tipo.etiqueta }}
          </option>
        </select>
      </div>
      <div>
        <label class="label">Cédula *</label>
        <input v-model="formulario.cedula" type="text" class="input" />
      </div>
      <div>
        <label class="label">Teléfono *</label>
        <input v-model="formulario.telefono" type="tel" class="input" />
      </div>
      <div>
        <label class="label">Correo *</label>
        <input v-model="formulario.email" type="email" class="input" />
      </div>
      <div>
        <label class="label">Dirección</label>
        <input v-model="formulario.direccion" type="text" class="input" />
      </div>
      <div>
        <label class="label">Provincia</label>
        <select v-model="formulario.provincia" class="input">
          <option value="">Sin especificar</option>
          <option v-for="p in PROVINCIAS" :key="p.valor" :value="p.valor">{{ p.etiqueta }}</option>
        </select>
      </div>
      <div>
        <label class="label">Descuento por defecto (%)</label>
        <p class="mb-2 text-sm text-slate-500">
          Se sugiere solo cuando el vendedor arma un pedido para este cliente — puede quedar por encima del tope
          general configurado (ver Configuración) si este cliente lo amerita.
        </p>
        <input v-model="formulario.descuentoPorcentaje" type="number" min="0" max="100" step="0.01" placeholder="Ej. 10" class="input" />
      </div>
      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary flex-1" @click="formularioAbierto = false">Cancelar</button>
        <button type="button" class="btn-primary flex-1" :disabled="!formularioValido || guardando" @click="guardar">
          {{ guardando ? 'Guardando…' : 'Guardar cliente' }}
        </button>
      </div>
    </div>

    <div class="relative">
      <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
      <input
        v-model="textoBusqueda"
        type="text"
        placeholder="Buscar por nombre, cédula, teléfono, correo…"
        class="input pl-12 pr-12 text-base"
      />
      <button
        v-if="textoBusqueda"
        type="button"
        aria-label="Limpiar búsqueda"
        class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-600"
        @click="textoBusqueda = ''"
      >
        <X class="size-4" />
      </button>
    </div>
    <p v-if="textoBusqueda && !cargando" class="-mt-3 text-sm text-slate-500">
      {{ clientesFiltrados.length }} resultado{{ clientesFiltrados.length === 1 ? '' : 's' }} de {{ clientes.length }}
    </p>

    <p v-if="error && !formularioAbierto" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" />
    <p v-else-if="clientesFiltrados.length === 0 && textoBusqueda" class="text-base text-slate-500">
      Ningún cliente coincide con "{{ textoBusqueda }}".
    </p>
    <p v-else-if="clientesFiltrados.length === 0" class="text-base text-slate-500">Todavía no hay clientes.</p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="cliente in clientesFiltrados" :key="cliente.id">
        <button type="button" class="card flex w-full items-center justify-between text-left" @click="abrirEditar(cliente)">
          <div>
            <p class="text-base font-semibold text-slate-900">{{ cliente.nombre }}</p>
            <p class="text-sm text-slate-500">
              {{ cliente.cedula }} · {{ cliente.telefono }} · {{ cliente.email }}
              <span v-if="cliente.provincia"> · {{ etiquetaProvincia(cliente.provincia) }}</span>
            </p>
            <p v-if="Number(cliente.descuentoPorcentaje) > 0" class="text-sm font-medium text-teal-700">
              Descuento asignado: {{ Number(cliente.descuentoPorcentaje) }}%
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full px-3 py-1 text-sm font-semibold"
              :class="cliente.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'"
              @click="alternarActivo(cliente, $event)"
            >
              {{ cliente.activo ? 'Activo' : 'Inactivo' }}
            </button>
            <button v-if="auth.esAdministracion" type="button" class="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Eliminar cliente" aria-label="Eliminar cliente" @click="eliminar(cliente, $event)">
              <Trash2 class="size-4" />
            </button>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
