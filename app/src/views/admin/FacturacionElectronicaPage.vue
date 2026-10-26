<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { CircleCheck, CircleAlert, FileCheck2, Save } from '@lucide/vue';
import Cargando from '../../components/Cargando.vue';
import { api, ApiError } from '../../lib/api.js';
import { exito, fallo } from '../../lib/avisos.js';
import { confirmar } from '../../lib/confirmar.js';

// Preparación para emitir facturas electrónicas de verdad: datos del emisor, llaves y
// credenciales de Hacienda, correo de entrega y códigos CABYS. Cuando todo está en
// verde, el sistema puede enviar a Hacienda (primero en el ambiente de pruebas).
const prep = ref(null);
const resumen = ref(null);
const productosSinCabys = ref(null);
const cargando = ref(true);
const guardando = ref(false);
const enviando = ref(false);
const error = ref('');
const form = reactive({
  razonSocial: '', nombreComercial: '', cedula: '', tipoIdentificacion: '02', actividadEconomica: '', proveedorSistemas: '',
  provincia: '1', canton: '01', distrito: '01', otrasSenas: '', telefono: '', correo: '', cabysPredeterminado: '', emisionDesde: '',
});

const MODOS = {
  noop: { texto: 'Sin conectar', clase: 'bg-amber-100 text-amber-800' },
  pruebas: { texto: 'Ambiente de pruebas de Hacienda', clase: 'bg-blue-100 text-blue-700' },
  produccion: { texto: 'Producción', clase: 'bg-green-100 text-green-700' },
};

function llenar(p) {
  prep.value = p;
  const d = p.emisor.datos;
  for (const k of Object.keys(form)) form[k] = d[k] ?? '';
}

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [p, r, productos] = await Promise.all([
      api.get('/facturacion-electronica/preparacion'),
      api.get('/facturas/estado-emision'),
      api.get('/catalogo/productos').catch(() => null),
    ]);
    llenar(p);
    resumen.value = r;
    productosSinCabys.value = productos ? productos.filter((x) => x.activo && !x.cabys).length : null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la preparación.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

async function guardar() {
  guardando.value = true;
  error.value = '';
  try {
    llenar(await api.put('/facturacion-electronica/emisor', { ...form, emisionDesde: form.emisionDesde || '' }));
    exito('Datos del emisor guardados.');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron guardar los datos.';
  } finally {
    guardando.value = false;
  }
}

const sinEnviar = computed(() => resumen.value?.cantidades.pendiente_envio ?? 0);
async function enviarPendientes() {
  if (!await confirmar(`¿Enviar a Hacienda las ${sinEnviar.value} facturas pendientes? Una vez recibidas, Hacienda las toma como emitidas en la fecha de cada factura.`, { palabra: 'ENVIAR' })) return;
  enviando.value = true;
  try {
    const r = await api.post('/facturacion-electronica/enviar-pendientes', {});
    exito(`${r.enviadas} de ${r.intentadas} facturas enviadas a Hacienda.`);
    await cargar();
  } catch (err) {
    fallo(err instanceof ApiError ? err.message : 'No se pudieron enviar las facturas.');
  } finally {
    enviando.value = false;
  }
}

