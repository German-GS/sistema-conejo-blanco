import { computed, reactive } from 'vue';
import { api, ApiError } from './api.js';
import { dbAll, dbDelete, dbGet, dbPut } from './posDb.js';

// Lógica del punto de venta. Todo lo que el cajero hace se guarda primero en esta computadora (IndexedDB) y se
// envía al servidor cuando hay internet; reenviar nunca duplica porque cada venta lleva su propio id.

export const pos = reactive({
  listo: false,
  error: '',
  tienda: null, // { id, nombre, codigo }
  catalogo: null, // { variantes, encabezado, generadoEn }
  stockServidor: {}, // varianteId -> { stock, minimo } según el último dato del servidor
  ultimoNumero: 0,
  caja: null, // turno abierto
  ventas: [], // ventas de esta terminal (pendientes y ya enviadas recientes)
  cajas: [],
  ordenes: [], // pedidos de reposición hechos en esta terminal
  ordenesRecientes: [], // pedidos de la tienda según el servidor (con su estado)
  recepciones: [], // mercadería aceptada en la tienda que aún no se envió al servidor
  ultimoNumeroOrden: 0,
  enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
  sincronizando: false,
  ultimoSync: null,
  avisoSync: '',
  imprimirAuto: true,
});

const DIAS_GUARDAR = 45; // lo ya enviado se conserva para poder sacar el informe de ventas sin internet
const CADA_CATALOGO_MS = 10 * 60_000;
const CADA_SYNC_MS = 30_000;
let temporizadores = [];
let iniciado = false;

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const pad6 = (n) => String(n).padStart(6, '0');
export const numeroTexto = (venta) => `${venta.tiendaCodigo ?? pos.tienda?.codigo ?? 'T'}-${pad6(venta.numero)}`;
const redondear = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------- Existencias y búsqueda

export const pendientes = computed(() => pos.ventas.filter((v) => !v.enviada && !v.rechazada));
export const rechazadas = computed(() => pos.ventas.filter((v) => v.rechazada));

// Lo que se vendió sin enviar todavía se resta de las existencias del servidor.
const vendidoPendiente = computed(() => {
  const m = {};
  for (const v of pos.ventas) {
    if (v.enviada || v.anulada) continue;
    for (const l of v.lineas) m[l.varianteId] = (m[l.varianteId] ?? 0) + l.cantidad;
  }
  return m;
});

// La mercadería aceptada sin internet ya cuenta en la existencia de la tienda aunque el servidor todavía no lo sepa.
const recibidoPendiente = computed(() => {
  const m = {};
  for (const r of pos.recepciones) {
    if (r.rechazada) continue;
    for (const l of r.lineas) m[l.varianteId] = (m[l.varianteId] ?? 0) + l.cantidadRecibida;
  }
  return m;
});

export const stockDe = (varianteId) => (pos.stockServidor[varianteId]?.stock ?? 0) - (vendidoPendiente.value[varianteId] ?? 0) + (recibidoPendiente.value[varianteId] ?? 0);
export const minimoDe = (varianteId) => pos.stockServidor[varianteId]?.minimo ?? 0;

// Se vende solo lo que tiene precio de tienda; el resto del catálogo solo se puede pedir a la bodega.
export const esVendible = (v) => v.precio !== null && v.precio !== undefined;
const construirIndice = (variantes) =>
  variantes.map((v) => ({ v, texto: sinTildes(`${v.codigo} ${v.nombre} ${v.color} ${v.codigoBarras ?? ''}`), barras: sinTildes(v.codigoBarras ?? ''), codigo: sinTildes(v.codigo) }));
const indice = computed(() => construirIndice((pos.catalogo?.variantes ?? []).filter(esVendible)));
const indicePedido = computed(() => construirIndice(pos.catalogo?.variantes ?? []));

