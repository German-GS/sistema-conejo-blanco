<script setup>
import { confirmar } from '../../lib/confirmar.js';
import CampoClave from '../../components/CampoClave.vue';
import CambiarVista from '../../layout/CambiarVista.vue';
import CambiarTema from '../../layout/CambiarTema.vue';
import { descargarCsv, fechaArchivo } from '../../lib/csv.js';
import { registrarActividad } from '../../lib/actividad.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Banknote, Barcode, Boxes, Cloud, Download, CloudOff, CircleCheck, FlaskConical, CreditCard, Info, KeyRound, Landmark, LogOut, Minus, PackagePlus, Plus, Printer, Receipt, RefreshCw, ScanBarcode, Smartphone, Trash2, Truck, TriangleAlert, Wallet, X } from '@lucide/vue';
import logoMenu from '../../logo/logo-menu.png';
import { useAuthStore } from '../../stores/auth.js';
import { api, ApiError } from '../../lib/api.js';
import { formatearColones, formatearFechaHora } from '../../lib/format.js';
import {
  abrirCaja, alertasLocales, buscar, buscarExacto, cambiarTienda, esVendible, cerrarCaja, cobrar, descargarCatalogo, detenerPos, efectivoEsperado, elegirTienda,
  guardarImprimirAuto, iniciarPos, minimoDe, ajustesPorEnviar, ajustesRechazados, desdeUltimoRespaldo, guardarConteo, respaldar, restaurar, reintentarAjustes, recepcionPendiente, recepcionesPorEnviar, recepcionesRechazadas, reintentarRecepciones, numeroTexto, pendientes, pos, rechazadas, reintentarRechazadas, resumenTurno, sincronizar, stockDe, sugerenciasPedido, ordenesPendientes,
} from '../../lib/pos.js';
import TiquetePos from './TiquetePos.vue';
import PedidoReposicion from './PedidoReposicion.vue';

const auth = useAuthStore();
const router = useRouter();
const cajero = computed(() => ({ id: auth.usuario.id, nombre: auth.usuario.nombre }));
const ETIQUETA_ROL = { encargado_tienda: 'Encargado de tienda', administracion: 'Administración', gerente_general: 'Gerente general', sistema: 'Administrador del sistema' };

// Solo el administrador del sistema: enciende o apaga el modo de prueba sin salir de la caja y baja el catálogo de nuevo.
const cambiandoPrueba = ref(false);
async function alternarModoPrueba() {
  cambiandoPrueba.value = true;
  try {
    await api.patch('/pos/configuracion', { modoPrueba: !pos.catalogo?.modoPrueba });
    await descargarCatalogo();
  } catch (err) {
    avisar(err instanceof ApiError ? err.message : 'No se pudo cambiar el modo de prueba.');
  } finally {
    cambiandoPrueba.value = false;
  }
}

// Lo que hay en esta tienda (con existencias o con mínimo definido) y el panel de inventario.
const enTienda = computed(() => (pos.catalogo?.variantes ?? []).filter((v) => stockDe(v.varianteId) > 0 || minimoDe(v.varianteId) > 0));
const invTexto = ref('');
const invTodo = ref(false);
const invFilas = computed(() => {
  const base = invTexto.value.trim() ? buscar(invTexto.value, 500, true) : pos.catalogo?.variantes ?? [];
  return [...base].filter((v) => invTodo.value || stockDe(v.varianteId) > 0 || minimoDe(v.varianteId) > 0).sort((a, b) => a.codigo.localeCompare(b.codigo) || a.color.localeCompare(b.color)).slice(0, 150);
});
const invPares = computed(() => invFilas.value.reduce((a, v) => a + Math.max(stockDe(v.varianteId), 0), 0));
// La administración puede ir directo a ponerle precio a lo que ya está en la tienda.
function irAPrecios() {
  try {
    sessionStorage.setItem('cb-tienda-pestana', 'productos');
  } catch {
    /* sin sessionStorage solo abre la primera pestaña */
  }
  router.push({ name: 'admin-tienda' });
}

// ---- Informes en CSV (se arman con lo guardado en esta computadora, así que funcionan sin internet)
const informePeriodo = ref('hoy');
const PERIODOS = [['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['todo', 'Todo lo guardado']];
const ZONA_CR = 'America/Costa_Rica';
const diaCR = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: ZONA_CR });
const horaCR = (d) => new Date(d).toLocaleTimeString('es-CR', { timeZone: ZONA_CR, hour: '2-digit', minute: '2-digit', hour12: false });
const ventasInforme = computed(() => {
  const desde = informePeriodo.value === 'todo' ? null : diaCR(Date.now() - (informePeriodo.value === 'hoy' ? 0 : (Number(informePeriodo.value) - 1) * 86_400_000));
  return pos.ventas.filter((v) => (v.ubicacionId ?? pos.tienda?.id) === pos.tienda?.id && (!desde || diaCR(v.fecha) >= desde)).sort((a, b) => a.numero - b.numero);
});
function exportarVentas() {
  const filas = [];
  for (const v of ventasInforme.value) v.lineas.forEach((l, i) => filas.push({ v, l, primera: i === 0 }));
  const columnas = [
    ['Tiquete', (f) => numeroTexto(f.v)],
    ['Fecha', (f) => diaCR(f.v.fecha)],
    ['Hora', (f) => horaCR(f.v.fecha)],
    ['Cajero', (f) => f.v.cajero],
    ['Estado', (f) => (f.v.anulada ? 'Anulado' : 'Vigente')],
    ['Prueba', (f) => !!f.v.esPrueba],
    ['Código', (f) => f.l.codigo],
    ['Producto', (f) => f.l.nombre],
    ['Color', (f) => f.l.color],
    ['Cantidad', (f) => f.l.cantidad],
    ['Precio unitario', (f) => f.l.precioUnitario],
    ['Subtotal', (f) => f.l.subtotal],
    ['Total del tiquete (solo en su primera línea)', (f) => (f.primera ? f.v.total : '')],
    ['Formas de pago', (f) => f.v.pagos.map((p) => ETIQUETA[p.medio] ?? p.medio).join(' + ')],
    ['Cobrado sin internet', (f) => !!f.v.sinConexion],
    ['Enviado al sistema', (f) => !!f.v.enviada],
  ];
  descargarCsv(`ventas-${pos.tienda.codigo}-${fechaArchivo()}`, columnas, filas);
  avisar(`Se descargó el informe de ventas (${ventasInforme.value.length} tiquete(s)).`);
}
function exportarInventario() {
  const estado = (v) => (stockDe(v.varianteId) <= 0 ? 'Agotado' : minimoDe(v.varianteId) > 0 && stockDe(v.varianteId) <= minimoDe(v.varianteId) ? 'Bajo' : 'Normal');
  const columnas = [
    ['Tienda', () => pos.tienda.nombre],
    ['Código', (v) => v.codigo],
    ['Producto', (v) => v.nombre],
    ['Color', (v) => v.color],
    ['Código de barras', (v) => v.codigoBarras ?? ''],
    ['Existencia en tienda', (v) => stockDe(v.varianteId)],
    ['Mínimo', (v) => minimoDe(v.varianteId)],
    ['Estado', estado],
    ['Precio de tienda', (v) => (esVendible(v) ? v.precio : '')],
    ['Prueba', (v) => !!v.prueba],
  ];
  descargarCsv(`inventario-${pos.tienda.codigo}-${fechaArchivo()}`, columnas, invFilas.value);
  avisar(`Se descargó el inventario (${invFilas.value.length} producto(s)).`);
}

// ---- Conteo de inventario (solo sube la existencia; lo que baja, baja por ventas). Queda en el kardex y en la bitácora del sistema.
const contando = ref(false);
const conteo = ref({});
const notaConteo = ref('');
const errorConteo = ref('');
const guardandoConteo = ref(false);
const diferenciaConteo = (v) => Math.round(Number(conteo.value[v.varianteId])) - stockDe(v.varianteId);
const lineasConteo = computed(() => Object.entries(conteo.value).filter(([, c]) => c !== '' && c !== undefined && c !== null && Number.isFinite(Number(c))).map(([varianteId]) => ({ varianteId, cantidad: diferenciaConteo({ varianteId }) })));
const hayBajada = computed(() => lineasConteo.value.some((l) => l.cantidad < 0));
const paresConteo = computed(() => lineasConteo.value.filter((l) => l.cantidad > 0).reduce((a, l) => a + l.cantidad, 0));
const conteoValido = computed(() => paresConteo.value > 0 && !hayBajada.value && notaConteo.value.trim().length >= 3);
function empezarConteo() {
  conteo.value = {};
  notaConteo.value = '';
  errorConteo.value = '';
  invTodo.value = true;
  contando.value = true;
}
async function guardarElConteo() {
  errorConteo.value = '';
  guardandoConteo.value = true;
  try {
    await guardarConteo(lineasConteo.value.filter((l) => l.cantidad > 0), notaConteo.value);
    avisar(`Conteo guardado: se sumaron ${paresConteo.value} pares al inventario.`);
    contando.value = false;
    conteo.value = {};
  } catch (err) {
    errorConteo.value = err instanceof Error ? err.message : 'No se pudo guardar el conteo.';
  } finally {
    guardandoConteo.value = false;
  }
}
// ---- Entrar de nuevo con internet (la sesión se confirmó sin internet o venció con la caja abierta)
const mostrarReauth = ref(false);
const claveReauth = ref('');
const errorReauth = ref('');
const reautenticando = ref(false);
const faltaConfirmar = computed(() => auth.sesionLocal && pos.enLinea);
watch(faltaConfirmar, async (falta) => {
  if (!falta) return;
  if (await auth.reautenticarSilencioso()) {
    await sincronizar();
    await descargarCatalogo();
  }
}, { immediate: true });
async function confirmarClave() {
  errorReauth.value = '';
  reautenticando.value = true;
  try {
    await auth.reautenticar(claveReauth.value);
    claveReauth.value = '';
    mostrarReauth.value = false;
    await sincronizar();
    await descargarCatalogo();
  } catch (err) {
    errorReauth.value = err instanceof Error ? err.message : 'No se pudo confirmar la contraseña.';
  } finally {
    reautenticando.value = false;
  }
}

