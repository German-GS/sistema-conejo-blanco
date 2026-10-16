<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { BookOpen, Search } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';

const auth = useAuthStore();
const puedeGestionar = computed(() => auth.tienePermiso('contabilidad.gestionar'));

const GRUPOS = [
  { tipo: 'activo', titulo: 'Activos', ayuda: 'Lo que la empresa tiene y lo que le deben (incluye Cuentas por Cobrar).' },
  { tipo: 'pasivo', titulo: 'Pasivos', ayuda: 'Lo que la empresa debe (incluye Cuentas por Pagar, IVA y planilla).' },
  { tipo: 'patrimonio', titulo: 'Patrimonio', ayuda: 'Lo que es de los socios.' },
  { tipo: 'ingreso', titulo: 'Ingresos', ayuda: 'Ventas y otros ingresos.' },
  { tipo: 'gasto', titulo: 'Costos y gastos', ayuda: 'Costo de ventas y gastos de operación.' },
];
const PREFIJO = { activo: '1', pasivo: '2', patrimonio: '3', ingreso: '4', gasto: '5' };

const cuentas = ref([]);
const cargando = ref(true);
const error = ref('');
const busqueda = ref('');
const verInactivas = ref(false);

async function cargar() {
  cargando.value = true;
  try {
    cuentas.value = await api.get('/contabilidad/cuentas');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

const visibles = (tipo) =>
  cuentas.value.filter((c) => {
    if (c.tipo !== tipo) return false;
    if (!verInactivas.value && !c.activa) return false;
    const q = busqueda.value.trim().toLowerCase();
    return !q || c.codigo.includes(q) || c.nombre.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q);
  });

// ---- Crear / editar ----
const form = reactive({ id: null, codigo: '', nombre: '', tipo: 'gasto', naturaleza: '', descripcion: '' });
const mostrandoForm = ref(false);
const guardando = ref(false);
const errorForm = ref('');

function nueva() {
  Object.assign(form, { id: null, codigo: '', nombre: '', tipo: 'gasto', naturaleza: '', descripcion: '' });
  errorForm.value = '';
  mostrandoForm.value = true;
}
function editar(c) {
  Object.assign(form, { id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza, descripcion: c.descripcion });
  errorForm.value = '';
  mostrandoForm.value = true;
}
// Próximo código libre sugerido dentro del tipo (de 10 en 10).
function sugerirCodigo() {
  const usados = cuentas.value.filter((c) => c.codigo.startsWith(PREFIJO[form.tipo])).map((c) => Number(c.codigo));
  const base = Number(PREFIJO[form.tipo]) * 1000;
  let n = Math.max(base + 90, ...usados) ;
  n = Math.ceil((n + 1) / 10) * 10;
  form.codigo = String(Math.min(n, base + 999));
}
async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (form.id) {
      await api.patch(`/contabilidad/cuentas/${form.id}`, { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() });
    } else {
      await api.post('/contabilidad/cuentas', {
        codigo: form.codigo,
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        ...(form.naturaleza ? { naturaleza: form.naturaleza } : {}),
        descripcion: form.descripcion.trim() || undefined,
      });
    }
    mostrandoForm.value = false;
    await cargar();
  } catch (err) {
    errorForm.value = err instanceof ApiError ? err.message : 'No se pudo guardar la cuenta.';
  } finally {
    guardando.value = false;
  }
}
async function alternar(c) {
  error.value = '';
  try {
    await api.patch(`/contabilidad/cuentas/${c.id}`, { activa: !c.activa });
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.';
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <BookOpen class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Catálogo de cuentas</h1>
      </div>
      <button v-if="puedeGestionar" type="button" class="btn-primary" @click="nueva">Nueva cuenta</button>
    </div>
    <p class="max-w-3xl text-sm text-slate-500">
      Plan de cuentas de la empresa. Las marcadas «Sistema» las usa el sistema solo para generar asientos (ventas,
      cobros, planilla, bancos) y no se pueden desactivar. Los bancos (1110–1199) se crean desde Configuración → Cuentas
      bancarias. El saldo se calcula con todos los asientos registrados.
    </p>

    <div v-if="mostrandoForm" class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">{{ form.id ? `Editar cuenta ${form.codigo}` : 'Nueva cuenta' }}</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label class="label">Tipo *</label>
          <select v-model="form.tipo" class="input" :disabled="Boolean(form.id)" @change="!form.id && sugerirCodigo()">
            <option v-for="g in GRUPOS" :key="g.tipo" :value="g.tipo">{{ g.titulo }}</option>
          </select>
        </div>
        <div>
          <label class="label">Código * (4 dígitos)</label>
          <div class="flex gap-1">
            <input v-model="form.codigo" class="input" maxlength="4" :disabled="Boolean(form.id)" placeholder="Ej. 5305" />
            <button v-if="!form.id" type="button" class="whitespace-nowrap text-xs font-semibold text-blue-700 underline" @click="sugerirCodigo">Sugerir</button>
          </div>
        </div>
        <div class="sm:col-span-2"><label class="label">Nombre *</label><input v-model="form.nombre" class="input" /></div>
        <div v-if="!form.id" class="sm:col-span-2">
          <label class="label">Naturaleza</label>
          <select v-model="form.naturaleza" class="input">
            <option value="">Normal del tipo (activos y gastos: deudora; el resto: acreedora)</option>
            <option value="deudora">Deudora (sube con débitos)</option>
            <option value="acreedora">Acreedora (sube con créditos) — para cuentas que restan, como depreciación acumulada</option>
          </select>
        </div>
        <div class="sm:col-span-4"><label class="label">Descripción</label><input v-model="form.descripcion" class="input" placeholder="Para qué se usa esta cuenta" /></div>
      </div>
      <p v-if="errorForm" class="text-sm font-medium text-red-600">{{ errorForm }}</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="mostrandoForm = false">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="guardando || form.nombre.trim().length < 3 || (!form.id && form.codigo.length !== 4)" @click="guardar">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <div class="relative w-full max-w-sm">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input v-model="busqueda" class="input pl-9" placeholder="Buscar por código, nombre o uso…" />
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-600"><input v-model="verInactivas" type="checkbox" class="size-4" /> Ver inactivas</label>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>

    <template v-else>
      <section v-for="g in GRUPOS" :key="g.tipo" class="card">
        <p class="text-base font-bold text-slate-900">{{ g.titulo }}</p>
        <p class="mb-2 text-xs text-slate-500">{{ g.ayuda }}</p>
        <p v-if="visibles(g.tipo).length === 0" class="text-sm text-slate-400">Sin cuentas.</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="c in visibles(g.tipo)" :key="c.id" class="flex flex-wrap items-center justify-between gap-2 py-2" :class="!c.activa && 'opacity-50'">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-900">
                <span class="mr-2 tabular-nums text-slate-500">{{ c.codigo }}</span>{{ c.nombre }}
                <span v-if="c.sistema" class="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Sistema</span>
                <span v-if="c.naturaleza !== (['activo', 'gasto'].includes(c.tipo) ? 'deudora' : 'acreedora')" class="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Resta</span>
                <span v-if="!c.activa" class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Inactiva</span>
              </p>
              <p v-if="c.descripcion" class="text-xs text-slate-500">{{ c.descripcion }}</p>
            </div>
            <div class="flex items-center gap-4">
              <span class="text-sm font-semibold tabular-nums" :class="Number(c.saldo) < 0 ? 'text-red-600' : 'text-slate-800'">{{ formatearColones(c.saldo) }}</span>
              <div v-if="puedeGestionar" class="flex gap-3 text-sm font-semibold text-blue-700">
                <button type="button" class="underline" @click="editar(c)">Editar</button>
                <button v-if="!c.sistema" type="button" class="underline" @click="alternar(c)">{{ c.activa ? 'Desactivar' : 'Activar' }}</button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