// paraPedido: busca en todo el catálogo (también lo que la tienda aún no vende); si no, solo en lo vendible.
export function buscar(texto, limite = 24, paraPedido = false) {
  const t = sinTildes(texto).trim();
  if (!t) return [];
  const palabras = t.split(/\s+/);
  return (paraPedido ? indicePedido : indice).value.filter((x) => palabras.every((p) => x.texto.includes(p))).slice(0, limite).map((x) => x.v);
}

// Lo que lee el lector de código de barras: coincidencia exacta con el código de barras (o con "CÓDIGO color" único).
export function buscarExacto(texto) {
  const t = sinTildes(texto).trim();
  if (!t) return null;
  return indice.value.find((x) => x.barras && x.barras === t)?.v ?? null;
}

export const alertasLocales = computed(() =>
  (pos.catalogo?.variantes ?? [])
    .map((v) => ({ ...v, stock: stockDe(v.varianteId), minimo: minimoDe(v.varianteId) }))
    .filter((v) => v.minimo > 0 && v.stock <= v.minimo)
    .sort((a, b) => a.stock - b.stock),
);

// ---------------------------------------------------------------- Inicio

async function cargarLocal() {
  const [tienda, catalogo, stock, ultimo, imprimir, ventas, cajas, ordenes, recientes, ultimaOrden] = await Promise.all([
    dbGet('kv', 'tienda'),
    dbGet('kv', 'catalogo'),
    dbGet('kv', 'stockServidor'),
    dbGet('kv', 'ultimoNumero'),
    dbGet('kv', 'imprimirAuto'),
    dbAll('ventas'),
    dbAll('cajas'),
    dbAll('ordenes'),
    dbGet('kv', 'ordenesRecientes'),
    dbGet('kv', 'ultimoNumeroOrden'),
  ]);
  pos.tienda = tienda ?? null;
  pos.catalogo = catalogo ?? null;
  pos.stockServidor = stock ?? {};
  pos.ultimoNumero = ultimo ?? 0;
  pos.imprimirAuto = imprimir ?? true;
  pos.ventas = ventas.sort((a, b) => a.numero - b.numero);
  pos.cajas = cajas;
  pos.ordenes = ordenes.sort((a, b) => a.numero - b.numero);
  pos.ordenesRecientes = recientes ?? [];
  pos.ultimoNumeroOrden = ultimaOrden ?? 0;
  pos.recepciones = (await dbGet('kv', 'recepciones')) ?? [];
  pos.caja = cajaAbiertaDe(pos.tienda?.id);
}

// Cada venta y cada caja recuerdan de qué tienda son (una terminal puede haber trabajado antes con otra).
const tiendaDe = (x) => x.ubicacionId ?? pos.tienda?.id;
function cajaAbiertaDe(ubicacionId) {
  return pos.cajas.find((c) => !c.cerradaEn && tiendaDe(c) === ubicacionId) ?? null;
}

export async function iniciarPos() {
  if (iniciado) return;
  iniciado = true;
  try {
    await cargarLocal();
  } catch (err) {
    pos.error = err instanceof Error ? err.message : 'No se pudo abrir el almacenamiento local.';
  }
  pos.listo = true;
  window.addEventListener('online', alVolverInternet);
  window.addEventListener('offline', alPerderInternet);
  temporizadores = [
    setInterval(() => void sincronizar(), CADA_SYNC_MS),
    setInterval(() => void descargarCatalogo(), CADA_CATALOGO_MS),
  ];
  if (pos.tienda) {
    void descargarCatalogo();
    void sincronizar();
  }
}

export function detenerPos() {
  window.removeEventListener('online', alVolverInternet);
  window.removeEventListener('offline', alPerderInternet);
  temporizadores.forEach(clearInterval);
  temporizadores = [];
  iniciado = false;
  pos.listo = false;
}

function alVolverInternet() {
  pos.enLinea = true;
  void sincronizar().then(() => descargarCatalogo());
}
function alPerderInternet() {
  pos.enLinea = false;
}

