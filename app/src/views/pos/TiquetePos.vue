<script setup>
import { computed } from 'vue';
import { numeroTexto, pos } from '../../lib/pos.js';
import { formatearColones } from '../../lib/format.js';

// Tiquete de venta (80 mm). Régimen simplificado: no es factura electrónica y no desglosa IVA.
const props = defineProps({ venta: { type: Object, required: true } });
const enc = computed(() => pos.catalogo?.encabezado ?? {});
const fecha = computed(() => new Date(props.venta.fecha).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
const ETIQUETA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE Móvil', transferencia: 'Transferencia' };
const vuelto = computed(() => props.venta.pagos.filter((p) => p.medio === 'efectivo' && p.recibido !== undefined).reduce((a, p) => a + Math.max(0, p.recibido - p.monto), 0));
const pares = computed(() => props.venta.lineas.reduce((a, l) => a + l.cantidad, 0));
</script>

<template>
  <div class="tiquete">
    <p v-if="venta.esPrueba" class="centro negrita">*** TIQUETE DE PRUEBA — NO VÁLIDO ***</p>
    <p class="centro negrita">{{ enc.nombreComercial || enc.razonSocial || 'Conejo Blanco' }}</p>
    <p v-if="enc.nombreComercial && enc.razonSocial" class="centro">{{ enc.razonSocial }}</p>
    <p v-if="enc.cedulaJuridica" class="centro">Céd. jurídica {{ enc.cedulaJuridica }}</p>
    <p v-if="enc.direccion" class="centro">{{ enc.direccion }}</p>
    <p v-if="enc.telefono" class="centro">Tel. {{ enc.telefono }}</p>
    <p v-if="enc.correo" class="centro">{{ enc.correo }}</p>
    <p class="centro">{{ pos.tienda?.nombre }}</p>
    <hr />
    <p class="negrita">Tiquete {{ numeroTexto(venta) }}</p>
    <p>{{ fecha }}</p>
    <p>Atendió: {{ venta.cajero }}</p>
    <hr />
    <div v-for="(l, i) in venta.lineas" :key="i" class="linea">
      <p>{{ l.cantidad }} × {{ l.codigo }} {{ l.color }}</p>
      <p class="derecha">{{ formatearColones(l.precioUnitario) }} → {{ formatearColones(l.subtotal) }}</p>
    </div>
    <hr />
    <p class="total"><span>TOTAL ({{ pares }} {{ pares === 1 ? 'par' : 'pares' }})</span><span>{{ formatearColones(venta.total) }}</span></p>
    <p v-for="(p, i) in venta.pagos" :key="i" class="fila"><span>{{ ETIQUETA[p.medio] ?? p.medio }}{{ p.referencia ? ` (${p.referencia})` : '' }}</span><span>{{ formatearColones(p.recibido ?? p.monto) }}</span></p>
    <p v-if="vuelto > 0" class="fila"><span>Vuelto</span><span>{{ formatearColones(vuelto) }}</span></p>
    <hr />
    <p class="centro">{{ enc.pie }}</p>
    <p class="centro chico">{{ enc.leyenda || 'Documento emitido bajo el régimen simplificado. No es factura electrónica.' }}</p>
  </div>
</template>

<style scoped>
.tiquete { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.35; color: #000; }
.tiquete p { margin: 0; }
.tiquete hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
.centro { text-align: center; }
.derecha { text-align: right; }
.negrita { font-weight: 700; }
.chico { font-size: 10px; margin-top: 2px; }
.linea { margin-bottom: 2px; }
.total, .fila { display: flex; justify-content: space-between; gap: 8px; }
.total { font-weight: 700; font-size: 14px; }
</style>
