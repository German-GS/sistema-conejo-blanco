<script setup>
import ImagenConRespaldo from '../../components/ImagenConRespaldo.vue';
import { confirmar } from '../../lib/confirmar.js';
import Cargando from '../../components/Cargando.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Trash2, Pencil, History, Search, X, Image, Upload } from '@lucide/vue';
import { api, ApiError, API_URL, subirArchivo } from '../../lib/api.js';
import { useAuthStore } from '../../stores/auth.js';
import { formatearColones, formatearFechaHora } from '../../lib/format.js';
import { CODIGO_PRODUCTO_AYUDA, codigoProductoValido, normalizarCodigoProducto } from '../../lib/codigoProducto.js';

const productos = ref([]);
const cargando = ref(true);
const auth = useAuthStore();
const error = ref('');

// --- Búsqueda instantánea (sin ir al servidor: ya está todo cargado) ----
// Por código, nombre, descripción o color de CUALQUIER variante — varias
// palabras exigen que cada una aparezca en algún campo, no todas en el
// mismo (ej. "media rojo" encuentra un producto cuyo nombre trae "media"
// y que tiene un color "Rojo", aunque estén en campos distintos).
// Acentos e mayúsculas no importan.
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

function textoBuscableProducto(producto) {
  return normalizar(
    [producto.codigo, producto.codigo.replace(/\s/g, ""), producto.nombre, producto.descripcion, ...producto.variantes.map((v) => v.color)]
      .filter(Boolean)
      .join(' '),
  );
}

const productosFiltrados = computed(() => {
  if (palabrasBusqueda.value.length === 0) return productos.value;
  return productos.value.filter((producto) => {
    const texto = textoBuscableProducto(producto);
    return palabrasBusqueda.value.every((palabra) => texto.includes(palabra));
  });
});

function colorCoincide(color) {
  if (palabrasBusqueda.value.length === 0) return false;
  const texto = normalizar(color);
  return palabrasBusqueda.value.some((palabra) => texto.includes(palabra));
}

const mostrarFormProducto = ref(false);
const guardandoProducto = ref(false);
// CABYS: opcional, pero si se escribe son 13 dígitos (Hacienda lo pide en cada línea de la factura electrónica).
const cabysValido = (v) => !v.trim() || /^\d{13}$/.test(v.trim());
const nuevoProducto = reactive({ codigo: '', nombre: '', descripcion: '', cabys: '', esPrueba: false });

// Colores del producto nuevo, capturados junto con el producto en el mismo
// formulario — el color es texto libre, así que sirve igual para un color
// de catálogo normal que para uno hecho a la medida de un pedido puntual.
// costo es opcional pero es lo que le pone piso a los descuentos que
// pueda dar el vendedor (ver NuevoPedidoPage) — sin costo cargado, ese
// color no tiene piso de margen protegido.
const variantesNuevas = ref([{ color: '', precioPorPar: '', costo: '' }]);

function agregarFilaVariante() {
  variantesNuevas.value.push({ color: '', precioPorPar: '', costo: '' });
}

function quitarFilaVariante(index) {
  variantesNuevas.value.splice(index, 1);
}

const variantesNuevasValidas = computed(() =>
  variantesNuevas.value.filter((v) => v.color.trim() && Number(v.precioPorPar) > 0),
);

const productoNuevoValido = computed(
  () => codigoProductoValido(nuevoProducto.codigo) && nuevoProducto.nombre.trim() && cabysValido(nuevoProducto.cabys) && variantesNuevasValidas.value.length > 0,
);

const productoParaVariante = ref(null);
const nuevaVariante = reactive({ color: '', precioPorPar: '', costo: '' });
const guardandoVariante = ref(false);