export async function elegirTienda(tienda) {
  pos.tienda = { id: tienda.id, nombre: tienda.nombre, codigo: tienda.codigo };
  pos.catalogo = null;
  pos.stockServidor = {};
  pos.caja = cajaAbiertaDe(tienda.id);
  pos.ultimoNumero = Math.max(0, ...pos.ventas.filter((v) => v.ubicacionId === tienda.id).map((v) => v.numero));
  pos.ultimoNumeroOrden = Math.max(0, ...pos.ordenes.filter((o) => o.ubicacionId === tienda.id).map((o) => o.numero));
  pos.ordenesRecientes = [];
  await dbPut('kv', JSON.parse(JSON.stringify(pos.tienda)), 'tienda');
  await dbDelete('kv', 'catalogo');
  await descargarCatalogo();
}

export async function cambiarTienda() {
  if (recepcionesPorEnviar.value.length) throw new Error('Hay mercadería aceptada sin enviar. Conéctese a internet y espere a que se envíe antes de cambiar la tienda.');
  if (pendientes.value.length) throw new Error('Hay ventas sin enviar. Conéctese a internet y espere a que se envíen antes de cambiar la tienda.');
  pos.tienda = null;
  pos.catalogo = null;
  pos.stockServidor = {};
  await dbDelete('kv', 'tienda');
  await dbDelete('kv', 'catalogo');
}

export async function descargarCatalogo() {
  if (!pos.tienda || !navigator.onLine) return;
  try {
    const c = await api.get(`/pos/catalogo/${pos.tienda.id}`);
    pos.catalogo = c;
    const stock = {};
    for (const v of c.variantes) stock[v.varianteId] = { stock: v.stock, minimo: v.minimo };
    pos.stockServidor = stock;
    pos.ultimoNumero = Math.max(pos.ultimoNumero, c.ultimoNumero);
    pos.ultimoNumeroOrden = Math.max(pos.ultimoNumeroOrden, c.ultimoNumeroOrden ?? 0);
    pos.ordenesRecientes = c.ordenesRecientes ?? [];
    pos.enLinea = true;
    await Promise.all([dbPut('kv', JSON.parse(JSON.stringify(c)), 'catalogo'), dbPut('kv', JSON.parse(JSON.stringify(stock)), 'stockServidor'), dbPut('kv', pos.ultimoNumero, 'ultimoNumero'), dbPut('kv', pos.ultimoNumeroOrden, 'ultimoNumeroOrden'), dbPut('kv', JSON.parse(JSON.stringify(pos.ordenesRecientes)), 'ordenesRecientes')]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) pos.enLinea = false;
    else pos.avisoSync = err instanceof ApiError ? err.message : 'No se pudo actualizar el catálogo.';
  }
}

export async function guardarImprimirAuto(valor) {
  pos.imprimirAuto = valor;
  await dbPut('kv', valor, 'imprimirAuto');
}

// ---------------------------------------------------------------- Caja (turno)

export async function abrirCaja(fondoInicial, cajero) {
  if (pos.caja) throw new Error('Ya hay una caja abierta.');
  const caja = { id: crypto.randomUUID(), ubicacionId: pos.tienda.id, cajeroId: cajero.id, cajero: cajero.nombre, abiertaEn: new Date().toISOString(), fondoInicial: redondear(fondoInicial), aperturaEnviada: false, cierreEnviado: false };
  await dbPut('cajas', caja);
  pos.cajas.push(caja);
  pos.caja = caja;
  void sincronizar();
}

// Efectivo que debería haber en la gaveta: fondo + efectivo de las ventas vigentes del turno.
export function efectivoEsperado(caja = pos.caja) {
  if (!caja) return 0;
  const efectivo = pos.ventas
    .filter((v) => v.cajaId === caja.id && !v.anulada && !v.esPrueba)
    .reduce((a, v) => a + v.pagos.filter((p) => p.medio === 'efectivo').reduce((s, p) => s + p.monto, 0), 0);
  return redondear(caja.fondoInicial + efectivo);
}