// ---- Respaldo de seguridad (por si se borran los datos del navegador)
const restauradoMsg = ref('');
const porEnviarTotal = computed(() => pendientes.value.length + ordenesPendientes.value.length + recepcionesPorEnviar.value.length + ajustesPorEnviar.value.length);
async function guardarRespaldo() {
  const r = await respaldar();
  avisar(`Respaldo guardado en la carpeta de descargas (${r.ventas} venta(s), ${r.cajas} caja(s), ${r.ordenes} pedido(s)).`);
}
async function alElegirRespaldo(e) {
  const archivo = e.target.files?.[0];
  e.target.value = '';
  if (!archivo) return;
  try {
    const nuevos = await restaurar(await archivo.text());
    restauradoMsg.value = nuevos ? `Se recuperaron ${nuevos} registro(s) del respaldo. Se enviarán al sistema cuando haya internet.` : 'El respaldo no trae nada nuevo: todo eso ya estaba en esta computadora.';
  } catch (err) {
    restauradoMsg.value = err instanceof Error ? err.message : 'No se pudo restaurar el respaldo.';
  }
}

// ---- Tienda de esta terminal
const tiendas = ref([]);
const errorTienda = ref('');
async function cargarTiendas() {
  errorTienda.value = '';
  try {
    tiendas.value = await api.get('/pos/tiendas');
  } catch (err) {
    errorTienda.value = err instanceof ApiError ? err.message : 'No se pudo leer la lista de tiendas. Se necesita internet la primera vez.';
  }
}

// ---- Búsqueda y tiquete
const texto = ref('');
const entrada = ref(null);
const carrito = ref([]);
// Se busca en todo lo que hay en la tienda; lo que no tiene precio de tienda se ve pero no se puede vender.
const resultados = computed(() => [...buscar(texto.value, 24, true)].sort((a, b) => Number(esVendible(b)) - Number(esVendible(a))));
const total = computed(() => Math.round(carrito.value.reduce((a, l) => a + l.precio * l.cantidad, 0) * 100) / 100);
const pares = computed(() => carrito.value.reduce((a, l) => a + l.cantidad, 0));
const aviso = ref('');
let avisoTimer = null;
function avisar(m) {
  aviso.value = m;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (aviso.value = ''), 4000);
}

function agregar(v) {
  if (!esVendible(v)) return avisar(`${v.codigo} ${v.color} está en la tienda pero todavía no tiene precio de tienda: avise a la administración para poder venderlo.`);
  const existente = carrito.value.find((l) => l.varianteId === v.varianteId);
  if (existente) existente.cantidad += 1;
  else {
    if (carrito.value.length && carrito.value.some((l) => !!l.prueba !== !!v.prueba)) return avisar('No se pueden mezclar productos de PRUEBA con productos reales en el mismo tiquete. Termine o borre el tiquete actual.');
    carrito.value.push({ varianteId: v.varianteId, codigo: v.codigo, nombre: v.nombre, color: v.color, precio: v.precio, cantidad: 1, prueba: !!v.prueba });
  }
  if (stockDe(v.varianteId) - (carrito.value.find((l) => l.varianteId === v.varianteId)?.cantidad ?? 0) < 0) avisar(`${v.codigo} ${v.color}: según el sistema no hay existencias suficientes. Puede venderlo igual y revisar el conteo después.`);
  texto.value = '';
  entrada.value?.focus();
}

function alEnter() {
  const exacto = buscarExacto(texto.value);
  if (exacto) return agregar(exacto);
  if (resultados.value.length === 1) return agregar(resultados.value[0]);
  if (!resultados.value.length && texto.value.trim()) avisar('No se encontró ese producto. Pruebe con otra parte del nombre o del código.');
}

function cambiarCantidad(l, d) {
  l.cantidad = Math.max(1, l.cantidad + d);
}
function quitar(l) {
  void registrarActividad('linea_quitada', `Quitó ${l.cantidad} × ${l.codigo} ${l.color} (${formatearColones(l.precio * l.cantidad)}) del tiquete antes de cobrar`);
  carrito.value = carrito.value.filter((x) => x !== l);
  entrada.value?.focus();
}
async function vaciar() {
  if (carrito.value.length && await confirmar('¿Vaciar el tiquete?')) {
    void registrarActividad('tiquete_vaciado', `Vació el tiquete sin cobrar: ${carrito.value.reduce((a, l) => a + l.cantidad, 0)} par(es), ${formatearColones(total.value)}`);
    carrito.value = [];
  }
  entrada.value?.focus();
}

// ---- Cobro
const cobrando = ref(false);
const pagos = ref([]);
const errorCobro = ref('');
const guardando = ref(false);
const MEDIOS = [
  ['efectivo', 'Efectivo', Banknote],
  ['tarjeta', 'Tarjeta', CreditCard],
  ['sinpe', 'SINPE Móvil', Smartphone],
  ['transferencia', 'Transferencia', Landmark],
];
// Qué tiene que hacer la persona según cómo paga el cliente (en palabras sencillas).
const INSTRUCCION = {
  efectivo: ['Cobre en efectivo', ['Reciba el dinero del cliente.', 'Escriba cuánto le dieron (o toque el billete).', 'Dé el VUELTO que le indica el sistema y entregue el tiquete.']],
  tarjeta: ['Cobre en el datáfono', ['Cobre el monto en el datáfono.', 'Si el datáfono dice APROBADO, toque CONFIRMAR COBRO.', 'Si lo RECHAZÓ, NO confirme: pida otra forma de pago.']],
  sinpe: ['Cobro por SINPE Móvil', ['Pídale al cliente que haga el SINPE por el monto exacto.', 'Revise en SU celular que el dinero YA LLEGÓ.', 'Solo entonces toque CONFIRMAR COBRO.']],
  transferencia: ['Cobro por transferencia', ['Pídale al cliente que haga la transferencia por el monto exacto.', 'Revise que el dinero YA LLEGÓ a la cuenta.', 'Solo entonces toque CONFIRMAR COBRO.']],
};
const dividido = ref(false);
function elegirMedio(m) {
  const p = pagos.value[0];
  p.medio = m;
  p.recibido = '';
  p.referencia = '';
}
const pagado = computed(() => Math.round(pagos.value.reduce((a, p) => a + (Number(p.monto) || 0), 0) * 100) / 100);
const faltante = computed(() => Math.round((total.value - pagado.value) * 100) / 100);
const vuelto = computed(() => pagos.value.filter((p) => p.medio === 'efectivo' && p.recibido !== '' && p.recibido !== null).reduce((a, p) => a + Math.max(0, Number(p.recibido) - Number(p.monto)), 0));

function abrirCobro() {
  if (!carrito.value.length) return;
  if (!pos.caja) {
    panel.value = 'caja';
    return;
  }
  errorCobro.value = '';
  pagos.value = [{ medio: 'efectivo', monto: total.value, referencia: '', recibido: '' }];
  dividido.value = false;
  cobrando.value = true;
}
function agregarPago(medio) {
  pagos.value.push({ medio, monto: Math.max(0, faltante.value), referencia: '', recibido: '' });
}
function quitarPago(i) {
  pagos.value.splice(i, 1);
}
function billete(p, v) {
  p.recibido = v;
}
const RAPIDOS = [1000, 2000, 5000, 10000, 20000, 50000];

