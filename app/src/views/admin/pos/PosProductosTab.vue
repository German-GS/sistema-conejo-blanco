<script setup>
import { exito } from '../../../lib/avisos.js';
import Cargando from '../../../components/Cargando.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../../lib/api.js';
import { formatearColones } from '../../../lib/format.js';

const props = defineProps({ ubicaciones: { type: Array, default: () => [] } });
const tienda = ref('');
const filas = ref([]);
const buscar = ref('');
const soloSinPrecio = ref(false);
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');
const aviso = ref('');
const factor = ref('');

watch(
  () => props.ubicaciones,
  (u) => {
    if (!tienda.value && u.length) tienda.value = u[0].id;
  },
  { immediate: true },
);

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function cargar() {
  if (!tienda.value) return;
  cargando.value = true;
  error.value = '';
  try {
    const [productos, stock] = await Promise.all([api.get('/catalogo/productos'), api.get(`/inventario/stock?ubicacionId=${tienda.value}`)]);
    const porVariante = new Map(stock.map((s) => [s.varianteId, s]));
    filas.value = productos
      .filter((p) => p.activo)
      .flatMap((p) =>
        (p.variantes ?? [])
          .filter((v) => v.activo)
          .map((v) => {
            const s = porVariante.get(v.id);
            return {
              varianteId: v.id,
              codigo: p.codigo,
              nombre: p.nombre,
              color: v.color,
              precioPorPar: v.precioPorPar,
              costo: v.costo,
              precioTienda: v.precioTienda ?? '',
              codigoBarras: v.codigoBarras ?? '',
              stock: s?.cantidad ?? 0,
              minimo: s?.stockMinimo ?? 0,
              orig: { precioTienda: v.precioTienda ?? '', codigoBarras: v.codigoBarras ?? '', minimo: s?.stockMinimo ?? 0 },
            };
          }),
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.color.localeCompare(b.color));
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);
watch(tienda, cargar);

const visibles = computed(() => {
  const palabras = sinTildes(buscar.value).split(/\s+/).filter(Boolean);
  return filas.value.filter((f) => (!soloSinPrecio.value || !f.precioTienda) && palabras.every((p) => sinTildes(`${f.codigo} ${f.nombre} ${f.color} ${f.codigoBarras}`).includes(p)));
});
const cambioPrecio = (f) => String(f.precioTienda ?? '') !== String(f.orig.precioTienda ?? '');
const cambioCodigo = (f) => (f.codigoBarras ?? '') !== (f.orig.codigoBarras ?? '');
const cambioMinimo = (f) => Number(f.minimo || 0) !== Number(f.orig.minimo || 0);
const sucias = computed(() => filas.value.filter((f) => cambioPrecio(f) || cambioCodigo(f) || cambioMinimo(f)));
const sinPrecio = computed(() => filas.value.filter((f) => !f.precioTienda).length);

// Códigos de barras internos EAN-13 (prefijo 200 = uso interno de la tienda) para los productos que aún no tienen uno.
function digitoControl(doce) {
  const suma = [...doce].reduce((a, d, i) => a + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (suma % 10)) % 10);
}
function generarCodigos() {
  let max = 0;
  for (const f of filas.value) if (/^200\d{10}$/.test(f.codigoBarras)) max = Math.max(max, Number(f.codigoBarras.slice(3, 12)));
  let n = 0;
  for (const f of filas.value) {
    if (f.codigoBarras) continue;
    max += 1;
    const base = `200${String(max).padStart(9, '0')}`;
    f.codigoBarras = base + digitoControl(base);
    n += 1;
  }
  aviso.value = n ? `Se asignaron ${n} códigos. Revise y guarde; luego imprima las etiquetas con ese código.` : 'Todos los productos ya tienen código de barras.';
}

function rellenarPrecios() {
  const x = Number(factor.value);
  if (!(x > 0)) return (error.value = 'Indique por cuánto multiplicar el precio de mayoreo (por ejemplo 1.5).');
  error.value = '';
  let n = 0;
  for (const f of filas.value) {
    if (f.precioTienda) continue;
    f.precioTienda = String(Math.round((Number(f.precioPorPar) * x) / 50) * 50);
    n += 1;
  }
  aviso.value = `${n} precios sugeridos (mayoreo × ${x}, redondeado a ₡50). Revíselos antes de guardar.`;
}