export async function cerrarCaja(efectivoContado, notas) {
  if (!pos.caja) throw new Error('No hay una caja abierta.');
  const caja = { ...pos.caja, cerradaEn: new Date().toISOString(), efectivoContado: redondear(efectivoContado), efectivoEsperado: efectivoEsperado(), notas: notas?.trim() || undefined, cierreEnviado: false };
  caja.diferencia = redondear(caja.efectivoContado - caja.efectivoEsperado);
  await dbPut('cajas', caja);
  pos.cajas = pos.cajas.map((c) => (c.id === caja.id ? caja : c));
  pos.caja = null;
  void sincronizar();
  return caja;
}

export function resumenTurno(caja = pos.caja) {
  const ventas = pos.ventas.filter((v) => caja && v.cajaId === caja.id && !v.anulada && !v.esPrueba);
  const porMedio = {};
  for (const v of ventas) for (const p of v.pagos) porMedio[p.medio] = redondear((porMedio[p.medio] ?? 0) + p.monto);
  return { ventas: ventas.length, total: redondear(ventas.reduce((a, v) => a + v.total, 0)), porMedio };
}

// ---------------------------------------------------------------- Cobrar

// carrito: [{ varianteId, codigo, nombre, color, precio, cantidad }]; pagos: [{ medio, monto, referencia?, recibido? }]
export async function cobrar(carrito, pagos, cajero) {
  if (!pos.tienda) throw new Error('Esta terminal no tiene tienda asignada.');
  if (!pos.caja) throw new Error('Abra la caja antes de vender.');
  if (!carrito.length) throw new Error('El tiquete está vacío.');
  const esPrueba = carrito.every((l) => l.prueba);
  if (!esPrueba && carrito.some((l) => l.prueba)) throw new Error('No se pueden mezclar productos de prueba con productos reales en el mismo tiquete.');
  const lineas = carrito.map((l) => ({ varianteId: l.varianteId, codigo: l.codigo, nombre: l.nombre, color: l.color, cantidad: l.cantidad, precioUnitario: l.precio, descuento: 0, subtotal: redondear(l.precio * l.cantidad) }));
  const total = redondear(lineas.reduce((a, l) => a + l.subtotal, 0));
  const pagado = redondear(pagos.reduce((a, p) => a + p.monto, 0));
  if (Math.abs(pagado - total) > 0.001) throw new Error('Los pagos no suman el total.');
  const numero = pos.ultimoNumero + 1;
  const venta = {
    id: crypto.randomUUID(),
    numero,
    ubicacionId: pos.tienda.id,
    tiendaCodigo: pos.tienda.codigo,
    fecha: new Date().toISOString(),
    cajaId: pos.caja.id,
    cajeroId: cajero.id,
    cajero: cajero.nombre,
    sinConexion: !navigator.onLine || !pos.enLinea,
    esPrueba,
    lineas,
    pagos: pagos.map((p) => ({ medio: p.medio, monto: redondear(p.monto), referencia: p.referencia?.trim() || undefined, recibido: p.medio === 'efectivo' && p.recibido !== undefined ? redondear(p.recibido) : undefined })),
    total,
    enviada: false,
  };
  pos.ultimoNumero = numero;
  await Promise.all([dbPut('ventas', JSON.parse(JSON.stringify(venta))), dbPut('kv', numero, 'ultimoNumero')]);
  pos.ventas.push(venta);
  void sincronizar();
  return venta;
}

// ---------------------------------------------------------------- Pedidos de reposición

// Cuántos pares conviene pedir: llegar al doble del mínimo (o a una docena si no hay mínimo), en docenas completas.
export function sugeridaPara(stock, minimo) {
  const objetivo = Math.max(minimo * 2, 12);
  const falta = Math.max(objetivo - Math.max(stock, 0), 1);
  return Math.ceil(falta / 12) * 12;
}

