<script setup>
import { onMounted, ref, watch } from 'vue';
import { api } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import PosVentasTab from './pos/PosVentasTab.vue';
import PosCajasTab from './pos/PosCajasTab.vue';
import AlertasInventario from './pos/AlertasInventario.vue';
import PosProductosTab from './pos/PosProductosTab.vue';
import PosConfigTab from './pos/PosConfigTab.vue';
import PosPerfilesTienda from './pos/PosPerfilesTienda.vue';
import OrdenesTiendaTab from './pos/OrdenesTiendaTab.vue';
import PosActividadTab from './pos/PosActividadTab.vue';

// Panel de la tienda: ventas del POS, turnos de caja, alertas de inventario bajo, precios/códigos/mínimos y configuración.
const auth = useAuthStore();
const PESTANAS = [
  ['ventas', 'Ventas'],
  ['ordenes', 'Pedidos de tienda'],
  ['cajas', 'Cajas'],
  ['actividad', 'Actividad'],
  ['alertas', 'Alertas de inventario'],
  ...(auth.tienePermiso('catalogo.gestionar') ? [['productos', 'Productos de tienda']] : []),
  ['config', 'Configuración'],
];
const pestana = ref(sessionStorage.getItem('cb-tienda-pestana') ?? 'ventas');
watch(pestana, (p) => sessionStorage.setItem('cb-tienda-pestana', p));
const tiendas = ref([]);
const todas = ref([]);
const filtroAlertas = ref('');
onMounted(async () => {
  try {
    todas.value = await api.get('/ubicaciones');
    tiendas.value = todas.value.filter((u) => u.tipo === 'tienda' && u.activa);
  } catch {
    /* las pestañas muestran su propio error */
  }
  if (!PESTANAS.some((p) => p[0] === pestana.value)) pestana.value = 'ventas';
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-bold text-slate-900">Panel de tiendas</h1>
      <p class="text-sm text-slate-500">Lo vendido en caja, los turnos, el inventario de cada tienda y sus alertas. La caja se abre desde «Abrir caja (POS)».</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button v-for="p in PESTANAS" :key="p[0]" type="button" class="rounded-lg border px-4 py-1.5 text-sm font-semibold" :class="pestana === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="pestana = p[0]">{{ p[1] }}</button>
    </div>
    <PosVentasTab v-if="pestana === 'ventas'" :ubicaciones="tiendas" />
    <OrdenesTiendaTab v-else-if="pestana === 'ordenes'" :ubicaciones="tiendas" />
    <PosCajasTab v-else-if="pestana === 'cajas'" :ubicaciones="tiendas" />
    <PosActividadTab v-else-if="pestana === 'actividad'" :ubicaciones="tiendas" />
    <div v-else-if="pestana === 'alertas'" class="card flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><p class="text-base font-semibold text-slate-900">Inventario bajo</p><p class="text-sm text-slate-500">Existencias que llegaron al mínimo que usted definió (Productos de tienda → Mínimo), o que están en negativo.</p></div>
        <select v-model="filtroAlertas" class="input !w-auto"><option value="">Todas las ubicaciones</option><option v-for="u in todas" :key="u.id" :value="u.id">{{ u.nombre }}</option></select>
      </div>
      <AlertasInventario :ubicacion-id="filtroAlertas" />
    </div>
    <PosProductosTab v-else-if="pestana === 'productos'" :ubicaciones="tiendas" />
    <template v-else-if="pestana === 'config'">
      <PosPerfilesTienda />
      <PosConfigTab />
    </template>
  </div>
</template>
