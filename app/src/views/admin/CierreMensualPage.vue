<script setup>
import { confirmar } from '../../lib/confirmar.js';
import { computed, onMounted, reactive, ref } from 'vue';
import { Lock, LockOpen } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { fechaHoyISO, formatearColones } from '../../lib/format.js';
import { useAuthStore } from '../../stores/auth.js';

const auth = useAuthStore();
const m = formatearColones;
const hoy = fechaHoyISO();

const periodos = ref([]);
const cuentas = ref([]);
const periodo = ref('');
const vista = ref(null);
const pago = reactive({ cuentaBancariaId: '', fecha: hoy, notas: '' });
const cargando = ref(false);
const trabajando = ref(false);
const error = ref('');

// Meses terminados (hasta 12 atrás) que todavía están abiertos.
const mesesDisponibles = computed(() => {
  const [a, mes] = hoy.split('-').map(Number);
  const lista = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(a, mes - 1 - i, 1);
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!periodos.value.some((x) => x.periodo === p)) lista.push(p);
  }
  return lista;
});

async function cargarPeriodos() {
  periodos.value = await api.get('/contabilidad/periodos').catch(() => []);
}

async function verCierre() {
  error.value = '';
  vista.value = null;
  if (!periodo.value) return;
  cargando.value = true;
  try {
    vista.value = await api.get(`/contabilidad/periodos/${periodo.value}/vista-previa`);
    // Por defecto se paga a partir del día siguiente al fin del mes, o hoy si ya pasó.
    pago.fecha = hoy;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo calcular el cierre.';
  } finally {
    cargando.value = false;
  }
}

async function cerrar() {
  const n = vista.value.lineas.filter((l) => l.monto > 0).length;
  const texto = `¿Cerrar ${periodo.value}? Se generan ${n} asiento(s) de pago por ${m(vista.value.totalAPagar)} y el mes queda bloqueado.`;
  if (!await confirmar(texto)) return;
  error.value = '';
  trabajando.value = true;
  try {
    await api.post(`/contabilidad/periodos/${periodo.value}/cerrar`, {
      ...(pago.cuentaBancariaId ? { cuentaBancariaId: pago.cuentaBancariaId } : {}),
      fecha: pago.fecha,
      ...(pago.notas.trim() ? { notas: pago.notas.trim() } : {}),
    });
    vista.value = null;
    periodo.value = '';
    await cargarPeriodos();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cerrar el mes.';
  } finally {
    trabajando.value = false;
  }
}

async function reabrir(p) {
  if (!await confirmar(`¿Reabrir ${p.periodo}? Se reversan los asientos de pago que generó el cierre y el mes vuelve a admitir asientos.`)) return;
  error.value = '';
  try {
    await api.post(`/contabilidad/periodos/${p.periodo}/reabrir`, {});
    await cargarPeriodos();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo reabrir.';
  }
}

onMounted(async () => {
  cuentas.value = await api.get('/cuentas-bancarias?activas=true').catch(() => []);
  await cargarPeriodos();
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2"><Lock class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Cierre mensual</h1></div>
    <p class="text-sm text-slate-500">
      Se hace a mano cuando toca pagar la D-150 y las cargas del mes. Genera los asientos de pago de lo que se debe a la CCSS, al INS y a Hacienda
      (renta de salarios e IVA del mes) y deja el mes bloqueado: ya no admite asientos nuevos, así sus reportes no cambian.
    </p>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <section class="card flex flex-col gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="label">Mes a cerrar</label>
          <select v-model="periodo" class="input" @change="verCierre">
            <option value="">Elija un mes…</option>
            <option v-for="p in mesesDisponibles" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
      </div>
      <p v-if="cargando" class="text-sm text-slate-500">Calculando…</p>

      <template v-if="vista">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[34rem] text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
                <th class="py-1 pr-2">Obligación</th><th class="py-1 pr-2">Se paga a</th><th class="py-1 pr-2 text-right">Monto del mes</th><th class="py-1 text-right">Saldo actual de la cuenta</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in vista.lineas" :key="l.clave" class="border-b border-slate-100 align-top">
                <td class="py-1.5 pr-2">
                  {{ l.concepto }}
                  <p v-if="l.detalle" class="text-xs text-slate-500">{{ l.detalle }}</p>
                </td>
                <td class="py-1.5 pr-2">{{ l.destino }}</td>
                <td class="py-1.5 pr-2 text-right font-semibold">{{ m(l.monto) }}</td>
                <td class="py-1.5 text-right" :class="l.saldoCuenta - l.monto > 0.005 ? 'text-amber-700' : 'text-slate-600'">
                  {{ m(l.saldoCuenta) }}
                  <p v-if="l.saldoCuenta - l.monto > 0.005" class="text-xs">arrastra {{ m(l.saldoCuenta - l.monto) }} de otros meses</p>
                </td>
              </tr>
              <tr class="bg-slate-50 font-semibold">
                <td class="py-1.5 pr-2" colspan="2">Total a pagar</td><td class="py-1.5 pr-2 text-right">{{ m(vista.totalAPagar) }}</td><td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="vista.bloqueos.length" class="list-disc pl-5 text-sm font-medium text-red-700">
          <li v-for="(b, i) in vista.bloqueos" :key="i">{{ b }}</li>
        </ul>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">Pagado desde</label>
            <select v-model="pago.cuentaBancariaId" class="input">
              <option value="">Caja general (efectivo)</option>
              <option v-for="c in cuentas.filter((x) => !x.esCaja)" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </select>
          </div>
          <div><label class="label">Fecha del pago</label><input v-model="pago.fecha" type="date" :min="vista.hasta" :max="hoy" class="input" /></div>
          <div><label class="label">Notas (opcional)</label><input v-model="pago.notas" class="input" placeholder="Ej. D-150 de setiembre" /></div>
        </div>
        <div>
          <button type="button" class="btn-primary" :disabled="trabajando || vista.bloqueos.length > 0 || !pago.fecha" @click="cerrar">
            {{ trabajando ? 'Cerrando…' : 'Cerrar mes y generar asientos' }}
          </button>
        </div>
      </template>
    </section>

    <section class="card flex flex-col gap-3">
      <p class="text-base font-semibold text-slate-900">Meses cerrados</p>
      <p v-if="periodos.length === 0" class="text-sm text-slate-500">Todavía no hay meses cerrados.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="p in periodos" :key="p.periodo" class="rounded-xl border border-slate-200 p-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-2 font-semibold text-slate-900"><Lock class="size-4 text-slate-500" /> {{ p.periodo }}</span>
            <button v-if="auth.esSistema" type="button" class="flex items-center gap-1 font-semibold text-blue-700 underline" @click="reabrir(p)"><LockOpen class="size-4" /> Reabrir (reversa los asientos)</button>
          </div>
          <p v-if="p.resumen?.length" class="mt-1 text-slate-600">
            <span v-for="(r, i) in p.resumen" :key="r.clave">{{ i ? ' · ' : '' }}{{ r.destino }} ({{ r.clave.toUpperCase() }}) {{ m(r.monto) }}</span>
          </p>
          <p v-if="p.notas" class="text-xs text-slate-500">{{ p.notas }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