// Productos agotados o en su mínimo (existencia actual de la tienda, ya descontando lo vendido sin enviar).
export const sugerenciasPedido = computed(() =>
  (pos.catalogo?.variantes ?? [])
    .filter(esVendible)
    .map((v) => {
      const stock = stockDe(v.varianteId);
      const minimo = minimoDe(v.varianteId);
      return { ...v, stock, minimo, sugerida: sugeridaPara(stock, minimo), agotado: stock <= 0 };
    })
    .filter((v) => v.stock <= 0 || (v.minimo > 0 && v.stock <= v.minimo))
    .sort((a, b) => Number(b.agotado) - Number(a.agotado) || a.stock - b.stock || a.codigo.localeCompare(b.codigo)),
);

// lineas: [{ varianteId, codigo, nombre, color, cantidad, stockTienda, minimo, sugerida }]
export async function crearOrden(lineas, { urgente, notas }, usuario) {
  if (!pos.tienda) throw new Error('Esta terminal no tiene tienda asignada.');
  if (!lineas.length) throw new Error('Agregue al menos un producto al pedido.');
  const numero = pos.ultimoNumeroOrden + 1;
  const orden = {
    id: crypto.randomUUID(),
    numero,
    ubicacionId: pos.tienda.id,
    tiendaCodigo: pos.tienda.codigo,
    fecha: new Date().toISOString(),
    solicitanteId: usuario.id,
    solicitante: usuario.nombre,
    urgente: Boolean(urgente),
    notas: notas?.trim() || undefined,
    sinConexion: !navigator.onLine || !pos.enLinea,
    lineas: lineas.map((l) => ({ varianteId: l.varianteId, codigo: l.codigo, nombre: l.nombre, color: l.color, cantidad: l.cantidad, stockTienda: l.stockTienda, minimo: l.minimo, sugerida: l.sugerida })),
    enviada: false,
  };
  pos.ultimoNumeroOrden = numero;
  await Promise.all([dbPut('ordenes', JSON.parse(JSON.stringify(orden))), dbPut('kv', numero, 'ultimoNumeroOrden')]);
  pos.ordenes.push(orden);
  void sincronizar();
  return orden;
}

// La tienda verifica lo que llegó contra lo que dice la orden y lo acepta. Se guarda en esta computadora y la existencia sube
// de una vez; el servidor mueve el inventario y la contabilidad cuando hay internet.
export const recepcionPendiente = (ordenId) => pos.recepciones.find((r) => r.ordenId === ordenId && !r.rechazada);
export const recepcionesPorEnviar = computed(() => pos.recepciones.filter((r) => !r.rechazada));
export const recepcionesRechazadas = computed(() => pos.recepciones.filter((r) => r.rechazada));

export async function recibirOrdenTienda(ordenId, lineas, nota) {
  if (!pos.tienda) throw new Error('Esta terminal no tiene tienda asignada.');
  if (recepcionPendiente(ordenId)) throw new Error('Esa mercadería ya se aceptó y está por enviarse.');
  const r = { ordenId, ubicacionId: pos.tienda.id, fecha: new Date().toISOString(), lineas: lineas.map((l) => ({ varianteId: l.varianteId, cantidadRecibida: l.cantidadRecibida })), nota: nota?.trim() || undefined, rechazada: false, error: '' };
  pos.recepciones = [...pos.recepciones.filter((x) => x.ordenId !== ordenId), r];
  await dbPut('kv', JSON.parse(JSON.stringify(pos.recepciones)), 'recepciones');
  await sincronizar();
  // Con internet el servidor responde enseguida: si no la aceptó, se le dice a la persona por qué y no queda atascada.
  const rechazada = pos.recepciones.find((x) => x.ordenId === ordenId && x.rechazada);
  if (rechazada) {
    pos.recepciones = pos.recepciones.filter((x) => x !== rechazada);
    await dbPut('kv', JSON.parse(JSON.stringify(pos.recepciones)), 'recepciones');
    throw new Error(rechazada.error);
  }
}

export async function reintentarRecepciones() {
  for (const r of pos.recepciones) r.rechazada = false;
  await dbPut('kv', JSON.parse(JSON.stringify(pos.recepciones)), 'recepciones');
  await sincronizar();
}

