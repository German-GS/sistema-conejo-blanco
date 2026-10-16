<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Server } from '@lucide/vue';
import { api, ApiError, descargarArchivo } from '../../lib/api.js';
import { fechaHoyISO, formatearFechaHora } from '../../lib/format.js';

const pestana = ref('actividad');
const error = ref('');
const aviso = ref('');
const m = (n) => new Intl.NumberFormat('es-CR').format(n);

// ---- Actividad ----
const AREAS = { accesos: 'Accesos', administrativa: 'Administrativa', ventas: 'Ventas', inventario: 'Inventario', sistema: 'Sistema', otros: 'Otros' };
const hoy = fechaHoyISO();
const filtro = reactive({ desde: hoy, hasta: hoy, area: '', metodo: '', estado: '', texto: '' });
const actividad = ref({ total: 0, pagina: 1, limite: 100, filas: [] });
const cargandoActividad = ref(false);
const abierta = ref(null);
const paginas = computed(() => Math.max(1, Math.ceil(actividad.value.total / actividad.value.limite)));

function consulta(extra = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filtro, ...extra })) if (v) q.set(k, v);
  return q;
}
async function cargarActividad(pagina = 1) {
  cargandoActividad.value = true;
  error.value = '';
  try {
    actividad.value = await api.get(`/sistema/actividad?${consulta({ pagina, limite: 100 })}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la actividad.';
  } finally {
    cargandoActividad.value = false;
  }
}
async function descargarActividad(area) {
  error.value = '';
  try {
    await descargarArchivo(`/sistema/actividad/excel?${consulta(area ? { area } : {})}`, `actividad-${area ?? 'todo'}.xlsx`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}
async function descargarAccesos() {
  try {
    await descargarArchivo('/usuarios/bitacora/excel', 'bitacora-accesos.xlsx');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}
const colorEstado = (e) => (e >= 500 ? 'text-red-700' : e >= 400 ? 'text-amber-700' : 'text-green-700');

// ---- Configuración (seguridad, módulos, mantenimiento) ----
const cfg = ref(null);
const editado = reactive({});
async function cargarConfig() {
  cfg.value = await api.get('/sistema/configuracion');
  const a = cfg.value.ajustes;
  Object.assign(editado, {
    'seguridad.clave_largo_minimo': a['seguridad.clave_largo_minimo'],
    'seguridad.clave_temporal_horas': a['seguridad.clave_temporal_horas'],
    'seguridad.intentos_maximos': a['seguridad.intentos_maximos'],
    'seguridad.bloqueo_minutos': a['seguridad.bloqueo_minutos'],
    'seguridad.sesion_horas': a['seguridad.sesion_horas'],
    'seguridad.inactividad_minutos': a['seguridad.inactividad_minutos'],
    'seguridad.sistema_ips': a['seguridad.sistema_ips'],
    'mantenimiento.mensaje': a['mantenimiento.mensaje'],
  });
}
async function guardar(clave, valor, mensaje = 'Guardado.') {
  error.value = '';
  aviso.value = '';
  try {
    await api.patch('/sistema/configuracion', { clave, valor });
    aviso.value = mensaje;
    await cargarConfig();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo guardar.';
  }
}
const POLITICAS = [
  { clave: 'seguridad.clave_largo_minimo', etiqueta: 'Largo mínimo de la contraseña', ayuda: 'Caracteres (8 a 64).' },
  { clave: 'seguridad.clave_temporal_horas', etiqueta: 'Vigencia de la clave temporal', ayuda: 'Horas que sirve la clave de una cuenta nueva o restablecida (1 a 720).' },
  { clave: 'seguridad.intentos_maximos', etiqueta: 'Intentos fallidos antes de bloquear la cuenta', ayuda: '3 a 20.' },
  { clave: 'seguridad.bloqueo_minutos', etiqueta: 'Minutos de bloqueo', ayuda: '1 a 1440.' },
  { clave: 'seguridad.sesion_horas', etiqueta: 'Duración de la sesión', ayuda: 'Horas (1 a 72). Aplica a las sesiones nuevas.' },
  { clave: 'seguridad.inactividad_minutos', etiqueta: 'Cierre por inactividad', ayuda: 'Minutos sin usar la pantalla (2 a 240).' },
];
const PERFILES = [
  ['sistema', 'Administrador del sistema'],
  ['gerente_general', 'Gerente general'],
  ['administracion', 'Administración'],
  ['contador', 'Contador'],
  ['asistente', 'Asistente'],
  ['vendedor', 'Vendedor'],
];
const dosPasosRoles = computed(() => cfg.value?.ajustes['seguridad.dos_pasos_roles'] ?? []);
function alternarPerfil(r) {
  const nuevo = dosPasosRoles.value.includes(r) ? dosPasosRoles.value.filter((x) => x !== r) : [...dosPasosRoles.value, r];
  guardar('seguridad.dos_pasos_roles', nuevo, 'Guardado: quienes tengan esos perfiles deberán activar la verificación al próximo ingreso.');
}
async function mantenimiento(activo) {
  if (activo && !window.confirm('Con el mantenimiento activo nadie más puede entrar ni usar el sistema (tampoco quienes están conectados). ¿Activarlo?')) return;
  await guardar('mantenimiento.activo', activo, activo ? 'Mantenimiento activado.' : 'Mantenimiento desactivado.');
}

// ---- Datos ----
async function exportarTodo() {
  error.value = '';
  aviso.value = 'Generando la exportación…';
  try {
    await descargarArchivo('/sistema/exportar', 'datos-conejo-blanco.xlsx');
    aviso.value = 'Exportación descargada.';
  } catch (err) {
    aviso.value = '';
    error.value = err instanceof ApiError ? err.message : 'No se pudo exportar.';
  }
}

function ver(p) {
  pestana.value = p;
  error.value = aviso.value = '';
  if (p === 'actividad') cargarActividad();
  if (p === 'seguridad' || p === 'modulos') cargarConfig();
}
onMounted(() => {
  cargarActividad();
  cargarConfig();
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2"><Server class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Sistema</h1></div>
    <p class="text-sm text-slate-500">Panel del administrador del sistema. Nadie más ve esta sección ni lo que se registra en ella.</p>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in [['actividad', 'Actividad y registros'], ['seguridad', 'Seguridad'], ['modulos', 'Módulos y mantenimiento'], ['datos', 'Datos']]"
        :key="p[0]"
        type="button"
        class="rounded-lg border px-3 py-1.5 text-sm font-semibold"
        :class="pestana === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'"
        @click="ver(p[0])"
      >
        {{ p[1] }}
      </button>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
    <p v-if="aviso" class="text-sm font-medium text-green-700">{{ aviso }}</p>

    <!-- ACTIVIDAD -->
    <template v-if="pestana === 'actividad'">
      <div class="card flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div><label class="label">Desde</label><input v-model="filtro.desde" type="date" class="input" /></div>
          <div><label class="label">Hasta</label><input v-model="filtro.hasta" type="date" class="input" /></div>
          <div>
            <label class="label">Área</label>
            <select v-model="filtro.area" class="input"><option value="">Todas</option><option v-for="(e, k) in AREAS" :key="k" :value="k">{{ e }}</option></select>
          </div>
          <div>
            <label class="label">Método</label>
            <select v-model="filtro.metodo" class="input"><option value="">Todos</option><option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select>
          </div>
          <div>
            <label class="label">Resultado</label>
            <select v-model="filtro.estado" class="input"><option value="">Todos</option><option value="ok">Correctos</option><option value="error">Con error</option><option value="403">Denegados (403)</option><option value="5xx">Errores del servidor</option></select>
          </div>
          <div><label class="label">Buscar</label><input v-model="filtro.texto" class="input" placeholder="correo, ruta, mensaje…" @keyup.enter="cargarActividad(1)" /></div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" @click="cargarActividad(1)">Buscar</button>
          <button type="button" class="btn-secondary" @click="descargarActividad()">Descargar (filtro actual)</button>
          <button type="button" class="btn-secondary" @click="descargarActividad('administrativa')">Descargar área administrativa</button>
          <button type="button" class="btn-secondary" @click="descargarActividad('accesos')">Descargar área de accesos</button>
          <button type="button" class="btn-secondary" @click="descargarAccesos">Descargar bitácora de accesos</button>
        </div>
        <p class="text-xs text-slate-500">
          Se registran todos los cambios (crear, modificar, borrar), las consultas de datos sensibles y descargas, y cualquier error o acceso denegado. Las claves y códigos nunca se guardan.
          Los registros se conservan 18 meses.
        </p>
      </div>

      <p v-if="cargandoActividad" class="text-sm text-slate-500">Cargando…</p>
      <div class="card overflow-x-auto">
        <p class="mb-2 text-sm text-slate-600">{{ m(actividad.total) }} registro(s) · página {{ actividad.pagina }} de {{ paginas }}</p>
        <table class="w-full min-w-[56rem] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
              <th class="py-1 pr-2">Fecha</th><th class="py-1 pr-2">Usuario</th><th class="py-1 pr-2">Área</th><th class="py-1 pr-2">Método</th><th class="py-1 pr-2">Ruta</th><th class="py-1 pr-2">Estado</th><th class="py-1">IP</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="a in actividad.filas" :key="a.id">
              <tr class="cursor-pointer border-b border-slate-100 align-top hover:bg-slate-50" @click="abierta = abierta === a.id ? null : a.id">
                <td class="py-1 pr-2 whitespace-nowrap">{{ formatearFechaHora(a.creadoEn) }}</td>
                <td class="py-1 pr-2">{{ a.usuarioEmail || '—' }}<span v-if="a.rol" class="text-xs text-slate-400"> · {{ a.rol }}</span></td>
                <td class="py-1 pr-2">{{ AREAS[a.area] ?? a.area }}</td>
                <td class="py-1 pr-2 font-mono text-xs">{{ a.metodo }}</td>
                <td class="max-w-xs truncate py-1 pr-2 font-mono text-xs" :title="a.ruta">{{ a.ruta }}</td>
                <td class="py-1 pr-2 font-semibold" :class="colorEstado(a.estado)">{{ a.estado }}</td>
                <td class="py-1 font-mono text-xs text-slate-500">{{ a.ip }}</td>
              </tr>
              <tr v-if="abierta === a.id" class="bg-slate-50">
                <td colspan="7" class="px-2 py-2 text-xs text-slate-700">
                  <p v-if="a.mensaje" class="mb-1 font-semibold text-red-700">{{ a.mensaje }}</p>
                  <pre v-if="a.detalle" class="mb-1 overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(a.detalle, null, 2) }}</pre>
                  <p class="text-slate-500">{{ a.duracionMs }} ms · {{ a.agente }}</p>
                </td>
              </tr>
            </template>
            <tr v-if="!actividad.filas.length && !cargandoActividad"><td colspan="7" class="py-3 text-slate-500">Sin registros con ese filtro.</td></tr>
          </tbody>
        </table>
        <div class="mt-3 flex gap-2">
          <button type="button" class="btn-secondary" :disabled="actividad.pagina <= 1" @click="cargarActividad(actividad.pagina - 1)">← Anterior</button>
          <button type="button" class="btn-secondary" :disabled="actividad.pagina >= paginas" @click="cargarActividad(actividad.pagina + 1)">Siguiente →</button>
        </div>
      </div>
    </template>

    <!-- SEGURIDAD -->
    <template v-if="pestana === 'seguridad' && cfg">
      <div class="card flex flex-col gap-3">
        <p class="text-base font-semibold text-slate-900">Políticas de contraseñas y sesiones</p>
        <div v-for="p in POLITICAS" :key="p.clave" class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <div class="min-w-64 flex-1"><p class="text-sm font-medium text-slate-800">{{ p.etiqueta }}</p><p class="text-xs text-slate-500">{{ p.ayuda }}</p></div>
          <input v-model.number="editado[p.clave]" type="number" class="input w-28" />
          <button type="button" class="btn-secondary" :disabled="editado[p.clave] === cfg.ajustes[p.clave]" @click="guardar(p.clave, Number(editado[p.clave]))">Guardar</button>
        </div>
      </div>

      <div class="card flex flex-col gap-3">
        <div>
          <p class="text-base font-semibold text-slate-900">Verificación en dos pasos obligatoria</p>
          <p class="text-sm text-slate-500">Quienes tengan estos perfiles deben activarla (con una app autenticadora) para poder seguir usando el sistema. Cada persona puede activarla por su cuenta aunque su perfil no la exija.</p>
        </div>
        <div class="flex flex-wrap gap-4">
          <label v-for="r in PERFILES" :key="r[0]" class="flex items-center gap-2 text-sm"><input type="checkbox" class="size-4" :checked="dosPasosRoles.includes(r[0])" @change="alternarPerfil(r[0])" /> {{ r[1] }}</label>
        </div>
      </div>

      <div class="card flex flex-col gap-2">
        <div>
          <p class="text-base font-semibold text-slate-900">Direcciones IP de la cuenta del sistema</p>
          <p class="text-sm text-slate-500">Si escribís direcciones (separadas por comas), la cuenta del administrador del sistema solo podrá iniciar sesión desde ellas. Vacío = desde cualquier lugar. Ojo: si cambia tu IP y no la agregás, solo se recupera con la variable de emergencia del servidor.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input v-model="editado['seguridad.sistema_ips']" class="input min-w-64 flex-1" placeholder="190.10.20.30, 190.10.20.31" />
          <button type="button" class="btn-secondary" :disabled="editado['seguridad.sistema_ips'] === cfg.ajustes['seguridad.sistema_ips']" @click="guardar('seguridad.sistema_ips', editado['seguridad.sistema_ips'])">Guardar</button>
        </div>
      </div>
    </template>

    <!-- MÓDULOS Y MANTENIMIENTO -->
    <template v-if="pestana === 'modulos' && cfg">
      <div class="card flex flex-col gap-2">
        <div>
          <p class="text-base font-semibold text-slate-900">Módulos habilitados</p>
          <p class="text-sm text-slate-500">Un módulo apagado desaparece del menú y deja de responder para todos menos para el administrador del sistema.</p>
        </div>
        <label v-for="mod in cfg.modulos" :key="mod.clave" class="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm">
          <span class="text-slate-800">{{ mod.etiqueta }}</span>
          <span class="flex items-center gap-2">
            <span class="text-xs font-semibold" :class="cfg.ajustes[`modulo.${mod.clave}`] ? 'text-green-700' : 'text-red-700'">{{ cfg.ajustes[`modulo.${mod.clave}`] ? 'Activo' : 'Apagado' }}</span>
            <input type="checkbox" class="size-5" :checked="cfg.ajustes[`modulo.${mod.clave}`]" @change="guardar(`modulo.${mod.clave}`, !cfg.ajustes[`modulo.${mod.clave}`])" />
          </span>
        </label>
      </div>

      <div class="card flex flex-col gap-3" :class="cfg.ajustes['mantenimiento.activo'] ? 'border-amber-300 bg-amber-50' : ''">
        <div>
          <p class="text-base font-semibold text-slate-900">Modo mantenimiento</p>
          <p class="text-sm text-slate-500">Bloquea el sistema para todos menos para vos (por ejemplo, mientras se actualiza). Quienes estén conectados ven el mensaje de abajo.</p>
        </div>
        <input v-model="editado['mantenimiento.mensaje']" class="input" maxlength="300" />
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" :disabled="editado['mantenimiento.mensaje'] === cfg.ajustes['mantenimiento.mensaje']" @click="guardar('mantenimiento.mensaje', editado['mantenimiento.mensaje'])">Guardar mensaje</button>
          <button v-if="!cfg.ajustes['mantenimiento.activo']" type="button" class="btn-danger" @click="mantenimiento(true)">Activar mantenimiento</button>
          <button v-else type="button" class="btn-primary" @click="mantenimiento(false)">Desactivar mantenimiento</button>
        </div>
      </div>
    </template>

    <!-- DATOS -->
    <template v-if="pestana === 'datos'">
      <div class="card flex flex-col gap-3">
        <div>
          <p class="text-base font-semibold text-slate-900">Exportar todos los datos</p>
          <p class="text-sm text-slate-500">Un Excel con una hoja por tabla de la base de datos (pedidos, facturas, asientos, planilla, etc.). No incluye contraseñas ni secretos. Queda registrado en la actividad.</p>
        </div>
        <button type="button" class="btn-primary w-fit" @click="exportarTodo">Descargar exportación completa</button>
        <p class="text-xs text-slate-500">Los respaldos automáticos de la base los administra Google Cloud (diarios, 14 copias y recuperación a un punto en el tiempo).</p>
      </div>
    </template>
  </div>
</template>