async function confirmarCobro() {
  errorCobro.value = '';
  for (const p of pagos.value) {
    if (!(Number(p.monto) > 0)) return (errorCobro.value = 'Cada forma de pago debe tener un monto.');
    if (p.medio === 'efectivo' && p.recibido !== '' && Number(p.recibido) < Number(p.monto)) return (errorCobro.value = 'El efectivo recibido es menor que el monto.');
  }
  if (Math.abs(faltante.value) > 0.001) return (errorCobro.value = faltante.value > 0 ? `Faltan ${formatearColones(faltante.value)}.` : `Los pagos se pasan por ${formatearColones(-faltante.value)}.`);
  guardando.value = true;
  try {
    const venta = await cobrar(
      carrito.value,
      pagos.value.map((p) => ({ medio: p.medio, monto: Number(p.monto), referencia: p.referencia, recibido: p.medio === 'efectivo' && p.recibido !== '' ? Number(p.recibido) : undefined })),
      cajero.value,
    );
    carrito.value = [];
    cobrando.value = false;
    ultimaVenta.value = venta;
    if (pos.imprimirAuto) await imprimir(venta);
  } catch (err) {
    errorCobro.value = err instanceof Error ? err.message : 'No se pudo guardar la venta.';
  } finally {
    guardando.value = false;
  }
}

const vueltoVenta = (v) => (v ? v.pagos.filter((p) => p.medio === 'efectivo' && p.recibido !== undefined).reduce((a, p) => a + Math.max(0, p.recibido - p.monto), 0) : 0);
function siguienteVenta() {
  ultimaVenta.value = null;
  entrada.value?.focus();
}

// ---- Tiquete e impresión
// Márgenes del tiquete (mm): cada impresora de rollo corta un poco distinto, así que se ajustan aquí y quedan guardados en esta computadora.
const MARGENES_LADO = [4, 6, 8, 10, 12, 14];
const MARGENES_SUP = [4, 6, 8, 10, 14, 18];
const margenLado = ref(8);
const margenSup = ref(8);
try {
  const g = JSON.parse(localStorage.getItem('cb-tiquete-margenes') ?? 'null');
  if (g?.lado) margenLado.value = Number(g.lado);
  if (g?.sup) margenSup.value = Number(g.sup);
} catch {
  /* sin almacenamiento se usan los márgenes por defecto */
}
watch([margenLado, margenSup], () => {
  document.documentElement.style.setProperty('--tq-lado', `${margenLado.value}mm`);
  document.documentElement.style.setProperty('--tq-sup', `${margenSup.value}mm`);
  try {
    localStorage.setItem('cb-tiquete-margenes', JSON.stringify({ lado: margenLado.value, sup: margenSup.value }));
  } catch {
    /* no pasa nada: se pierde el ajuste al cerrar */
  }
}, { immediate: true });
function imprimirPrueba() {
  imprimir({ id: 'prueba', numero: 0, tiendaCodigo: pos.tienda?.codigo, fecha: new Date().toISOString(), cajero: auth.usuario?.nombre ?? 'Cajero', esPrueba: true, total: 12500, lineas: [{ cantidad: 2, codigo: 'KW000', color: 'Negro', precioUnitario: 5000, subtotal: 10000 }, { cantidad: 1, codigo: 'KW111', color: 'Azul', precioUnitario: 2500, subtotal: 2500 }], pagos: [{ medio: 'efectivo', monto: 12500, recibido: 15000 }] });
}
const ultimaVenta = ref(null);
const ventaImpresion = ref(null);
async function imprimir(venta, copia = false) {
  if (copia) void registrarActividad('tiquete_reimpreso', `Reimprimió el tiquete ${numeroTexto(venta)} por ${formatearColones(venta.total)}`);
  ventaImpresion.value = venta;
  await nextTick();
  document.body.classList.add('imprimiendo-tiquete');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo-tiquete');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
  setTimeout(limpiar, 1500);
}

// ---- Caja
const panel = ref(''); // '', 'caja', 'turno', 'alertas', 'rechazadas'
watch(panel, (p) => {
  if (p !== 'inventario') contando.value = false;
});
const pidiendo = ref(false);
const enCaminoTienda = computed(() => pos.ordenesRecientes.filter((o) => o.puedeRecibir && !recepcionPendiente(o.id)).length);
const fondo = ref('');
const contado = ref('');
const notasCaja = ref('');
const errorCaja = ref('');
async function hacerAbrirCaja() {
  errorCaja.value = '';
  try {
    await abrirCaja(Number(fondo.value || 0), cajero.value);
    fondo.value = '';
    panel.value = '';
    entrada.value?.focus();
  } catch (err) {
    errorCaja.value = err instanceof Error ? err.message : 'No se pudo abrir la caja.';
  }
}
const cierreHecho = ref(null);
async function hacerCerrarCaja() {
  errorCaja.value = '';
  if (contado.value === '') return (errorCaja.value = 'Cuente el efectivo de la gaveta e indíquelo.');
  if (carrito.value.length && !await confirmar('Hay un tiquete sin cobrar que se perderá. ¿Cerrar la caja de todos modos?')) return;
  try {
    carrito.value = [];
    cierreHecho.value = await cerrarCaja(Number(contado.value), notasCaja.value);
    contado.value = '';
    notasCaja.value = '';
  } catch (err) {
    errorCaja.value = err instanceof Error ? err.message : 'No se pudo cerrar la caja.';
  }
}
const turno = computed(() => resumenTurno());
const ventasTurno = computed(() => [...pos.ventas].filter((v) => pos.caja && v.cajaId === pos.caja.id).reverse());
const ETIQUETA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE', transferencia: 'Transferencia' };

// ---- Avisos grandes: lo que la persona debe saber o hacer ahora (los más importantes primero)
const cajaDeOtroDia = computed(() => pos.caja && new Date(pos.caja.abiertaEn).toDateString() !== new Date().toDateString());
const avisos = computed(() => {
  const a = [];
  if (!pos.enLinea) a.push({ tipo: 'error', icono: CloudOff, titulo: 'No hay internet', texto: 'Puede seguir trabajando con toda normalidad: vender, recibir mercadería y hacer pedidos. Todo se guarda en esta computadora y se envía solo cuando vuelva el internet. No apague la computadora ni borre los datos del navegador.' });
  if (rechazadas.value.length) a.push({ tipo: 'error', icono: TriangleAlert, titulo: `${rechazadas.value.length} venta(s) no se pudieron enviar`, texto: 'Avise a la administración. Las ventas siguen guardadas en esta computadora.', accion: { texto: 'VER CUÁLES', fn: () => (panel.value = 'rechazadas') } });
  if (recepcionesRechazadas.value.length) a.push({ tipo: 'error', icono: TriangleAlert, titulo: `${recepcionesRechazadas.value.length} recepción(es) de mercadería no se pudieron enviar`, texto: `${recepcionesRechazadas.value[0].error} Avise a la administración.`, accion: { texto: 'REINTENTAR', fn: () => void reintentarRecepciones() } });
  if (faltaConfirmar.value) a.push({ tipo: 'aviso', icono: KeyRound, titulo: 'Confirme su contraseña', texto: 'Ya hay internet. Escriba su contraseña para enviar al sistema lo que se hizo sin conexión.', accion: { texto: 'ESCRIBIR CONTRASEÑA', fn: () => (mostrarReauth.value = true) } });
  if (!pos.enLinea && porEnviarTotal.value > 0 && desdeUltimoRespaldo() > 2 * 3_600_000) a.push({ tipo: 'aviso', icono: Download, titulo: 'Guarde un respaldo', texto: `Hay ${porEnviarTotal.value} registro(s) sin enviar guardados solo en esta computadora. Si borran los datos del navegador se perderían.`, accion: { texto: 'GUARDAR RESPALDO', fn: () => void guardarRespaldo() } });
  if (ajustesRechazados.value.length) a.push({ tipo: 'error', icono: TriangleAlert, titulo: 'Un conteo de inventario no se pudo enviar', texto: `${ajustesRechazados.value[0].error} Avise a la administración.`, accion: { texto: 'REINTENTAR', fn: () => void reintentarAjustes() } });
  if (ajustesPorEnviar.value.length) a.push({ tipo: 'info', icono: RefreshCw, titulo: `${ajustesPorEnviar.value.length} conteo(s) de inventario por enviar`, texto: 'Ya cuentan en el inventario de la tienda. Se enviarán solos cuando haya internet.' });
  if (recepcionesPorEnviar.value.length) a.push({ tipo: 'info', icono: RefreshCw, titulo: `${recepcionesPorEnviar.value.length} recepción(es) de mercadería por enviar`, texto: 'La mercadería ya cuenta en el inventario de la tienda. Se enviará sola cuando haya internet.' });
  if (pos.tienda && !pos.caja) a.push({ tipo: 'aviso', icono: Wallet, titulo: 'La caja está cerrada', texto: 'Para poder vender, primero abra la caja: cuente el efectivo con que empieza y escríbalo.', accion: { texto: 'ABRIR CAJA', fn: () => (panel.value = 'caja') } });
  if (cajaDeOtroDia.value) a.push({ tipo: 'aviso', icono: Wallet, titulo: 'La caja se abrió otro día', texto: 'Cuente el efectivo y cierre la caja; después ábrala de nuevo para empezar el día ordenado.', accion: { texto: 'CERRAR CAJA', fn: () => (panel.value = 'caja') } });
  if (enCaminoTienda.value) a.push({ tipo: 'info', icono: Truck, titulo: 'Viene mercadería en camino', texto: 'Cuando llegue, cuente lo que trae y compárelo con la orden. Si todo está bien, toque ACEPTAR. Si falta algo, anótelo.', accion: { texto: 'VER ENVÍO', fn: () => (pidiendo.value = true) } });
  if (sugerenciasPedido.value.length) a.push({ tipo: 'aviso', icono: PackagePlus, titulo: 'Se está acabando la mercadería', texto: `Hay ${sugerenciasPedido.value.length} producto(s) agotados o por acabarse. Haga el pedido para que no se quede sin vender.`, accion: { texto: 'PEDIR MERCADERÍA', fn: () => (pidiendo.value = true) } });
  if (pos.enLinea && pendientes.value.length) a.push({ tipo: 'info', icono: RefreshCw, titulo: `${pendientes.value.length} venta(s) por enviar`, texto: 'Se están enviando solas. No cierre la sesión hasta que este aviso desaparezca.', accion: { texto: 'ENVIAR AHORA', fn: () => sincronizar() } });
  return a;
});
const ESTILO_AVISO = {
  error: 'border-red-800 bg-red-700 text-white',
  aviso: 'border-amber-600 bg-amber-500 text-slate-900',
  info: 'border-blue-800 bg-blue-700 text-white',
};
const ESTILO_BOTON_AVISO = { error: 'bg-white text-red-800 hover:bg-red-50', aviso: 'bg-slate-900 text-white hover:bg-black', info: 'bg-white text-blue-800 hover:bg-blue-50' };

