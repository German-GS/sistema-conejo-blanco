<script setup>
import { computed } from 'vue';
import { numeroTexto, pos } from '../../lib/pos.js';

// Tiquete de venta (80 mm). Régimen simplificado: no es factura electrónica y no desglosa IVA.
// El formato sigue al de las facturas que ya usaban las tiendas: encabezado, datos del documento, detalle en dos renglones por producto,
// subtotal/descuento/total, «Paga con» y «Vuelto», y los mensajes al pie. Los montos van como 15.000,00.
const props = defineProps({ venta: { type: Object, required: true }, etiqueta: { type: String, default: '' }, reimpresion: { type: Boolean, default: false } });
const enc = computed(() => pos.catalogo?.encabezado ?? {});
const monto = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zona = { timeZone: 'America/Costa_Rica' };
const fecha = computed(() => {
  const d = new Date(props.venta.fecha);
  return `${d.toLocaleDateString('es-CR', { ...zona, day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-CR', { ...zona, hour: '2-digit', minute: '2-digit', hour12: false })}`;
});
const ETIQUETA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE Móvil', transferencia: 'Transferencia' };
const subtotal = computed(() => props.venta.subtotal ?? props.venta.lineas.reduce((a, l) => a + Number(l.subtotal), 0));
const descuento = computed(() => props.venta.lineas.reduce((a, l) => a + Number(l.descuento ?? 0), 0));
const redondeo = computed(() => Number(props.venta.redondeo ?? Math.round((props.venta.total - subtotal.value) * 100) / 100));
const pagaCon = computed(() => props.venta.pagos.reduce((a, p) => a + Number(p.recibido ?? p.monto), 0));
const vuelto = computed(() => props.venta.pagos.filter((p) => p.medio === 'efectivo' && p.recibido !== undefined).reduce((a, p) => a + Math.max(0, p.recibido - p.monto), 0));
const varios = computed(() => props.venta.pagos.length > 1 || props.venta.pagos.some((p) => p.medio !== 'efectivo'));
const detalle = (l) => [l.codigo, l.nombre, l.color && l.color !== 'Único' ? l.color : ''].filter(Boolean).join(' ');
</script>

<template>
  <div class="tiquete">
    <p v-if="etiqueta" class="centro negrita etiqueta">{{ etiqueta }}</p>
    <p v-if="venta.esPrueba" class="centro negrita">*** TIQUETE DE PRUEBA — NO VÁLIDO ***</p>
    <p class="centro negrita">{{ enc.nombreComercial || enc.razonSocial || 'Conejo Blanco' }}</p>
    <p v-if="enc.nombreComercial && enc.razonSocial" class="centro">{{ enc.razonSocial }}</p>
    <p v-if="enc.cedulaJuridica" class="centro">Ced Jur: {{ enc.cedulaJuridica }}</p>
    <p v-if="enc.direccion" class="centro">{{ enc.direccion }}</p>
    <p v-if="enc.telefono || enc.correo" class="centro">{{ enc.telefono ? `Tel: ${enc.telefono}` : '' }}{{ enc.telefono && enc.correo ? ' · ' : '' }}{{ enc.correo }}</p>
    <p class="centro">Tiquete de contado</p>
    <p v-if="reimpresion" class="centro">Reimpresión de tiquete</p>
    <p>Tiquete: {{ numeroTexto(venta) }}</p>
    <p>Fecha : {{ fecha }}</p>
    <p>Caja  : Caja 1</p>
    <p>Cliente: &lt;Cliente general&gt;</p>
    <p class="fila"><span>Producto</span><span>Cant.&nbsp;&nbsp;&nbsp;&nbsp;Total</span></p>
    <hr />
    <div v-for="(l, i) in venta.lineas" :key="i" class="linea">
      <p>{{ detalle(l) }}</p>
      <p class="fila"><span>{{ l.cantidad }}</span><span>{{ monto(l.subtotal) }}</span></p>
    </div>
    <hr />
    <p class="fila"><span>Sub Total:</span><span>{{ monto(subtotal) }}</span></p>
    <p class="fila"><span>Descuento:</span><span>{{ monto(descuento) }}</span></p>
    <p v-if="redondeo !== 0" class="fila"><span>Redondeo:</span><span>{{ monto(redondeo) }}</span></p>
    <p class="fila total"><span>Total:</span><span>{{ monto(venta.total) }}</span></p>
    <hr />
    <template v-if="varios">
      <p v-for="(p, i) in venta.pagos" :key="i" class="fila"><span>{{ ETIQUETA[p.medio] ?? p.medio }}{{ p.referencia ? ` (${p.referencia})` : '' }}:</span><span>{{ monto(p.recibido ?? p.monto) }}</span></p>
    </template>
    <p class="fila"><span>Paga con:</span><span>{{ monto(pagaCon) }}</span></p>
    <p class="fila"><span>Vuelto:</span><span>{{ monto(vuelto) }}</span></p>
    <p class="doble"></p>
    <p>Cajero: {{ venta.cajero }}</p>
    <p v-if="enc.pie" class="centro">{{ enc.pie }}</p>
    <p class="centro chico">{{ enc.leyenda || 'Documento emitido bajo el régimen simplificado. No es factura electrónica.' }}</p>
  </div>
</template>

<style scoped>
.tiquete { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.35; color: #000; }
.tiquete p { margin: 0; overflow-wrap: anywhere; }
.tiquete hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
.centro { text-align: center; }
.negrita { font-weight: 700; }
.chico { font-size: 10px; margin-top: 2px; }
.etiqueta { border: 1px solid #000; padding: 1px 2px; margin-bottom: 4px; }
.linea { margin-bottom: 2px; }
.fila { display: flex; justify-content: space-between; gap: 8px; }
.total { font-weight: 700; font-size: 14px; }
.doble { border-top: 3px double #000; margin: 4px 0; height: 0; }
</style>