export const ordenesPendientes = computed(() => pos.ordenes.filter((o) => !o.enviada && !o.rechazada));
export const numeroOrdenTexto = (o) => `OR-${o.tiendaCodigo ?? pos.tienda?.codigo ?? 'T'}-${String(o.numero).padStart(4, '0')}`;

// ---------------------------------------------------------------- Sincronizar

function ventaParaServidor(v) {
  return {
    id: v.id,
    numero: v.numero,
    fecha: v.fecha,
    cajaId: v.cajaId,
    cajeroId: v.cajeroId,
    sinConexion: v.sinConexion,
    lineas: v.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento || undefined })),
    pagos: v.pagos.map((p) => ({ medio: p.medio, monto: p.monto, referencia: p.referencia, recibido: p.recibido })),
  };
}

function cajaParaServidor(c) {
  return { id: c.id, cajeroId: c.cajeroId, abiertaEn: c.abiertaEn, fondoInicial: c.fondoInicial, cerradaEn: c.cerradaEn, efectivoContado: c.efectivoContado, notas: c.notas };
}

export async function reintentarRechazadas() {
  for (const v of pos.ventas.filter((x) => x.rechazada)) {
    v.rechazada = false;
    v.error = '';
    await dbPut('ventas', JSON.parse(JSON.stringify(v)));
  }
  await sincronizar();
}

export async function sincronizar() {
  if (!pos.tienda || pos.sincronizando || !navigator.onLine) return;
  const ventas = pos.ventas.filter((v) => !v.enviada && !v.rechazada);
  const cajas = pos.cajas.filter((c) => !c.aperturaEnviada || (c.cerradaEn && !c.cierreEnviado));
  const ordenes = pos.ordenes.filter((o) => !o.enviada && !o.rechazada);
  const recepciones = pos.recepciones.filter((r) => !r.rechazada);
  if (!ventas.length && !cajas.length && !ordenes.length && !recepciones.length) return;
  pos.sincronizando = true;
  try {
    // Se envía por tienda: lo pendiente de otra tienda (si la terminal cambió de tienda) viaja a la suya.
    const tiendas = new Set([...ventas, ...cajas, ...ordenes, ...recepciones].map(tiendaDe));
    for (const ubicacionId of tiendas) {
      const r = await api.post('/pos/sincronizar', {
        ubicacionId,
        ventas: ventas.filter((v) => tiendaDe(v) === ubicacionId).map(ventaParaServidor),
        cajas: cajas.filter((c) => tiendaDe(c) === ubicacionId).map(cajaParaServidor),
        ordenes: ordenes.filter((o) => tiendaDe(o) === ubicacionId).map(ordenParaServidor),
        recepciones: recepciones.filter((x) => tiendaDe(x) === ubicacionId).map((x) => ({ ordenId: x.ordenId, lineas: x.lineas, nota: x.nota })),
      });
      await aplicarResultado(r, ubicacionId, cajas.filter((c) => tiendaDe(c) === ubicacionId));
    }
    pos.avisoSync = '';
    pos.enLinea = true;
    await depurar();
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) pos.enLinea = false;
    else pos.avisoSync = err instanceof ApiError ? err.message : 'No se pudieron enviar las ventas.';
  } finally {
    pos.sincronizando = false;
  }
}

function ordenParaServidor(o) {
  return { id: o.id, numero: o.numero, fecha: o.fecha, urgente: o.urgente, notas: o.notas, sinConexion: o.sinConexion, lineas: o.lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad, stockTienda: l.stockTienda, minimo: l.minimo, sugerida: l.sugerida })) };
}