async function guardar() {
  guardando.value = true;
  error.value = '';
  aviso.value = '';
  let hechos = 0;
  try {
    for (const f of sucias.value.filter((x) => cambioPrecio(x) || cambioCodigo(x))) {
      const cuerpo = {};
      if (cambioPrecio(f)) cuerpo.precioTienda = f.precioTienda === '' ? null : Number(f.precioTienda);
      if (cambioCodigo(f)) cuerpo.codigoBarras = f.codigoBarras.trim() === '' ? null : f.codigoBarras.trim();
      try {
        await api.patch(`/catalogo/productos/variantes/${f.varianteId}`, cuerpo);
        f.orig.precioTienda = f.precioTienda;
        f.orig.codigoBarras = f.codigoBarras;
        hechos += 1;
      } catch (err) {
        throw new Error(`${f.codigo} ${f.color}: ${err instanceof ApiError ? err.message : 'no se pudo guardar'}`);
      }
    }
    const minimos = sucias.value.filter(cambioMinimo).map((f) => ({ varianteId: f.varianteId, minimo: Number(f.minimo || 0) }));
    if (minimos.length) {
      try {
        await api.put('/inventario/minimos', { ubicacionId: tienda.value, minimos });
      } catch (err) {
        throw new Error(`No se pudieron guardar los mínimos${hechos ? ' (los precios y códigos sí se guardaron)' : ''}: ${err instanceof ApiError ? err.message : 'error de conexión'}.`);
      }
      for (const f of filas.value) f.orig.minimo = Number(f.minimo || 0);
      hechos += minimos.length;
    }
    exito(hechos ? 'Cambios guardados. La caja los recibe al actualizar el catálogo (cada 10 minutos o al reconectarse).' : 'No había cambios que guardar.');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo guardar.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="card flex flex-col gap-3">
    <div>
      <p class="text-base font-semibold text-slate-900">Productos de la tienda</p>
      <p class="text-sm text-slate-500">Precio al detalle, código de barras (el que lee el lector) y stock mínimo para la alerta de inventario bajo. Un producto sin precio de tienda no aparece en la caja.</p>
    </div>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Tienda
        <select v-model="tienda" class="input mt-1"><option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </label>
      <label class="flex flex-col text-xs font-semibold text-slate-500">Buscar<input v-model="buscar" type="text" placeholder="código, nombre o color" class="input mt-1" /></label>
      <label class="flex items-center gap-2 pb-2 text-sm text-slate-700"><input v-model="soloSinPrecio" type="checkbox" /> Solo sin precio de tienda ({{ sinPrecio }})</label>
    </div>
    <div class="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-2">
      <label class="flex flex-col text-xs font-semibold text-slate-500">Rellenar precios vacíos: mayoreo ×<input v-model="factor" type="number" min="0" step="0.05" placeholder="1.5" class="input mt-1 !w-28" /></label>
      <button type="button" class="btn-secondary" @click="rellenarPrecios">Sugerir precios</button>
      <button type="button" class="btn-secondary" @click="generarCodigos">Asignar códigos de barras faltantes</button>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm text-green-600">{{ aviso }}</p>
    <Cargando v-if="cargando" texto="Cargando…" compacto />
    <div class="tabla-fija">
      <table class="w-full min-w-[56rem] text-sm">
        <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Producto</th><th class="py-1 pr-2">Color</th><th class="py-1 pr-2 text-right">Mayoreo</th><th class="py-1 pr-2">Precio tienda</th><th class="py-1 pr-2">Código de barras</th><th class="py-1 pr-2 text-right">Existencia</th><th class="py-1">Mínimo</th></tr></thead>
        <tbody>
          <tr v-for="f in visibles" :key="f.varianteId" class="border-b border-slate-100">
            <td class="py-1 pr-2"><span class="font-medium text-slate-800">{{ f.codigo }}</span><span class="block text-xs text-slate-500">{{ f.nombre }}</span></td>
            <td class="py-1 pr-2">{{ f.color }}</td>
            <td class="py-1 pr-2 text-right tabular-nums text-slate-500">{{ formatearColones(f.precioPorPar) }}</td>
            <td class="py-1 pr-2"><input v-model="f.precioTienda" type="number" min="0" step="0.01" class="input !w-28" :class="cambioPrecio(f) ? '!border-blue-500' : ''" /></td>
            <td class="py-1 pr-2"><input v-model="f.codigoBarras" type="text" maxlength="40" class="input !w-44 font-mono" :class="cambioCodigo(f) ? '!border-blue-500' : ''" /></td>
            <td class="py-1 pr-2 text-right font-semibold" :class="f.stock <= 0 ? 'text-red-600' : ''">{{ f.stock }}</td>
            <td class="py-1"><input v-model="f.minimo" type="number" min="0" step="1" class="input !w-20" :class="cambioMinimo(f) ? '!border-blue-500' : ''" /></td>
          </tr>
          <tr v-if="!visibles.length && !cargando"><td colspan="7" class="py-3 text-slate-500">No hay productos con ese filtro.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white py-2">
      <p class="text-sm text-slate-500">{{ sucias.length }} fila(s) con cambios</p>
      <button type="button" class="btn-primary" :disabled="!sucias.length || guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>
  </div>
</template>