const pasos = computed(() => {
  if (!prep.value) return [];
  return [
    { clave: 'emisor', titulo: 'Datos del emisor', ok: prep.value.emisor.faltantes.length === 0, faltantes: prep.value.emisor.faltantes, ayuda: 'Lo que va impreso en el comprobante electrónico. Se completa en el formulario de abajo.' },
    { clave: 'llaves', titulo: 'Llave y credenciales de Hacienda', ok: prep.value.conexion.conectado, faltantes: prep.value.conexion.faltantes, ayuda: 'La llave criptográfica (.p12), su PIN y la contraseña del usuario de la API se descargan de la Oficina Virtual de Hacienda y se cargan como secretos en Google Cloud (ver docs/FACTURACION_ELECTRONICA.md). Nunca se escriben en esta pantalla.' },
    { clave: 'cabys', titulo: 'Códigos CABYS de los productos', ok: productosSinCabys.value === 0, faltantes: productosSinCabys.value ? [`${productosSinCabys.value} producto(s) activos sin CABYS (se usa el predeterminado de abajo)`] : [], ayuda: 'Cada línea de la factura debe llevar el CABYS del producto. Se anota en Inventario → editar producto. Mientras falte, se usa el CABYS predeterminado.' },
    { clave: 'correo', titulo: 'Correo para entregar la factura al cliente', ok: prep.value.correo.configurado, faltantes: prep.value.correo.configurado ? [] : ['Servidor de correo saliente (secreto «cb-smtp-url»)'], ayuda: 'Cuando Hacienda acepta una factura, el sistema envía al cliente el XML firmado y la respuesta de Hacienda. Sin esto la factura igual es válida, pero hay que entregarla a mano.' },
  ];
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <FileCheck2 class="size-5 text-blue-600" />
        <h1 class="text-xl font-bold text-slate-900">Facturación electrónica</h1>
      </div>
      <span v-if="prep" class="rounded-full px-3 py-1 text-sm font-semibold" :class="MODOS[prep.modo].clase">{{ MODOS[prep.modo].texto }}</span>
    </div>
    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <Cargando v-if="cargando" texto="Cargando…" compacto />

    <template v-else-if="prep">
      <p class="text-sm text-slate-600">
        Aquí se prepara todo para que el sistema emita las facturas ante Hacienda por su cuenta. Mientras falte algo, las facturas se crean
        igual y quedan <strong>pendientes de envío</strong>; no son válidas ante Hacienda hasta que se envíen y las acepte.
        Se empieza en el <strong>ambiente de pruebas</strong> de Hacienda y, cuando todo funcione, se pasa a producción.
      </p>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section v-for="p in pasos" :key="p.clave" class="card flex flex-col gap-2">
          <p class="flex items-center gap-2 text-base font-semibold text-slate-900">
            <CircleCheck v-if="p.ok" class="size-5 text-green-600" />
            <CircleAlert v-else class="size-5 text-amber-600" />
            {{ p.titulo }}
            <span class="text-xs font-medium" :class="p.ok ? 'text-green-700' : 'text-amber-700'">{{ p.ok ? 'Listo' : 'Falta' }}</span>
          </p>
          <ul v-if="p.faltantes.length" class="list-inside list-disc text-sm text-amber-800">
            <li v-for="f in p.faltantes" :key="f">{{ f }}</li>
          </ul>
          <p class="text-xs text-slate-500">{{ p.ayuda }}</p>
        </section>
      </div>

      <div class="card flex flex-col gap-3">
        <p class="text-base font-semibold text-slate-900">Datos del emisor</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label class="label">Razón social *</label><input v-model="form.razonSocial" class="input" /></div>
          <div><label class="label">Nombre comercial</label><input v-model="form.nombreComercial" class="input" /></div>
          <div><label class="label">Cédula *</label><input v-model="form.cedula" class="input" inputmode="numeric" /></div>
          <div>
            <label class="label">Tipo de identificación</label>
            <select v-model="form.tipoIdentificacion" class="input">
              <option value="01">Cédula física</option><option value="02">Cédula jurídica</option><option value="03">DIMEX</option><option value="04">NITE</option>
            </select>
          </div>
          <div><label class="label">Actividad económica * (6 dígitos)</label><input v-model="form.actividadEconomica" class="input" inputmode="numeric" maxlength="6" /></div>
          <div><label class="label">Cédula del proveedor de sistemas *</label><input v-model="form.proveedorSistemas" class="input" inputmode="numeric" /></div>
          <div><label class="label">Provincia (1-7)</label><input v-model="form.provincia" class="input" maxlength="1" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">Cantón</label><input v-model="form.canton" class="input" maxlength="2" /></div>
            <div><label class="label">Distrito</label><input v-model="form.distrito" class="input" maxlength="2" /></div>
          </div>
          <div class="sm:col-span-2"><label class="label">Dirección (otras señas) *</label><input v-model="form.otrasSenas" class="input" /></div>
          <div><label class="label">Teléfono</label><input v-model="form.telefono" class="input" /></div>
          <div><label class="label">Correo del emisor *</label><input v-model="form.correo" class="input" type="email" /></div>
          <div>
            <label class="label">CABYS predeterminado * (13 dígitos)</label>
            <input v-model="form.cabysPredeterminado" class="input" inputmode="numeric" maxlength="13" />
            <p class="mt-1 text-xs text-slate-500">Se usa en los productos sin CABYS propio y en las líneas libres.</p>
          </div>
          <div>
            <label class="label">Enviar solas las facturas desde</label>
            <input v-model="form.emisionDesde" class="input" type="date" />
            <p class="mt-1 text-xs text-slate-500">Con conexión lista, las facturas de esta fecha en adelante se envían solas cada 10 minutos. Las anteriores esperan a que usted decida. Vacío = nada se envía solo.</p>
          </div>
        </div>
        <div><button type="button" class="btn-primary" :disabled="guardando" @click="guardar"><Save class="size-4" /> {{ guardando ? 'Guardando…' : 'Guardar datos' }}</button></div>
      </div>

      <div v-if="resumen" class="card flex flex-col gap-2">
        <p class="text-base font-semibold text-slate-900">Facturas por emitir</p>
        <p class="text-sm text-slate-600">
          {{ resumen.cantidades.pendiente_envio }} pendientes de envío · {{ resumen.cantidades.enviada }} en proceso ·
          {{ resumen.cantidades.aceptada }} emitidas · {{ resumen.cantidades.rechazada }} rechazadas.
        </p>
        <div>
          <button type="button" class="btn-secondary" :disabled="enviando || !prep.conexion.conectado || !sinEnviar" @click="enviarPendientes">
            {{ enviando ? 'Enviando…' : `Enviar las ${sinEnviar} pendientes ahora` }}
          </button>
          <p v-if="!prep.conexion.conectado" class="mt-1 text-xs text-slate-500">Disponible cuando la conexión con Hacienda esté lista.</p>
        </div>
      </div>
    </template>
  </div>
</template>