async function aplicarResultado(r, ubicacionId, cajasEnviadas) {
  for (const res of r.recepciones ?? []) {
    const x = pos.recepciones.find((q) => q.ordenId === res.ordenId);
    if (!x) continue;
    if (res.estado === 'error') {
      x.rechazada = true;
      x.error = res.mensaje ?? 'El servidor no aceptó la recepción.';
    } else {
      pos.recepciones = pos.recepciones.filter((q) => q !== x);
    }
  }
  if (r.recepciones?.length) await dbPut('kv', JSON.parse(JSON.stringify(pos.recepciones)), 'recepciones');
  for (const res of r.ordenes ?? []) {
    const o = pos.ordenes.find((x) => x.id === res.id);
    if (!o) continue;
    if (res.estado === 'error') {
      o.rechazada = true;
      o.error = res.mensaje ?? 'El servidor rechazó el pedido.';
    } else {
      o.enviada = true;
      o.rechazada = false;
      o.error = '';
      if (res.numero) o.numero = res.numero;
    }
    await dbPut('ordenes', JSON.parse(JSON.stringify(o)));
  }
  for (const res of r.ventas) {
    const v = pos.ventas.find((x) => x.id === res.id);
    if (!v) continue;
    if (res.estado === 'error') {
      v.rechazada = true;
      v.error = res.mensaje ?? 'El servidor rechazó la venta.';
    } else {
      v.enviada = true;
      v.rechazada = false;
      v.error = '';
      if (res.numero) v.numero = res.numero;
    }
    await dbPut('ventas', JSON.parse(JSON.stringify(v)));
  }
  for (const c of cajasEnviadas) {
    if (r.cajas.some((x) => x.id === c.id && x.estado === 'error')) continue;
    const local = pos.cajas.find((x) => x.id === c.id);
    if (!local) continue;
    local.aperturaEnviada = true;
    if (local.cerradaEn && r.cajas.some((x) => x.id === c.id && x.estado === 'ok')) local.cierreEnviado = true;
    await dbPut('cajas', JSON.parse(JSON.stringify(local)));
  }
  pos.ultimoSync = r.sincronizadoEn;
  if (ubicacionId === pos.tienda?.id) {
    const stock = {};
    for (const s of r.stock) stock[s.varianteId] = { stock: s.stock, minimo: s.minimo };
    pos.stockServidor = { ...pos.stockServidor, ...stock };
    pos.ultimoNumero = Math.max(pos.ultimoNumero, r.ultimoNumero);
    pos.ultimoNumeroOrden = Math.max(pos.ultimoNumeroOrden, r.ultimoNumeroOrden ?? 0);
    pos.ordenesRecientes = r.ordenesRecientes ?? pos.ordenesRecientes;
    await Promise.all([dbPut('kv', JSON.parse(JSON.stringify(pos.stockServidor)), 'stockServidor'), dbPut('kv', pos.ultimoNumero, 'ultimoNumero'), dbPut('kv', pos.ultimoNumeroOrden, 'ultimoNumeroOrden'), dbPut('kv', JSON.parse(JSON.stringify(pos.ordenesRecientes)), 'ordenesRecientes')]);
  }
}

// Lo ya enviado se guarda unos días (para reimprimir y para el cierre de caja) y luego se borra del equipo.
async function depurar() {
  const limite = Date.now() - DIAS_GUARDAR * 86_400_000;
  const abierta = pos.caja?.id;
  for (const v of [...pos.ventas]) {
    if (v.enviada && v.cajaId !== abierta && new Date(v.fecha).getTime() < limite) {
      await dbDelete('ventas', v.id);
      pos.ventas = pos.ventas.filter((x) => x.id !== v.id);
    }
  }
  for (const o of [...pos.ordenes]) {
    if (o.enviada && new Date(o.fecha).getTime() < limite) {
      await dbDelete('ordenes', o.id);
      pos.ordenes = pos.ordenes.filter((x) => x.id !== o.id);
    }
  }
  for (const c of [...pos.cajas]) {
    if (c.cerradaEn && c.cierreEnviado && new Date(c.cerradaEn).getTime() < limite) {
      await dbDelete('cajas', c.id);
      pos.cajas = pos.cajas.filter((x) => x.id !== c.id);
    }
  }
}
