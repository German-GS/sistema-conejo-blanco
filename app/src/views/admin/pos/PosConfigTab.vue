<script setup>
import { exito } from '../../../lib/avisos.js';
import { confirmar } from '../../../lib/confirmar.js';
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { useAuthStore } from '../../../stores/auth.js';

const auth = useAuthStore();
const cfg = ref(null);
const error = ref('');
const aviso = ref('');
const guardando = ref(false);
const rehaciendo = ref(false);
const puedeEditar = auth.tienePermiso('pos.gestionar');

async function cargar() {
  try {
    cfg.value = await api.get('/pos/configuracion');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo leer la configuración.';
  }
}
onMounted(cargar);

// Con el modo de prueba ya encendido: rehace la copia con lo que hay hoy en el inventario real (borra lo que se había practicado).
async function rehacerCopia() {
  if (!(await confirmar('¿Rehacer la copia de prueba? Se borra la copia actual y todo lo practicado con ella, y se vuelve a copiar el inventario real de hoy.', { aceptar: 'Sí, rehacer la copia', peligro: true }))) return;
  rehaciendo.value = true;
  error.value = '';
  try {
    const r = await api.post('/pos/modo-prueba/copia', {});
    exito(`Copia de prueba lista: ${r.productos} productos y ${r.unidades} unidades. La caja la toma en unos minutos (o al actualizar el catálogo).`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo rehacer la copia.';
  } finally {
    rehaciendo.value = false;
  }
}

async function guardar() {
  guardando.value = true;
  error.value = '';
  aviso.value = '';
  try {
    cfg.value = await api.patch('/pos/configuracion', {
      cuentaTarjetaId: cfg.value.cuentaTarjetaId || null,
      cuentaSinpeId: cfg.value.cuentaSinpeId || null,
      cuentaTransferenciaId: cfg.value.cuentaTransferenciaId || null,
      pieTiquete: cfg.value.pieTiquete,
      redondeoColones: Number(cfg.value.redondeoColones) || 1,
      ...(auth.esSistema ? { modoPrueba: Boolean(cfg.value.modoPrueba) } : {}),
    });
    exito('Configuración guardada.');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}
const CAMPOS = [
  ['cuentaTarjetaId', 'Tarjeta (el banco deposita lo cobrado con el datáfono)'],
  ['cuentaSinpeId', 'SINPE Móvil'],
  ['cuentaTransferenciaId', 'Transferencia'],
];
</script>

<template>
  <div v-if="cfg" class="card flex max-w-2xl flex-col gap-3">
    <div>
      <p class="text-base font-semibold text-slate-900">Configuración del POS</p>
      <p class="text-sm text-slate-500">El efectivo entra a Caja y Bancos (1100). Para los demás medios elija la cuenta bancaria donde cae el dinero; si no elige una, también entra a Caja y Bancos. Las ventas no llevan IVA aparte (régimen simplificado).</p>
    </div>
    <label v-for="c in CAMPOS" :key="c[0]" class="flex flex-col text-sm font-medium text-slate-700">{{ c[1] }}
      <select v-model="cfg[c[0]]" class="input mt-1" :disabled="!puedeEditar"><option :value="null">Caja y Bancos (1100)</option><option v-for="b in cfg.cuentasBancarias" :key="b.id" :value="b.id">{{ b.nombre }}</option></select>
    </label>
    <label v-if="auth.esSistema" class="flex items-start gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <input v-model="cfg.modoPrueba" type="checkbox" class="mt-0.5 size-5" />
      <span><b>Modo de prueba</b> (solo el administrador del sistema). Al encenderlo se hace una <b>copia de prueba del inventario real de cada tienda</b> (mismos productos, precios y existencias, con la etiqueta PRUEBA) y la caja muestra solo esa copia, con un aviso grande: sirve para capacitar y explicar con datos reales. Las ventas y pedidos de la copia no generan asientos, no tocan el inventario real y no cuentan en la caja. <b>Al apagarlo, la copia y todo lo que se hizo con ella se borran</b> y la caja vuelve a mostrar los productos reales.</span>
    </label>
    <button v-if="auth.esSistema && cfg.modoPrueba" type="button" class="btn-secondary self-start" :disabled="rehaciendo" @click="rehacerCopia">{{ rehaciendo ? 'Copiando…' : 'Rehacer la copia de prueba con el inventario de hoy' }}</button>
    <label class="flex flex-col text-sm font-medium text-slate-700">Redondeo del total del tiquete
      <select v-model.number="cfg.redondeoColones" class="input mt-1" :disabled="!puedeEditar">
        <option :value="1">Al colón más cercano (₡1)</option>
        <option :value="5">Al múltiplo de ₡5 más cercano</option>
        <option :value="10">Al múltiplo de ₡10 más cercano</option>
      </select>
      <span class="mt-1 text-xs font-normal text-slate-500">Los precios pueden traer céntimos (ej. 833,33). El total de cada tiquete se redondea a este múltiplo y el tiquete muestra la línea «Redondeo». La caja lo toma al actualizar el catálogo.</span>
    </label>
    <label class="flex flex-col text-sm font-medium text-slate-700">Mensaje al pie del tiquete<input v-model="cfg.pieTiquete" type="text" maxlength="300" class="input mt-1" :disabled="!puedeEditar" /></label>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm text-green-600">{{ aviso }}</p>
    <button v-if="puedeEditar" type="button" class="btn-primary self-start" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
    <p class="text-xs text-slate-500">El encabezado del tiquete sale de los datos de cada tienda (arriba); lo que una tienda deje vacío usa Configuración → Datos de factura.</p>
  </div>
  <p v-else-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
</template>