// ---- Salir
function salir() {
  if (auth.esAdministracion) router.push({ name: 'admin-home' });
  else {
    auth.logout();
    router.push({ name: 'login' });
  }
}
async function elegir(t) {
  await elegirTienda(t);
}
async function cambiar() {
  try {
    if (!await confirmar('¿Cambiar la tienda de esta terminal?')) return;
    await cambiarTienda();
    cargarTiendas();
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo cambiar la tienda.');
  }
}

// ---- Teclado: F2 buscar, F12 cobrar, Esc cierra
function teclas(e) {
  if (e.key === 'F2') {
    e.preventDefault();
    entrada.value?.focus();
  } else if (e.key === 'F12') {
    e.preventDefault();
    if (!cobrando.value) abrirCobro();
    else confirmarCobro();
  } else if (e.key === 'Escape') {
    if (cobrando.value) cobrando.value = false;
    else if (panel.value) panel.value = '';
    else if (pidiendo.value) pidiendo.value = false;
  }
}

onMounted(async () => {
  await iniciarPos();
  // El encargado de tienda entra directo a la caja de SU tienda (la que tiene asignada en Control de accesos).
  const asignada = auth.tiendaAsignada;
  if (auth.esEncargadoTienda) {
    if (!asignada) errorTienda.value = 'Su cuenta no tiene una tienda asignada. Pídale al administrador que se la asigne en Control de accesos.';
    else if (pos.tienda?.id !== asignada.id) await elegirTienda(asignada);
  } else if (!pos.tienda) cargarTiendas();
  window.addEventListener('keydown', teclas);
  entrada.value?.focus();
});
onBeforeUnmount(() => {
  detenerPos();
  window.removeEventListener('keydown', teclas);
});
watch(
  () => [pos.tienda, pos.caja],
  async () => {
    await nextTick();
    entrada.value?.focus();
  },
);
</script>
<template>
  <div class="fixed inset-0 z-40 flex flex-col bg-slate-50 text-slate-900">
    <!-- Barra superior: igual que el resto del sistema (logo, nombre, estado y salida) -->
    <header class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
      <img :src="logoMenu" alt="" class="size-11 shrink-0 object-contain" />
      <div class="leading-tight">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Conejo Blanco · Punto de venta</p>
        <p class="text-2xl font-bold text-slate-900">{{ pos.tienda?.nombre ?? 'Caja' }}</p>
      </div>
      <div v-if="pos.tienda" class="ml-2 flex flex-wrap items-center gap-2">
        <span class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold" :class="pos.caja ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"><Wallet class="size-4" /> {{ pos.caja ? 'CAJA ABIERTA' : 'CAJA CERRADA' }}</span>
        <span class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold" :class="pos.enLinea ? 'bg-green-100 text-green-800' : 'bg-red-600 text-white'"><component :is="pos.enLinea ? Cloud : CloudOff" class="size-4" /> {{ pos.enLinea ? 'Con internet' : 'SIN INTERNET' }}</span>
        <button v-if="auth.esSistema" type="button" class="flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold transition disabled:opacity-60" :class="pos.catalogo?.modoPrueba ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" :disabled="cambiandoPrueba || !pos.enLinea" title="Solo el administrador del sistema: muestra u oculta los productos de prueba" @click="alternarModoPrueba"><FlaskConical class="size-4" /> Modo de prueba: {{ pos.catalogo?.modoPrueba ? 'ENCENDIDO' : 'apagado' }}</button>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <CambiarVista />
        <CambiarTema />
        <div class="text-right leading-tight">
          <p class="text-sm font-semibold text-slate-900">{{ auth.usuario?.nombre }}</p>
          <p class="text-xs text-slate-500">{{ ETIQUETA_ROL[auth.usuario?.rol] ?? auth.usuario?.rol }}</p>
        </div>
        <router-link :to="{ name: 'cambiar-clave' }" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cambiar contraseña" title="Cambiar contraseña"><KeyRound class="size-5" /></router-link>
        <button type="button" class="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900" @click="salir"><LogOut class="size-4" /> {{ auth.esAdministracion ? 'Volver al panel' : 'Salir' }}</button>
      </div>
    </header>

    <!-- Acciones principales: botones grandes con ícono y nombre -->
    <nav v-if="pos.tienda" class="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:grid-cols-5">
      <button type="button" class="relative flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 text-base font-bold transition" :class="pos.caja ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100' : 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700'" @click="panel = 'caja'"><Wallet class="size-5" /> {{ pos.caja ? 'Cerrar caja' : 'Abrir caja' }}</button>
      <button type="button" class="relative flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-bold text-slate-800 transition hover:bg-slate-100" @click="pidiendo = true">
        <PackagePlus class="size-5" /> Pedir mercadería
        <span v-if="sugerenciasPedido.length" class="absolute -right-1.5 -top-1.5 flex min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{{ sugerenciasPedido.length }}</span>
        <span v-if="enCaminoTienda" class="absolute -left-1.5 -top-1.5 flex items-center gap-1 rounded-full bg-indigo-600 px-2 text-xs font-bold text-white"><Truck class="size-3" /> {{ enCaminoTienda }} en camino</span>
      </button>
      <button type="button" class="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-bold text-slate-800 transition hover:bg-slate-100" @click="panel = 'turno'"><Receipt class="size-5" /> Ventas de hoy</button>
      <button type="button" class="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 text-base font-bold transition" :class="alertasLocales.length ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'" @click="panel = 'alertas'"><TriangleAlert class="size-5" /> Se está acabando <span v-if="alertasLocales.length" class="rounded-full bg-red-600 px-2 text-sm text-white">{{ alertasLocales.length }}</span></button>
      <button type="button" class="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-bold text-slate-800 transition hover:bg-slate-100" @click="panel = 'inventario'"><Boxes class="size-5" /> Inventario <span class="rounded-full bg-slate-200 px-2 text-sm text-slate-700">{{ enTienda.length }}</span></button>
    </nav>

    <p v-if="pos.catalogo?.modoPrueba" class="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-base font-extrabold text-white"><TriangleAlert class="size-5" /> MODO DE PRUEBA: los productos marcados PRUEBA son de demostración. No generan asientos ni cuentan en la caja. No los venda a clientes reales.</p>
    <p v-if="pos.error" class="bg-red-100 px-4 py-2 text-center text-base font-semibold text-red-800">{{ pos.error }}</p>
    <p v-if="pos.avisoSync" class="bg-amber-100 px-4 py-2 text-center text-base text-amber-900">{{ pos.avisoSync }}</p>

    <!-- Elegir la tienda (solo gerencia/sistema; el encargado entra directo a la suya) -->
    <main v-if="pos.listo && !pos.tienda && auth.esEncargadoTienda" class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p class="text-2xl font-bold">Preparando su caja…</p>
        <p v-if="errorTienda" class="mt-3 text-lg font-semibold text-red-600">{{ errorTienda }}</p>
        <p v-else class="mt-3 text-lg text-slate-600">Espere unos segundos. Si es la primera vez en esta computadora, necesita internet.</p>
      </div>
    </main>
    <main v-else-if="pos.listo && !pos.tienda" class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p class="text-xl font-bold">¿De qué tienda es esta terminal?</p>
        <p class="mb-3 text-base text-slate-600">Se elige una sola vez (hace falta internet). Después la terminal trabaja sola, también sin conexión.</p>
        <p v-if="errorTienda" class="mb-2 text-base font-medium text-red-600">{{ errorTienda }}</p>
        <button v-for="t in tiendas" :key="t.id" type="button" class="mb-2 w-full rounded-xl border-2 border-slate-300 px-4 py-4 text-left text-lg font-semibold hover:border-blue-500 hover:bg-blue-50" @click="elegir(t)">{{ t.nombre }} <span class="text-base font-normal text-slate-500">({{ t.codigo }})</span></button>
        <p v-if="!tiendas.length && !errorTienda" class="text-base text-slate-500">No hay tiendas activas. Cree una en Bodega → Ubicaciones.</p>
        <button type="button" class="mt-2 text-base text-slate-500 underline" @click="cargarTiendas">Actualizar lista</button>
      </div>
    </main>

    <!-- Pantalla de venta -->
    <main v-else-if="pos.listo" class="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section class="flex min-h-0 flex-col gap-3">
        <!-- Avisos: lo que hay que hacer ahora -->
        <div v-if="avisos.length" class="flex max-h-[38%] flex-col gap-2 overflow-y-auto">
          <div v-for="(a, i) in avisos.slice(0, 3)" :key="i" class="flex flex-wrap items-center gap-3 rounded-2xl border-2 px-4 py-3" :class="ESTILO_AVISO[a.tipo]">
            <component :is="a.icono" class="size-8 shrink-0" />
            <div class="min-w-0 flex-1"><p class="text-lg font-extrabold leading-tight">{{ a.titulo }}</p><p class="text-base leading-snug">{{ a.texto }}</p></div>
            <button v-if="a.accion" type="button" class="rounded-xl px-5 py-3 text-base font-extrabold shadow-sm" :class="ESTILO_BOTON_AVISO[a.tipo]" @click="a.accion.fn()">{{ a.accion.texto }}</button>
          </div>
          <p v-if="avisos.length > 3" class="text-sm font-semibold text-slate-500">y {{ avisos.length - 3 }} aviso(s) más…</p>
        </div>

        <div class="relative">
          <ScanBarcode class="pointer-events-none absolute left-4 top-1/2 size-7 -translate-y-1/2 text-slate-500" />
          <input ref="entrada" v-model="texto" type="text" autocomplete="off" :disabled="!pos.caja" :placeholder="pos.caja ? 'Escanee el producto o escriba su nombre aquí' : 'Primero abra la caja'" class="w-full rounded-2xl border-2 border-slate-300 bg-white py-4 pl-14 pr-4 text-xl outline-none focus:border-blue-500 disabled:bg-slate-100" @keydown.enter.prevent="alEnter" />
        </div>
        <p v-if="aviso" class="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">{{ aviso }}</p>
        <p v-if="!pos.catalogo" class="rounded-xl bg-slate-200 px-4 py-3 text-base text-slate-700">Descargando los productos de la tienda… (se necesita internet la primera vez)</p>
        <div v-else-if="!pos.catalogo.variantes.some(esVendible)" class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">
          <span>{{ enTienda.length ? `Hay ${enTienda.length} producto(s) en la tienda, pero ninguno tiene precio de tienda todavía: no se pueden vender.` : 'Todavía no hay productos con precio de tienda.' }} Avise a la administración para que los configure.</span>
          <button v-if="auth.esAdministracion" type="button" class="rounded-xl bg-amber-600 px-4 py-2 text-base font-extrabold text-white hover:bg-amber-700" @click="irAPrecios">Poner precios</button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <ul v-if="resultados.length" class="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <li v-for="v in resultados" :key="v.varianteId">
              <button type="button" class="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-blue-500 hover:bg-blue-50" :class="esVendible(v) ? '' : 'opacity-70'" @click="agregar(v)">
                <span class="min-w-0"><span class="flex items-center gap-2 truncate text-lg font-bold">{{ v.codigo }} · {{ v.color }}<span v-if="v.prueba" class="rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">PRUEBA</span></span><span class="block truncate text-sm text-slate-500">{{ v.nombre }}</span></span>
                <span class="text-right"><span v-if="esVendible(v)" class="block text-xl font-extrabold">{{ formatearColones(v.precio) }}</span><span v-else class="block rounded-lg bg-slate-200 px-2 py-0.5 text-sm font-bold text-slate-700">SIN PRECIO DE TIENDA</span><span class="block text-sm" :class="stockDe(v.varianteId) <= 0 ? 'font-bold text-red-600' : stockDe(v.varianteId) <= v.minimo ? 'font-bold text-amber-600' : 'text-slate-500'">{{ stockDe(v.varianteId) <= 0 ? 'SIN EXISTENCIAS' : `${stockDe(v.varianteId)} en tienda` }}</span></span>
              </button>
            </li>
          </ul>

          <!-- Venta terminada: qué entregar -->
          <div v-else-if="ultimaVenta" class="rounded-3xl border-2 border-green-400 bg-green-50 p-6 text-center">
            <CircleCheck class="mx-auto size-14 text-green-600" />
            <p class="mt-1 text-3xl font-extrabold text-green-800">VENTA REGISTRADA</p>
            <p class="text-lg text-green-900">Tiquete {{ numeroTexto(ultimaVenta) }} · {{ formatearColones(ultimaVenta.total) }}<span v-if="ultimaVenta.esPrueba" class="ml-2 rounded-full bg-amber-500 px-2 text-sm font-extrabold text-white">DE PRUEBA</span></p>
            <div v-if="vueltoVenta(ultimaVenta) > 0" class="mx-auto mt-3 max-w-md rounded-2xl bg-white px-6 py-4 shadow-sm">
              <p class="text-lg font-bold text-slate-700">ENTREGUE EL VUELTO</p>
              <p class="text-5xl font-extrabold text-green-700">{{ formatearColones(vueltoVenta(ultimaVenta)) }}</p>
            </div>
            <p class="mt-3 text-lg font-semibold text-green-900">Entregue el tiquete al cliente.</p>
            <p class="text-sm text-green-800">{{ ultimaVenta.enviada ? 'Ya está guardada en el sistema.' : pos.enLinea ? 'Enviándola al sistema…' : 'Quedó guardada en esta computadora; se enviará cuando haya internet.' }}</p>
            <div class="mt-4 flex flex-wrap justify-center gap-3">
              <button type="button" class="rounded-2xl bg-green-600 px-8 py-4 text-xl font-extrabold text-white shadow-sm hover:bg-green-700" @click="siguienteVenta">SIGUIENTE VENTA</button>
              <button type="button" class="flex items-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-base font-bold text-slate-800 hover:bg-slate-100" @click="imprimir(ultimaVenta, true)"><Printer class="size-5" /> Imprimir otra copia</button>
            </div>
          </div>

          <!-- Cómo vender -->
          <div v-else-if="pos.caja && !carrito.length && pos.catalogo?.variantes.some(esVendible)" class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p class="text-2xl font-extrabold text-slate-900">Cómo hacer una venta</p>
            <ol class="mt-4 grid gap-3 sm:grid-cols-2">
              <li class="flex items-start gap-3 rounded-2xl bg-blue-50 p-4"><span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-extrabold text-white">1</span><span class="text-lg"><b>Escanee</b> el código de barras del producto. Si no lee, escriba el nombre arriba y toque el producto.</span></li>
              <li class="flex items-start gap-3 rounded-2xl bg-blue-50 p-4"><span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-extrabold text-white">2</span><span class="text-lg"><b>Revise</b> a la derecha que los productos y el total estén bien.</span></li>
              <li class="flex items-start gap-3 rounded-2xl bg-blue-50 p-4"><span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-extrabold text-white">3</span><span class="text-lg">Toque el botón verde <b>COBRAR</b> y elija cómo paga el cliente.</span></li>
              <li class="flex items-start gap-3 rounded-2xl bg-blue-50 p-4"><span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-extrabold text-white">4</span><span class="text-lg">Entregue el <b>vuelto</b> y el <b>tiquete</b>. ¡Listo!</span></li>
            </ol>
            <p class="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900"><Info class="mr-1 inline size-5" /> Al terminar su turno <b>cierre la caja</b> (botón «Cerrar caja» arriba): cuente el dinero y escríbalo.</p>
          </div>
        </div>
      </section>

      <!-- Tiquete en curso -->
      <aside class="flex min-h-0 flex-col rounded-3xl border-2 border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p class="text-lg font-extrabold">Tiquete <span class="text-base font-semibold text-slate-500">({{ pares }} {{ pares === 1 ? 'par' : 'pares' }})</span></p>
          <button v-if="carrito.length" type="button" class="rounded-lg px-3 py-1.5 text-base font-semibold text-red-600 hover:bg-red-50" @click="vaciar">Borrar todo</button>
        </div>
        <ul class="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          <li v-for="l in carrito" :key="l.varianteId" class="flex items-center gap-2 px-4 py-3">
            <div class="min-w-0 flex-1"><p class="truncate text-base font-bold">{{ l.codigo }} · {{ l.color }}<span v-if="l.prueba" class="ml-2 rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">PRUEBA</span></p><p class="text-sm text-slate-500">{{ formatearColones(l.precio) }} cada par</p></div>
            <div class="flex items-center gap-1">
              <button type="button" class="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-100" aria-label="Menos" @click="cambiarCantidad(l, -1)"><Minus class="size-5" /></button>
              <span class="w-10 text-center text-xl font-extrabold">{{ l.cantidad }}</span>
              <button type="button" class="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-100" aria-label="Más" @click="cambiarCantidad(l, 1)"><Plus class="size-5" /></button>
            </div>
            <p class="w-24 text-right text-base font-extrabold">{{ formatearColones(l.precio * l.cantidad) }}</p>
            <button type="button" class="p-1.5 text-slate-500 hover:text-red-600" aria-label="Quitar" @click="quitar(l)"><Trash2 class="size-5" /></button>
          </li>
          <li v-if="!carrito.length" class="px-4 py-10 text-center text-lg text-slate-500">Aquí aparecen los productos que escanee.</li>
        </ul>
        <div class="border-t-2 border-slate-200 p-4">
          <p class="flex items-baseline justify-between"><span class="text-xl font-bold text-slate-600">TOTAL</span><span class="text-4xl font-extrabold text-slate-900">{{ formatearColones(total) }}</span></p>
          <button type="button" class="mt-3 w-full rounded-2xl py-5 text-2xl font-extrabold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300" :class="pos.caja ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'" :disabled="!!pos.caja && !carrito.length" @click="abrirCobro">{{ !pos.caja ? 'ABRIR LA CAJA PRIMERO' : carrito.length ? `COBRAR ${formatearColones(total)}` : 'COBRAR' }}</button>
          <p class="mt-1 text-center text-xs text-slate-500">Atajos: F2 buscar · F12 cobrar</p>
        </div>
      </aside>
    </main>

    <!-- Cobro -->
    <div v-if="cobrando" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3">
      <div class="flex max-h-full w-full max-w-2xl flex-col rounded-3xl bg-white shadow-xl">
        <div class="min-h-0 flex-1 overflow-y-auto p-6 pb-3">
        <div class="flex items-start justify-between"><p class="text-xl font-bold text-slate-600">COBRAR</p><button type="button" class="rounded-lg p-1 hover:bg-slate-100" aria-label="Cerrar" @click="cobrando = false"><X class="size-6" /></button></div>
        <p class="text-6xl font-extrabold text-slate-900">{{ formatearColones(total) }}</p>
        <div v-if="!dividido && pagos[0].medio === 'efectivo' && pagos[0].recibido !== '' && Number(pagos[0].recibido) >= Number(pagos[0].monto)" class="mt-2 flex items-center justify-between rounded-2xl bg-green-100 px-5 py-3">
          <p class="text-xl font-extrabold text-green-900">DÉ DE VUELTO</p>
          <p class="text-5xl font-extrabold text-green-700">{{ formatearColones(Number(pagos[0].recibido) - Number(pagos[0].monto)) }}</p>
        </div>

        <template v-if="!dividido">
          <p class="mt-4 text-lg font-bold">¿Cómo paga el cliente?</p>
          <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button v-for="m in MEDIOS" :key="m[0]" type="button" class="flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-4 text-base font-extrabold transition" :class="pagos[0].medio === m[0] ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="elegirMedio(m[0])"><component :is="m[2]" class="size-8" /> {{ m[1] }}</button>
          </div>
          <div class="mt-4 rounded-2xl bg-blue-600 p-4 text-white">
            <p class="text-lg font-extrabold">{{ INSTRUCCION[pagos[0].medio][0] }}</p>
            <ol class="mt-1 list-decimal space-y-0.5 pl-6 text-base"><li v-for="(paso, i) in INSTRUCCION[pagos[0].medio][1]" :key="i">{{ paso }}</li></ol>
          </div>
          <template v-if="pagos[0].medio === 'efectivo'">
            <p class="mt-4 text-lg font-bold">¿Cuánto dinero le dieron?</p>
            <input v-model="pagos[0].recibido" type="number" min="0" step="1" placeholder="Escriba el monto" class="mt-1 w-full rounded-2xl border-2 border-slate-300 px-4 py-4 text-3xl font-extrabold outline-none focus:border-blue-500" aria-label="Efectivo recibido" />
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="rounded-xl border-2 border-slate-300 px-4 py-2.5 text-base font-bold hover:bg-slate-100" @click="billete(pagos[0], pagos[0].monto)">Exacto</button>
              <button v-for="b in RAPIDOS" :key="b" type="button" class="rounded-xl border-2 border-slate-300 px-4 py-2.5 text-base font-bold hover:bg-slate-100" @click="billete(pagos[0], b)">{{ formatearColones(b).replace(',00', '') }}</button>
            </div>
            <p v-if="pagos[0].recibido !== '' && Number(pagos[0].recibido) < Number(pagos[0].monto)" class="mt-3 rounded-2xl bg-red-100 px-5 py-3 text-lg font-bold text-red-700">Lo que le dieron NO alcanza: faltan {{ formatearColones(Number(pagos[0].monto) - Number(pagos[0].recibido)) }}.</p>
          </template>
          <input v-else v-model="pagos[0].referencia" type="text" maxlength="60" :placeholder="pagos[0].medio === 'tarjeta' ? 'Número del voucher (opcional)' : 'Número de comprobante (opcional)'" class="mt-4 w-full rounded-2xl border-2 border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-500" />
          <button type="button" class="mt-3 text-base font-semibold text-slate-500 underline" @click="dividido = true">El cliente paga con dos formas de pago (dividir)</button>
        </template>

        <template v-else>
          <p class="mt-4 text-lg font-bold">Pago dividido: agregue cada forma de pago hasta cubrir el total.</p>
          <div v-for="(p, i) in pagos" :key="i" class="mt-3 rounded-2xl border-2 border-slate-200 p-3">
            <div class="flex items-center gap-2">
              <select v-model="p.medio" class="input !w-auto"><option v-for="m in MEDIOS" :key="m[0]" :value="m[0]">{{ m[1] }}</option></select>
              <input v-model="p.monto" type="number" min="0" step="0.01" class="input" aria-label="Monto" />
              <button v-if="pagos.length > 1" type="button" class="p-1 text-slate-500 hover:text-red-600" aria-label="Quitar pago" @click="quitarPago(i)"><Trash2 class="size-5" /></button>
            </div>
            <input v-if="p.medio === 'efectivo'" v-model="p.recibido" type="number" min="0" step="1" placeholder="Efectivo que le dieron" class="input mt-2" aria-label="Efectivo recibido" />
            <input v-else v-model="p.referencia" type="text" maxlength="60" placeholder="Voucher o comprobante (opcional)" class="input mt-2" />
            <p v-if="p.medio === 'efectivo' && p.recibido !== '' && Number(p.recibido) >= Number(p.monto)" class="mt-1 text-lg font-bold text-green-700">Vuelto: {{ formatearColones(Number(p.recibido) - Number(p.monto)) }}</p>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2"><span class="text-base text-slate-500">Agregar:</span><button v-for="m in MEDIOS" :key="m[0]" type="button" class="rounded-xl border-2 border-slate-300 px-3 py-1.5 text-base font-semibold hover:bg-slate-100" @click="agregarPago(m[0])">+ {{ m[1] }}</button></div>
          <p class="mt-2 text-lg font-bold" :class="Math.abs(faltante) < 0.005 ? 'text-green-700' : 'text-amber-700'">{{ Math.abs(faltante) < 0.005 ? 'El pago cubre el total.' : faltante > 0 ? `Todavía faltan ${formatearColones(faltante)}` : `Se pasa por ${formatearColones(-faltante)}` }}</p>
          <button type="button" class="mt-1 text-base font-semibold text-slate-500 underline" @click="dividido = false; pagos = [{ medio: 'efectivo', monto: total, referencia: '', recibido: '' }]">Volver a una sola forma de pago</button>
        </template>

        <label class="mt-3 flex items-center gap-2 text-base"><input type="checkbox" class="size-5" :checked="pos.imprimirAuto" @change="guardarImprimirAuto($event.target.checked)" /> Imprimir el tiquete al cobrar</label>
        </div>
        <div class="shrink-0 rounded-b-3xl border-t border-slate-200 bg-white px-6 pb-4 pt-3">
          <p v-if="errorCobro" class="mb-2 rounded-xl bg-red-100 px-4 py-3 text-lg font-bold text-red-700">{{ errorCobro }}</p>
          <button type="button" class="w-full rounded-2xl bg-green-600 py-5 text-2xl font-extrabold text-white shadow-sm hover:bg-green-700 disabled:bg-slate-300" :disabled="guardando" @click="confirmarCobro">{{ guardando ? 'Guardando…' : 'CONFIRMAR COBRO (F12)' }}</button>
          <button type="button" class="mt-1 w-full py-1.5 text-base font-semibold text-slate-500 hover:text-slate-800" @click="cobrando = false">Volver al tiquete</button>
        </div>
      </div>
    </div>

    <!-- Confirmar la contraseña con internet -->
    <div v-if="mostrarReauth" class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3" @click.self="mostrarReauth = false">
      <form class="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" @submit.prevent="confirmarClave">
        <p class="text-2xl font-extrabold text-slate-900">Confirme su contraseña</p>
        <p class="mt-1 text-base text-slate-600">Entró sin internet. Escriba su contraseña de siempre para enviar al sistema lo que se hizo.</p>
        <CampoClave v-model="claveReauth" autocomplete="current-password" class="mt-3" input-class="!min-h-14 text-xl" placeholder="Contraseña" required />
        <p v-if="errorReauth" class="mt-2 rounded-xl bg-red-100 px-4 py-3 text-base font-bold text-red-700">{{ errorReauth }}</p>
        <button type="submit" class="mt-3 w-full rounded-2xl bg-blue-600 py-4 text-xl font-extrabold text-white hover:bg-blue-700 disabled:bg-slate-300" :disabled="reautenticando">{{ reautenticando ? 'Confirmando…' : 'CONFIRMAR' }}</button>
        <button type="button" class="mt-2 w-full py-2 text-base font-semibold text-slate-500 hover:text-slate-800" @click="mostrarReauth = false">Ahora no</button>
      </form>
    </div>

    <!-- Paneles -->
    <div v-if="panel" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3" @click.self="panel = ''; cierreHecho = null">
      <div class="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
        <div class="mb-4 flex items-start justify-between">
          <p class="text-2xl font-extrabold text-slate-900">{{ { caja: cierreHecho ? 'Caja cerrada' : pos.caja ? 'Cerrar la caja' : 'Abrir la caja', turno: 'Ventas de hoy', alertas: 'Se está acabando', inventario: 'Inventario de la tienda', rechazadas: 'Ventas que no se pudieron enviar' }[panel] }}</p>
          <button type="button" class="rounded-lg p-1 hover:bg-slate-100" aria-label="Cerrar" @click="panel = ''; cierreHecho = null"><X class="size-6" /></button>
        </div>

        <template v-if="panel === 'caja'">
          <template v-if="!pos.caja && !cierreHecho">
            <ol class="list-decimal space-y-1 rounded-2xl bg-blue-600 p-4 pl-9 text-lg text-white"><li>Abra la gaveta y <b>cuente</b> el efectivo con que empieza el día.</li><li>Escriba ese monto aquí abajo.</li><li>Toque <b>ABRIR CAJA</b>.</li></ol>
            <p class="mt-4 text-lg font-bold">¿Con cuánto efectivo empieza?</p>
            <input v-model="fondo" type="number" min="0" step="1" placeholder="₡ Escriba el monto (si empieza sin dinero, escriba 0)" class="mt-1 w-full rounded-2xl border-2 border-slate-300 px-4 py-4 text-3xl font-extrabold outline-none focus:border-blue-500" />
            <p v-if="errorCaja" class="mt-2 rounded-xl bg-red-100 px-4 py-3 text-lg font-bold text-red-700">{{ errorCaja }}</p>
            <button type="button" class="mt-4 w-full rounded-2xl bg-blue-600 py-5 text-2xl font-extrabold text-white shadow-sm hover:bg-blue-700" @click="hacerAbrirCaja">ABRIR CAJA</button>
          </template>
          <template v-else-if="pos.caja">
            <div class="mb-4 rounded-2xl bg-slate-100 p-4 text-lg">
              <p>Abierta desde <b>{{ formatearFechaHora(pos.caja.abiertaEn) }}</b> con {{ formatearColones(pos.caja.fondoInicial) }}</p>
              <p><b>{{ turno.ventas }}</b> venta(s) por <b>{{ formatearColones(turno.total) }}</b></p>
              <p v-for="(m, k) in turno.porMedio" :key="k" class="text-base text-slate-600">{{ ETIQUETA[k] ?? k }}: {{ formatearColones(m) }}</p>
            </div>
            <ol class="list-decimal space-y-1 rounded-2xl bg-blue-600 p-4 pl-9 text-lg text-white"><li>Abra la gaveta y <b>cuente TODO el efectivo</b> que hay (incluya el que tenía al empezar).</li><li>Escriba el monto aquí abajo.</li><li>Toque <b>CERRAR CAJA</b>. El sistema compara con lo que vendió.</li></ol>
            <p class="mt-4 text-lg font-bold">¿Cuánto efectivo hay en la gaveta?</p>
            <input v-model="contado" type="number" min="0" step="1" placeholder="₡ Escriba lo que contó" class="mt-1 w-full rounded-2xl border-2 border-slate-300 px-4 py-4 text-3xl font-extrabold outline-none focus:border-blue-500" />
            <input v-model="notasCaja" type="text" maxlength="300" placeholder="Nota (si algo no cuadra, explíquelo aquí)" class="mt-2 w-full rounded-2xl border-2 border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-500" />
            <p v-if="errorCaja" class="mt-2 rounded-xl bg-red-100 px-4 py-3 text-lg font-bold text-red-700">{{ errorCaja }}</p>
            <button type="button" class="mt-4 w-full rounded-2xl bg-red-600 py-5 text-2xl font-extrabold text-white shadow-sm hover:bg-red-700" @click="hacerCerrarCaja">CERRAR CAJA</button>
          </template>
          <template v-else-if="cierreHecho">
            <div class="rounded-2xl p-5 text-center" :class="cierreHecho.diferencia === 0 ? 'bg-green-100' : 'bg-amber-100'">
              <p class="text-3xl font-extrabold" :class="cierreHecho.diferencia === 0 ? 'text-green-800' : 'text-amber-800'">{{ cierreHecho.diferencia === 0 ? 'La caja cuadra exacto' : cierreHecho.diferencia < 0 ? `Faltan ${formatearColones(-cierreHecho.diferencia)}` : `Sobran ${formatearColones(cierreHecho.diferencia)}` }}</p>
              <p class="mt-1 text-lg text-slate-700">Debía haber {{ formatearColones(cierreHecho.efectivoEsperado) }} · usted contó {{ formatearColones(cierreHecho.efectivoContado) }}</p>
              <p v-if="cierreHecho.diferencia !== 0" class="mt-2 text-base font-semibold text-amber-900">La administración verá esta diferencia. Si sabe por qué pasó, avísele.</p>
            </div>
            <button type="button" class="mt-4 w-full rounded-2xl bg-slate-800 py-4 text-xl font-extrabold text-white hover:bg-slate-900" @click="panel = ''; cierreHecho = null">LISTO</button>
          </template>
        </template>

        <template v-else-if="panel === 'turno'">
          <details class="mb-4 rounded-2xl border-2 border-slate-200 p-4">
            <summary class="cursor-pointer text-lg font-extrabold text-slate-900">Respaldo de seguridad</summary>
            <p class="mt-1 text-sm text-slate-500">Lo que todavía no se envió al sistema vive solo en esta computadora. <b>No borre los datos del navegador</b>: si lo hace, eso se pierde. Guarde un respaldo (queda en Descargas); si algún día se borran los datos, entre de nuevo con internet, elija la tienda y restaure el respaldo.</p>
            <p class="mt-1 text-sm font-semibold" :class="porEnviarTotal ? 'text-amber-600' : 'text-green-600'">{{ porEnviarTotal ? `Sin enviar al sistema: ${porEnviarTotal} registro(s).` : 'Todo lo hecho ya está en el sistema.' }}</p>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <button type="button" class="flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100" @click="guardarRespaldo"><Download class="size-5" /> Guardar respaldo</button>
              <label class="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100">Restaurar respaldo<input type="file" accept="application/json,.json" class="hidden" @change="alElegirRespaldo" /></label>
            </div>
            <p v-if="restauradoMsg" class="mt-2 text-sm font-semibold text-slate-700">{{ restauradoMsg }}</p>
          </details>
          <details class="mb-4 rounded-2xl border-2 border-slate-200 p-4">
            <summary class="cursor-pointer text-lg font-extrabold text-slate-900">Márgenes del tiquete</summary>
            <p class="mt-1 text-sm text-slate-500">Si al imprimir se corta el nombre de arriba o las primeras letras de los lados, aumente el margen y pruebe de nuevo.</p>
            <div class="mt-2 grid grid-cols-2 gap-3">
              <label class="flex flex-col text-sm font-semibold text-slate-600">Margen de los lados<select v-model.number="margenLado" class="input mt-1"><option v-for="m in MARGENES_LADO" :key="m" :value="m">{{ m }} mm</option></select></label>
              <label class="flex flex-col text-sm font-semibold text-slate-600">Margen de arriba<select v-model.number="margenSup" class="input mt-1"><option v-for="m in MARGENES_SUP" :key="m" :value="m">{{ m }} mm</option></select></label>
            </div>
            <button type="button" class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100" @click="imprimirPrueba"><Printer class="size-5" /> Imprimir tiquete de prueba</button>
          </details>
          <div class="mb-4 rounded-2xl border-2 border-slate-200 p-4">
            <p class="text-lg font-extrabold text-slate-900">Informe de ventas (CSV)</p>
            <p class="text-sm text-slate-500">Se arma con lo guardado en esta computadora: funciona sin internet y se abre en Excel.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button v-for="p in PERIODOS" :key="p[0]" type="button" class="rounded-xl border-2 px-3 py-1.5 text-base font-bold" :class="informePeriodo === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 hover:bg-slate-100'" @click="informePeriodo = p[0]">{{ p[1] }}</button>
            </div>
            <button type="button" class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-lg font-extrabold text-white hover:bg-slate-900 disabled:bg-slate-300" :disabled="!ventasInforme.length" @click="exportarVentas"><Download class="size-5" /> Descargar informe de ventas ({{ ventasInforme.length }} tiquete(s))</button>
          </div>
          <p v-if="!pos.caja" class="text-lg text-slate-500">La caja está cerrada: no hay un turno abierto.</p>
          <ul v-else class="divide-y divide-slate-100">
            <li v-for="v in ventasTurno" :key="v.id" class="flex items-center justify-between gap-2 py-3 text-lg">
              <span><span class="font-bold">{{ numeroTexto(v) }}</span> · {{ new Date(v.fecha).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false }) }}<span v-if="!v.enviada" class="ml-2 rounded-full bg-amber-100 px-2 text-sm font-semibold text-amber-800">{{ v.rechazada ? 'rechazada' : 'por enviar' }}</span></span>
              <span class="flex items-center gap-3"><b>{{ formatearColones(v.total) }}</b><button type="button" class="rounded-lg border-2 border-slate-300 p-2 hover:bg-slate-100" aria-label="Reimprimir" @click="imprimir(v, true)"><Printer class="size-5" /></button></span>
            </li>
            <li v-if="!ventasTurno.length" class="py-4 text-lg text-slate-500">Todavía no hay ventas en este turno.</li>
          </ul>
        </template>

        <template v-else-if="panel === 'inventario'">
          <p v-if="!contando" class="mb-3 rounded-2xl bg-blue-600 p-4 text-lg text-white">Esto es lo que el sistema dice que hay en <b>esta tienda</b>. Si algo no cuadra con lo que ve en el estante, avise a la administración.</p>
          <p v-else class="mb-3 rounded-2xl bg-blue-600 p-4 text-lg text-white"><b>Conteo:</b> cuente los pares que hay en el estante y escríbalos. Solo puede <b>subir</b> la existencia (lo que se vende baja solo). Si <b>falta</b> mercadería, avise a la administración. Deje en blanco lo que no cuente.</p>
          <input v-model="invTexto" type="search" placeholder="Busque por código, nombre o color" class="input" />
          <label class="mt-2 flex items-center gap-2 text-base font-semibold text-slate-700"><input v-model="invTodo" type="checkbox" class="size-5" /> Mostrar también lo que no tiene existencias</label>
          <p class="mt-2 text-sm text-slate-500">{{ invFilas.length }} producto(s) · {{ invPares }} pares en tienda</p>
          <ul class="mt-1 divide-y divide-slate-100">
            <li v-for="v in invFilas" :key="v.varianteId" class="flex items-center justify-between gap-3 py-2.5">
              <span class="min-w-0"><span class="flex items-center gap-2 truncate text-lg font-bold">{{ v.codigo }} · {{ v.color }}<span v-if="v.prueba" class="rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">PRUEBA</span></span><span class="block truncate text-sm text-slate-500">{{ v.nombre }} · <template v-if="esVendible(v)">{{ formatearColones(v.precio) }}</template><b v-else class="text-amber-600">sin precio de tienda</b></span></span>
              <span v-if="!contando" class="text-right"><span class="block text-2xl font-extrabold" :class="stockDe(v.varianteId) <= 0 ? 'text-red-600' : stockDe(v.varianteId) <= minimoDe(v.varianteId) ? 'text-amber-600' : 'text-slate-900'">{{ stockDe(v.varianteId) }}</span><span class="block text-xs text-slate-500">{{ minimoDe(v.varianteId) ? `mínimo ${minimoDe(v.varianteId)}` : 'pares' }}</span></span>
              <span v-else class="w-36 shrink-0 text-right">
                <span class="block text-sm text-slate-500">El sistema dice <b>{{ stockDe(v.varianteId) }}</b></span>
                <input v-model="conteo[v.varianteId]" type="number" min="0" step="1" inputmode="numeric" placeholder="¿Cuántos hay?" class="input mt-1 !min-h-11 text-right text-xl font-extrabold" :aria-label="`Pares de ${v.codigo} ${v.color}`" />
                <span v-if="conteo[v.varianteId] !== undefined && conteo[v.varianteId] !== ''" class="block text-sm font-bold" :class="diferenciaConteo(v) < 0 ? 'text-red-600' : diferenciaConteo(v) > 0 ? 'text-green-600' : 'text-slate-500'">{{ diferenciaConteo(v) < 0 ? 'No se puede bajar: avise a la administración' : diferenciaConteo(v) > 0 ? `Se suman ${diferenciaConteo(v)}` : 'Igual al sistema' }}</span>
              </span>
            </li>
            <li v-if="!invFilas.length" class="py-4 text-lg text-slate-600">No hay productos con esas condiciones.</li>
          </ul>
          <template v-if="!contando">
            <button type="button" class="mt-4 w-full rounded-2xl bg-blue-600 py-4 text-xl font-extrabold text-white hover:bg-blue-700" @click="empezarConteo">CONTAR INVENTARIO</button>
            <button type="button" class="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-lg font-extrabold text-white hover:bg-slate-900 disabled:bg-slate-300" :disabled="!invFilas.length" @click="exportarInventario"><Download class="size-5" /> Descargar inventario (CSV)</button>
            <button type="button" class="mt-2 w-full rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100" @click="descargarCatalogo">Actualizar existencias</button>
          </template>
          <template v-else>
            <input v-model="notaConteo" type="text" maxlength="300" placeholder="Motivo del conteo (obligatorio)" class="input mt-4" />
            <p v-if="errorConteo" class="mt-2 rounded-xl bg-red-100 px-4 py-3 text-base font-bold text-red-700">{{ errorConteo }}</p>
            <button type="button" class="mt-3 w-full rounded-2xl bg-green-600 py-4 text-xl font-extrabold text-white hover:bg-green-700 disabled:bg-slate-300" :disabled="guardandoConteo || !conteoValido" @click="guardarElConteo">{{ guardandoConteo ? 'Guardando…' : `GUARDAR CONTEO (+${paresConteo} pares)` }}</button>
            <button type="button" class="mt-2 w-full rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100" @click="contando = false">Cancelar el conteo</button>
          </template>
        </template>

        <template v-else-if="panel === 'alertas'">
          <p class="mb-3 rounded-2xl bg-amber-50 p-4 text-lg text-amber-900">Estos productos ya llegaron al mínimo o se agotaron. Haga el pedido a la bodega para que no se queden sin vender.</p>
          <ul class="divide-y divide-slate-100">
            <li v-for="a in alertasLocales" :key="a.varianteId" class="flex items-center justify-between py-3 text-lg"><span class="font-semibold">{{ a.codigo }} · {{ a.color }}</span><span class="font-extrabold" :class="a.stock <= 0 ? 'text-red-600' : 'text-amber-600'">{{ a.stock <= 0 ? 'AGOTADO' : `Quedan ${a.stock}` }}</span></li>
            <li v-if="!alertasLocales.length" class="py-4 text-lg text-green-700">Todo en orden: ningún producto se está acabando.</li>
          </ul>
          <button v-if="alertasLocales.length" type="button" class="mt-4 w-full rounded-2xl bg-blue-600 py-4 text-xl font-extrabold text-white hover:bg-blue-700" @click="panel = ''; pidiendo = true">PEDIR MERCADERÍA</button>
          <button type="button" class="mt-2 w-full rounded-2xl border-2 border-slate-300 py-3 text-lg font-bold hover:bg-slate-100" @click="descargarCatalogo">Actualizar existencias</button>
          <button v-if="!auth.esEncargadoTienda" type="button" class="mt-2 w-full text-sm text-slate-500 underline" @click="cambiar">Cambiar la tienda de esta terminal</button>
        </template>

        <template v-else-if="panel === 'rechazadas'">
          <p class="mb-3 rounded-2xl bg-red-50 p-4 text-lg text-red-900">El sistema no aceptó estas ventas (por ejemplo, porque un producto ya no existe). <b>Avise a la administración.</b> Las ventas siguen guardadas aquí.</p>
          <ul class="divide-y divide-slate-100">
            <li v-for="v in rechazadas" :key="v.id" class="py-3 text-lg"><span class="font-bold">{{ numeroTexto(v) }}</span> · {{ formatearColones(v.total) }}<p class="text-base text-red-600">{{ v.error }}</p></li>
          </ul>
          <button type="button" class="mt-4 w-full rounded-2xl bg-blue-600 py-4 text-xl font-extrabold text-white hover:bg-blue-700" @click="reintentarRechazadas">REINTENTAR ENVÍO</button>
        </template>
      </div>
    </div>

    <PedidoReposicion v-if="pidiendo" @cerrar="pidiendo = false" />

    <!-- Tiquete para imprimir: vive fuera de la pantalla y solo se ve al imprimir -->
    <Teleport to="body">
      <div id="ticket-print"><TiquetePos v-if="ventaImpresion" :venta="ventaImpresion" /></div>
    </Teleport>
  </div>
</template>