// Solo gerencia y el administrador del sistema; solo si el producto nunca se usó y no tiene existencias.
async function eliminarProducto(producto) {
  if (producto.esPrueba) {
    if (!await confirmar(`¿Eliminar el producto de PRUEBA "${producto.codigo} — ${producto.nombre}"?\n\nSe borra también TODO lo que se hizo con él: ventas de caja, pedidos y traspasos de tienda, existencias y movimientos. No se puede deshacer.`, { palabra: 'ELIMINAR' })) return;
    error.value = '';
    try {
      await api.delete(`/catalogo/productos/${producto.id}`);
      await cargar();
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No se pudo eliminar el producto de prueba.';
    }
    return;
  }
  if (!await confirmar(`¿Eliminar "${producto.codigo} — ${producto.nombre}" con todos sus colores y fotos? No se puede deshacer. Solo se elimina si nunca se usó en pedidos, facturas o traspasos y no tiene pares en bodega.`, { palabra: 'ELIMINAR' })) return;
  error.value = '';
  try {
    await api.delete(`/catalogo/productos/${producto.id}`);
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo eliminar el producto.';
  }
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    productos.value = await api.get('/catalogo/productos');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar el inventario.';
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

async function crearProducto() {
  if (!productoNuevoValido.value) return;
  error.value = '';
  guardandoProducto.value = true;
  try {
    const producto = await api.post('/catalogo/productos', {
      codigo: normalizarCodigoProducto(nuevoProducto.codigo),
      nombre: nuevoProducto.nombre.trim(),
      descripcion: nuevoProducto.descripcion.trim() || undefined,
      cabys: nuevoProducto.cabys.trim() || undefined,
      ...(auth.esSistema && nuevoProducto.esPrueba ? { esPrueba: true } : {}),
    });

    // Los colores se crean uno por uno porque el backend no tiene (todavía)
    // un endpoint que reciba producto + variantes en una sola llamada. Si
    // alguno falla a mitad de camino, el producto y los colores que sí se
    // guardaron quedan — el resto se puede agregar después con "+ Color".
    // Cada creación (producto y cada color) queda en la bitácora por su
    // cuenta (ver ProductoEdicion en el backend).
    for (const v of variantesNuevasValidas.value) {
      await api.post(`/catalogo/productos/${producto.id}/variantes`, {
        color: v.color.trim(),
        precioPorPar: Number(v.precioPorPar),
        costo: v.costo ? Number(v.costo) : undefined,
      });
    }

    Object.assign(nuevoProducto, { codigo: '', nombre: '', descripcion: '', cabys: '', esPrueba: false });
    variantesNuevas.value = [{ color: '', precioPorPar: '', costo: '' }];
    mostrarFormProducto.value = false;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo crear el producto.';
  } finally {
    guardandoProducto.value = false;
  }
}

function abrirFormVariante(producto) {
  productoParaVariante.value = producto.id === productoParaVariante.value ? null : producto.id;
  nuevaVariante.color = '';
  nuevaVariante.precioPorPar = '';
  nuevaVariante.costo = '';
  productoEnEdicion.value = null;
  fotosAbiertas.value = null;
}

async function crearVariante(productoId) {
  error.value = '';
  guardandoVariante.value = true;
  try {
    await api.post(`/catalogo/productos/${productoId}/variantes`, {
      color: nuevaVariante.color.trim(),
      precioPorPar: Number(nuevaVariante.precioPorPar),
      costo: nuevaVariante.costo ? Number(nuevaVariante.costo) : undefined,
    });
    productoParaVariante.value = null;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo crear la variante.';
  } finally {
    guardandoVariante.value = false;
  }
}

async function alternarVariante(variante) {
  error.value = '';
  try {
    await api.patch(`/catalogo/productos/variantes/${variante.id}`, { activo: !variante.activo });
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo actualizar el color.';
  }
}

// --- Fotos del producto (no por color) ---------------------------------
// Sirven para que el vendedor le muestre al cliente cómo se ve el estilo
// (ver el botón "ojo" en Nuevo pedido — VerFotosProducto.vue). Pueden
// cargarse varias por producto.
function urlFoto(foto) {
  return `${API_URL}${foto.url}`;
}

const fotosAbiertas = ref(null); // id del producto cuyo panel de fotos está abierto, o null
const subiendoFoto = ref(false);
const errorFotos = ref('');

function alternarFotos(producto) {
  fotosAbiertas.value = fotosAbiertas.value === producto.id ? null : producto.id;
  errorFotos.value = '';
  productoEnEdicion.value = null;
  productoParaVariante.value = null;
}

async function subirFoto(producto, event) {
  const archivo = event.target.files?.[0];
  event.target.value = ''; // permite volver a elegir el mismo archivo después
  if (!archivo) return;
  errorFotos.value = '';
  subiendoFoto.value = true;
  try {
    const formData = new FormData();
    formData.append('foto', archivo);
    await subirArchivo(`/catalogo/productos/${producto.id}/fotos`, formData);
    await cargar();
  } catch (err) {
    errorFotos.value = err instanceof ApiError ? err.message : 'No se pudo subir la foto.';
  } finally {
    subiendoFoto.value = false;
  }
}

async function eliminarFoto(fotoId) {
  if (!await confirmar('¿Eliminar esta foto? No se puede deshacer.')) return;
  errorFotos.value = '';
  try {
    await api.delete(`/catalogo/productos/fotos/${fotoId}`);
    await cargar();
  } catch (err) {
    errorFotos.value = err instanceof ApiError ? err.message : 'No se pudo eliminar la foto.';
  }
}

// --- Editar producto (código/nombre/descripción + colores existentes) ---
// Mismo formulario que "Producto nuevo", pero precargado con los datos
// actuales. Las variantes que ya existen no se pueden quitar acá (tienen
// pedidos/inventario detrás) — para desactivar un color se usa el toggle
// de las burbujas de abajo; acá solo se corrige texto/precio o se agregan
// colores nuevos.
const productoEnEdicion = ref(null);
const formularioEdicion = reactive({ codigo: '', nombre: '', descripcion: '', cabys: '' });
const variantesEdicion = ref([]);
const guardandoEdicion = ref(false);
const errorEdicion = ref('');

function abrirEdicion(producto) {
  if (productoEnEdicion.value === producto.id) {
    productoEnEdicion.value = null;
    return;
  }
  productoEnEdicion.value = producto.id;
  errorEdicion.value = '';
  productoParaVariante.value = null;
  fotosAbiertas.value = null;
  Object.assign(formularioEdicion, {
    codigo: producto.codigo,
    nombre: producto.nombre,
    descripcion: producto.descripcion ?? '',
    cabys: producto.cabys ?? '',
  });
  variantesEdicion.value = producto.variantes.map((v) => ({
    id: v.id,
    color: v.color,
    precioPorPar: v.precioPorPar,
    costo: v.costo ?? '',
    colorOriginal: v.color,
    precioOriginal: v.precioPorPar,
    costoOriginal: v.costo,
  }));
}

function agregarFilaVarianteEdicion() {
  variantesEdicion.value.push({
    id: null,
    color: '',
    precioPorPar: '',
    costo: '',
    colorOriginal: null,
    precioOriginal: null,
    costoOriginal: null,
  });
}

function quitarFilaVarianteEdicion(index) {
  variantesEdicion.value.splice(index, 1);
}

const edicionValida = computed(() => {
  if (!codigoProductoValido(formularioEdicion.codigo) || !formularioEdicion.nombre.trim() || !cabysValido(formularioEdicion.cabys)) return false;
  return variantesEdicion.value.every((v) => {
    if (!v.id && !v.color.trim() && !v.precioPorPar) return true; // fila nueva vacía, se ignora
    return v.color.trim() && Number(v.precioPorPar) > 0;
  });
});

async function guardarEdicion(producto) {
  if (!edicionValida.value) return;
  errorEdicion.value = '';
  guardandoEdicion.value = true;
  try {
    const codigo = normalizarCodigoProducto(formularioEdicion.codigo);
    const nombre = formularioEdicion.nombre.trim();
    const descripcion = formularioEdicion.descripcion.trim();
    const cabys = formularioEdicion.cabys.trim();
    if (codigo !== producto.codigo || nombre !== producto.nombre || descripcion !== (producto.descripcion ?? '') || cabys !== (producto.cabys ?? '')) {
      await api.patch(`/catalogo/productos/${producto.id}`, { codigo, nombre, descripcion: descripcion || undefined, cabys });
    }

    for (const v of variantesEdicion.value) {
      if (v.id) {
        const colorCambio = v.color.trim() !== v.colorOriginal;
        const precioCambio = Number(v.precioPorPar) !== Number(v.precioOriginal);
        const costoCambio = (v.costo ? Number(v.costo) : null) !== (v.costoOriginal !== null && v.costoOriginal !== undefined ? Number(v.costoOriginal) : null);
        if (colorCambio || precioCambio || costoCambio) {
          await api.patch(`/catalogo/productos/variantes/${v.id}`, {
            color: v.color.trim(),
            precioPorPar: Number(v.precioPorPar),
            costo: v.costo ? Number(v.costo) : undefined,
          });
        }
      } else if (v.color.trim() && Number(v.precioPorPar) > 0) {
        await api.post(`/catalogo/productos/${producto.id}/variantes`, {
          color: v.color.trim(),
          precioPorPar: Number(v.precioPorPar),
          costo: v.costo ? Number(v.costo) : undefined,
        });
      }
    }

    productoEnEdicion.value = null;
    await cargar();
    if (historialAbierto.value === producto.id) await cargarEdiciones(producto.id);
  } catch (err) {
    errorEdicion.value = err instanceof ApiError ? err.message : 'No se pudo guardar la edición.';
  } finally {
    guardandoEdicion.value = false;
  }
}

// --- Historial: quién creó/cambió qué y cuándo ---------------------------
const historialAbierto = ref(null);
const ediciones = ref({});
const cargandoEdiciones = ref(false);

async function alternarHistorial(producto) {
  if (historialAbierto.value === producto.id) {
    historialAbierto.value = null;
    return;
  }
  historialAbierto.value = producto.id;
  if (!ediciones.value[producto.id]) {
    await cargarEdiciones(producto.id);
  }
}

async function cargarEdiciones(productoId) {
  cargandoEdiciones.value = true;
  try {
    const datos = await api.get(`/catalogo/productos/${productoId}/ediciones`);
    ediciones.value = { ...ediciones.value, [productoId]: datos };
  } catch {
    // El historial es informativo — si falla, no bloquea el resto de la página.
  } finally {
    cargandoEdiciones.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-slate-900">Inventario</h1>
      <button type="button" class="btn-primary min-h-11 px-4 text-base" @click="mostrarFormProducto = !mostrarFormProducto">
        <Plus class="size-5" />
        Producto
      </button>
    </div>

    <div v-if="mostrarFormProducto" class="card flex flex-col gap-3">
      <div>
        <label class="label">Código *</label>
        <input
          v-model="nuevoProducto.codigo"
          type="text"
          placeholder="KW 223-1L"
          class="input"
          @blur="nuevoProducto.codigo = normalizarCodigoProducto(nuevoProducto.codigo)"
        />
        <p
          class="mt-1 text-sm"
          :class="nuevoProducto.codigo && !codigoProductoValido(nuevoProducto.codigo) ? 'font-medium text-red-600' : 'text-slate-500'"
        >
          {{ CODIGO_PRODUCTO_AYUDA }}
        </p>
      </div>
      <div>
        <label class="label">Nombre *</label>
        <input v-model="nuevoProducto.nombre" type="text" class="input" />
      </div>
      <div>
        <label class="label">Descripción</label>
        <input v-model="nuevoProducto.descripcion" type="text" class="input" />
      </div>
      <div>
        <label class="label">CABYS (13 dígitos)</label>
        <input v-model="nuevoProducto.cabys" type="text" inputmode="numeric" maxlength="13" class="input" placeholder="Opcional por ahora; Hacienda lo exige al facturar" />
        <p v-if="!cabysValido(nuevoProducto.cabys)" class="mt-1 text-xs font-medium text-red-600">El CABYS tiene 13 dígitos.</p>
      </div>
      <label v-if="auth.esSistema" class="flex items-start gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <input v-model="nuevoProducto.esPrueba" type="checkbox" class="mt-0.5 size-5" />
        <span><b>Producto de prueba</b> (solo el administrador del sistema). Sirve para demostrar todo el proceso en el POS y en los pedidos de tienda: <b>no genera asientos contables</b>, no aparece en los reportes y se puede eliminar junto con todo lo que se hizo con él. No se puede usar en pedidos de vendedores ni en facturas.</span>
      </label>

      <div>
        <label class="label">Colores * (al menos uno)</label>
        <p class="mb-2 text-sm text-slate-500">
          El color es texto libre — sirve igual para un color de catálogo normal que para uno personalizado hecho
          a la medida. El costo es opcional, pero sin costo cargado ese color no tiene piso de margen protegido
          cuando el vendedor dé un descuento.
        </p>
        <div class="flex flex-col gap-2">
          <div v-for="(v, index) in variantesNuevas" :key="index" class="flex items-center gap-2">
            <input v-model="v.color" type="text" placeholder="Color (ej. Rojo, o 'Azul rey personalizado')" class="input flex-1" />
            <input v-model="v.precioPorPar" type="number" min="0" step="0.01" placeholder="₡ venta" class="input w-28" />
            <input v-model="v.costo" type="number" min="0" step="0.01" placeholder="₡ costo" class="input w-28" />
            <button
              type="button"
              class="text-red-600 disabled:opacity-30"
              :disabled="variantesNuevas.length === 1"
              @click="quitarFilaVariante(index)"
            >
              <Trash2 class="size-5" />
            </button>
          </div>
        </div>
        <button type="button" class="mt-2 text-sm font-semibold text-teal-700 underline" @click="agregarFilaVariante">
          + Agregar otro color
        </button>
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      <button type="button" class="btn-primary" :disabled="!productoNuevoValido || guardandoProducto" @click="crearProducto">
        {{ guardandoProducto ? 'Guardando…' : 'Guardar producto' }}
      </button>
    </div>

    <div class="relative">
      <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
      <input
        v-model="textoBusqueda"
        type="text"
        placeholder="Buscar por código, nombre o color…"
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
      {{ productosFiltrados.length }} resultado{{ productosFiltrados.length === 1 ? '' : 's' }} de {{ productos.length }}
    </p>

    <p v-if="error && !mostrarFormProducto" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" />
    <p v-else-if="productosFiltrados.length === 0 && textoBusqueda" class="text-base text-slate-500">
      Ningún producto coincide con "{{ textoBusqueda }}".
    </p>
    <p v-else-if="productosFiltrados.length === 0" class="text-base text-slate-500">Todavía no hay productos.</p>

    <ul v-else class="flex flex-col gap-4">
      <li v-for="producto in productosFiltrados" :key="producto.id" class="card">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">{{ producto.codigo }} — {{ producto.nombre }}<span v-if="producto.esPrueba" class="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white">PRUEBA</span></p>
          <div class="flex shrink-0 items-center gap-3">
            <button type="button" class="flex items-center gap-1 text-sm font-semibold text-slate-600 underline" @click="alternarHistorial(producto)">
              <History class="size-4" />
              Historial
            </button>
            <button type="button" class="flex items-center gap-1 text-sm font-semibold text-purple-700 underline" @click="alternarFotos(producto)">
              <Image class="size-4" />
              Fotos<template v-if="producto.fotos?.length"> ({{ producto.fotos.length }})</template>
            </button>
            <button type="button" class="flex items-center gap-1 text-sm font-semibold text-blue-700 underline" @click="abrirEdicion(producto)">
              <Pencil class="size-4" />
              Editar
            </button>
            <button type="button" class="text-sm font-semibold text-teal-700 underline" @click="abrirFormVariante(producto)">
              + Agregar color
            </button>
            <button v-if="auth.esAdministracion && (!producto.esPrueba || auth.esSistema)" type="button" class="ml-auto flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-sm font-semibold text-red-700 hover:bg-red-50" @click="eliminarProducto(producto)">
              <Trash2 class="size-4" />
              Eliminar
            </button>
          </div>
        </div>

        <!-- Fotos de referencia del producto (no por color) — para mostrarle al cliente -->
        <div v-if="fotosAbiertas === producto.id" class="mb-3 flex flex-col gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div v-if="producto.fotos?.length" class="flex flex-wrap gap-3">
            <div v-for="foto in producto.fotos" :key="foto.id" class="group relative">
              <ImagenConRespaldo :src="urlFoto(foto)" :alt="producto.nombre" texto="Foto no disponible" class="size-24 rounded-lg border border-slate-200 bg-white object-cover" />
              <button
                type="button"
                aria-label="Eliminar foto"
                class="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-700"
                @click="eliminarFoto(foto.id)"
              >
                <X class="size-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-purple-900">Todavía no hay fotos de este producto.</p>

          <p v-if="errorFotos" class="text-sm font-medium text-red-600">{{ errorFotos }}</p>

          <label class="btn-secondary w-fit cursor-pointer text-sm">
            <Upload class="size-4" />
            {{ subiendoFoto ? 'Subiendo…' : 'Subir foto' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="subiendoFoto" @change="subirFoto(producto, $event)" />
          </label>
        </div>

        <!-- Edición completa: código/nombre/descripción + colores existentes, precargados -->
        <div v-if="productoEnEdicion === producto.id" class="mb-3 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div>
            <label class="label">Código *</label>
            <input
              v-model="formularioEdicion.codigo"
              type="text"
              class="input bg-white"
              @blur="formularioEdicion.codigo = normalizarCodigoProducto(formularioEdicion.codigo)"
            />
            <p
              class="mt-1 text-sm"
              :class="!codigoProductoValido(formularioEdicion.codigo) ? 'font-medium text-red-600' : 'text-slate-500'"
            >
              {{ CODIGO_PRODUCTO_AYUDA }}
            </p>
          </div>
          <div>
            <label class="label">Nombre *</label>
            <input v-model="formularioEdicion.nombre" type="text" class="input bg-white" />
          </div>
          <div>
            <label class="label">Descripción</label>
            <input v-model="formularioEdicion.descripcion" type="text" class="input bg-white" />
          </div>
          <div>
            <label class="label">CABYS (13 dígitos)</label>
            <input v-model="formularioEdicion.cabys" type="text" inputmode="numeric" maxlength="13" class="input bg-white" placeholder="Código de Hacienda para la factura electrónica" />
            <p v-if="!cabysValido(formularioEdicion.cabys)" class="mt-1 text-xs font-medium text-red-600">El CABYS tiene 13 dígitos.</p>
          </div>
          <div>
            <label class="label">Colores</label>
            <div class="flex flex-col gap-2">
              <div v-for="(v, index) in variantesEdicion" :key="v.id ?? `nueva-${index}`" class="flex items-center gap-2">
                <input v-model="v.color" type="text" placeholder="Color" class="input flex-1 bg-white" />
                <input v-model="v.precioPorPar" type="number" min="0" step="0.01" placeholder="₡ venta" class="input w-24 bg-white" />
                <input v-model="v.costo" type="number" min="0" step="0.01" placeholder="₡ costo" class="input w-24 bg-white" />
                <button
                  v-if="!v.id"
                  type="button"
                  class="text-red-600"
                  @click="quitarFilaVarianteEdicion(index)"
                >
                  <Trash2 class="size-5" />
                </button>
                <span v-else class="w-5"></span>
              </div>
            </div>
            <button type="button" class="mt-2 text-sm font-semibold text-teal-700 underline" @click="agregarFilaVarianteEdicion">
              + Agregar otro color
            </button>
          </div>
          <p v-if="errorEdicion" class="text-sm font-medium text-red-600">{{ errorEdicion }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary flex-1" @click="productoEnEdicion = null">Cancelar</button>
            <button type="button" class="btn-primary flex-1" :disabled="!edicionValida || guardandoEdicion" @click="guardarEdicion(producto)">
              {{ guardandoEdicion ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </div>
        </div>

        <div v-if="productoParaVariante === producto.id" class="mb-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
          <div class="grid grid-cols-3 gap-2">
            <input v-model="nuevaVariante.color" type="text" placeholder="Color" class="input" />
            <input v-model="nuevaVariante.precioPorPar" type="number" min="0" step="0.01" placeholder="₡ venta" class="input" />
            <input v-model="nuevaVariante.costo" type="number" min="0" step="0.01" placeholder="₡ costo" class="input" />
          </div>
          <button
            type="button"
            class="btn-primary"
            :disabled="!nuevaVariante.color.trim() || !nuevaVariante.precioPorPar || guardandoVariante"
            @click="crearVariante(producto.id)"
          >
            Agregar color
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="variante in producto.variantes"
            :key="variante.id"
            type="button"
            class="rounded-full border-2 px-4 py-2 text-sm font-medium"
            :class="[
              variante.activo ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500 line-through',
              colorCoincide(variante.color) ? 'ring-2 ring-blue-400 ring-offset-1' : '',
            ]"
            @click="alternarVariante(variante)"
          >
            {{ variante.color }} · {{ formatearColones(variante.precioPorPar) }}
            <span v-if="variante.costo" class="text-slate-500">(costo {{ formatearColones(variante.costo) }})</span>
          </button>
        </div>

        <!-- Historial: quién creó/cambió qué y cuándo -->
        <div v-if="historialAbierto === producto.id" class="mt-3 border-t border-slate-200 pt-3">
          <Cargando v-if="cargandoEdiciones && !ediciones[producto.id]" texto="Cargando historial…" compacto />
          <p v-else-if="(ediciones[producto.id]?.length ?? 0) === 0" class="text-sm text-slate-500">Sin cambios registrados.</p>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="edicion in ediciones[producto.id]" :key="edicion.id" class="rounded-xl bg-slate-50 p-3">
              <p class="text-sm font-medium text-slate-900">
                {{ edicion.usuario?.nombre ?? 'Usuario eliminado' }} · {{ formatearFechaHora(edicion.creadoEn) }}
              </p>
              <ul class="mt-1 list-inside list-disc text-sm text-slate-500">
                <li v-for="(cambio, i) in edicion.cambios" :key="i">{{ cambio }}</li>
              </ul>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</template>
