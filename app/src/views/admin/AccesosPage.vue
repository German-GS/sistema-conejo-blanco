<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { KeyRound, Lock, LockOpen, LogOut, Plus, ShieldCheck, UserX, UserCheck } from '@lucide/vue';
import { api, ApiError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/format.js';
import { descargarArchivo } from '../../lib/api.js';
import { AMBITOS, PERMISOS, ROLES_ASIGNABLES, etiquetaRol, permisosEfectivos } from '../../lib/permisos.js';

const pestana = ref('cuentas');
const usuarios = ref([]);
const empleados = ref([]);
const cargando = ref(true);
const error = ref('');
const credencial = ref(null); // { nombre, email, passwordTemporal } — se muestra una sola vez

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    [usuarios.value, empleados.value] = await Promise.all([api.get('/usuarios'), api.get('/usuarios/empleados-disponibles')]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudieron cargar los accesos.';
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

const bloqueado = (u) => u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date();

// ---- Nuevo acceso ----
const mostrarForm = ref(false);
const guardando = ref(false);
const nuevo = reactive({ origen: 'empleado', empleadoId: '', nombre: '', email: '', rol: 'administracion', password: '' });
const empleadoElegido = computed(() => empleados.value.find((e) => e.id === nuevo.empleadoId));
const formValido = computed(
  () => /^\S+@\S+\.\S+$/.test(nuevo.email.trim()) && (nuevo.origen === 'empleado' ? Boolean(nuevo.empleadoId) : nuevo.nombre.trim().length >= 2) && (!nuevo.password || nuevo.password.length >= 6),
);

async function crear() {
  error.value = '';
  guardando.value = true;
  try {
    const r = await api.post('/usuarios', {
      ...(nuevo.origen === 'empleado' ? { empleadoId: nuevo.empleadoId } : { nombre: nuevo.nombre.trim() }),
      email: nuevo.email.trim(),
      rol: nuevo.rol,
      ...(nuevo.password ? { password: nuevo.password } : {}),
    });
    credencial.value = { nombre: r.usuario.nombre, email: r.usuario.email, passwordTemporal: r.passwordTemporal, venceEn: r.venceEn };
    Object.assign(nuevo, { origen: 'empleado', empleadoId: '', nombre: '', email: '', rol: 'administracion', password: '' });
    mostrarForm.value = false;
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo crear el acceso.';
  } finally {
    guardando.value = false;
  }
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    /* el texto sigue visible para copiarlo a mano */
  }
}

// ---- Acciones por cuenta ----
async function accion(fn, mensajeError) {
  error.value = '';
  try {
    await fn();
    await cargar();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : mensajeError;
  }
}
const alternarActivo = (u) =>
  accion(async () => {
    if (u.activo && !window.confirm(`¿Desactivar el acceso de ${u.nombre}? Se le cierran las sesiones abiertas.`)) return;
    await api.patch(`/usuarios/${u.id}`, { activo: !u.activo });
  }, 'No se pudo actualizar la cuenta.');
const restablecer = (u) =>
  accion(async () => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.nombre}? Se cierran sus sesiones y deberá cambiarla al entrar.`)) return;
    const r = await api.post(`/usuarios/${u.id}/restablecer-clave`, {});
    credencial.value = { nombre: u.nombre, email: u.email, passwordTemporal: r.passwordTemporal, venceEn: r.venceEn };
  }, 'No se pudo restablecer la contraseña.');
const reiniciarDosPasos = (u) =>
  accion(async () => {
    if (!window.confirm(`¿Quitar la verificación en dos pasos de ${u.nombre}? Tendrá que activarla de nuevo con su teléfono.`)) return;
    await api.post(`/usuarios/${u.id}/reiniciar-dos-pasos`, {});
  }, 'No se pudo reiniciar.');
const desbloquear = (u) => accion(() => api.post(`/usuarios/${u.id}/desbloquear`, {}), 'No se pudo desbloquear.');
const cerrarSesiones = (u) =>
  accion(async () => {
    if (!window.confirm(`¿Cerrar todas las sesiones abiertas de ${u.nombre}?`)) return;
    await api.post(`/usuarios/${u.id}/cerrar-sesiones`, {});
  }, 'No se pudieron cerrar las sesiones.');

// ---- Perfil y datos ----
const editandoId = ref(null);
const edicion = reactive({ nombre: '', email: '', rol: '' });
function abrirEdicion(u) {
  editandoId.value = editandoId.value === u.id ? null : u.id;
  Object.assign(edicion, { nombre: u.nombre, email: u.email, rol: u.rol });
}
const guardarEdicion = (u) =>
  accion(async () => {
    await api.patch(`/usuarios/${u.id}`, { nombre: edicion.nombre.trim(), email: edicion.email.trim(), ...(edicion.rol !== u.rol ? { rol: edicion.rol } : {}) });
    editandoId.value = null;
  }, 'No se pudo guardar.');

// ---- Permisos puntuales (contador / asistente) ----
const editandoPermisosId = ref(null);
const seleccion = ref(new Set());
const guardandoPermisos = ref(false);
const errorPermisos = ref('');
// Todas las cuentas del negocio tienen permisos asignables; el vendedor usa su propia pantalla y el sistema siempre tiene todo.
const admitePermisos = (u) => u.rol !== 'vendedor' && u.rol !== 'sistema';
const etiquetaPermiso = (valor) => PERMISOS.find((p) => p.valor === valor)?.etiqueta ?? valor;

function abrirPermisos(u) {
  if (editandoPermisosId.value === u.id) {
    editandoPermisosId.value = null;
    return;
  }
  editandoPermisosId.value = u.id;
  errorPermisos.value = '';
  seleccion.value = permisosEfectivos(u.rol, u.permisos ?? []);
}
function alternarPermiso(valor) {
  const nueva = new Set(seleccion.value);
  if (nueva.has(valor)) nueva.delete(valor);
  else nueva.add(valor);
  seleccion.value = nueva;
}
async function guardarPermisos(u) {
  errorPermisos.value = '';
  guardandoPermisos.value = true;
  try {
    const defecto = permisosEfectivos(u.rol, []);
    // Solo se mandan los que DIFIEREN del perfil: lista vacía = "usa el set de su perfil".
    const overrides = PERMISOS.filter((p) => seleccion.value.has(p.valor) !== defecto.has(p.valor)).map((p) => ({ permiso: p.valor, concedido: seleccion.value.has(p.valor) }));
    await api.patch(`/usuarios/${u.id}/permisos`, { permisos: overrides });
    editandoPermisosId.value = null;
    await cargar();
  } catch (err) {
    errorPermisos.value = err instanceof ApiError ? err.message : 'No se pudieron guardar los permisos.';
  } finally {
    guardandoPermisos.value = false;
  }
}

// ---- Bitácora ----
const ACCIONES = {
  login_ok: 'Inicio de sesión',
  login_fallido: 'Intento fallido',
  login_bloqueado: 'Intento con cuenta bloqueada',
  cuenta_bloqueada: 'Cuenta bloqueada',
  clave_cambiada: 'Cambió su contraseña',
  usuario_creado: 'Cuenta creada',
  usuario_editado: 'Datos editados',
  rol_cambiado: 'Perfil cambiado',
  usuario_activado: 'Cuenta activada',
  usuario_desactivado: 'Cuenta desactivada',
  clave_restablecida: 'Contraseña restablecida',
  usuario_desbloqueado: 'Cuenta desbloqueada',
  sesiones_cerradas: 'Sesiones cerradas',
  permisos_cambiados: 'Permisos cambiados',
  dos_pasos_activado: 'Activó verificación en dos pasos',
  dos_pasos_desactivado: 'Desactivó verificación en dos pasos',
  dos_pasos_reiniciado: 'Reinició la verificación en dos pasos',
  dos_pasos_fallido: 'Código de dos pasos incorrecto',
  ip_no_permitida: 'Ingreso desde IP no permitida',
  analisis_enlace_generado: 'Clave de datos (Power BI) generada',
  analisis_enlace_revocado: 'Clave de datos (Power BI) revocada',
};
const eventos = ref([]);
const filtro = reactive({ accion: '', texto: '' });
const cargandoBitacora = ref(false);
async function cargarBitacora() {
  cargandoBitacora.value = true;
  try {
    const q = new URLSearchParams({ limite: '300' });
    if (filtro.accion) q.set('accion', filtro.accion);
    if (filtro.texto.trim()) q.set('texto', filtro.texto.trim());
    eventos.value = await api.get(`/usuarios/bitacora?${q}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo cargar la bitácora.';
  } finally {
    cargandoBitacora.value = false;
  }
}
async function bajarBitacora() {
  try {
    const q = new URLSearchParams();
    if (filtro.accion) q.set('accion', filtro.accion);
    if (filtro.texto.trim()) q.set('texto', filtro.texto.trim());
    await descargarArchivo(`/usuarios/bitacora/excel?${q}`, 'bitacora-accesos.xlsx');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No se pudo descargar.';
  }
}
function verPestana(p) {
  pestana.value = p;
  if (p === 'bitacora') cargarBitacora();
}
const esFallo = (a) => ['login_fallido', 'login_bloqueado', 'cuenta_bloqueada', 'dos_pasos_fallido', 'ip_no_permitida'].includes(a);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2"><ShieldCheck class="size-5 text-blue-600" /><h1 class="text-xl font-bold text-slate-900">Control de accesos</h1></div>
      <button v-if="pestana === 'cuentas'" type="button" class="btn-primary min-h-11 px-4 text-base" @click="mostrarForm = !mostrarForm"><Plus class="size-5" /> Nuevo acceso</button>
    </div>
    <p class="text-sm text-slate-500">
      Los empleados de planilla no tienen acceso al sistema: solo entra quien tenga una cuenta creada acá. Este módulo es exclusivo del administrador del sistema.
    </p>

    <div class="flex gap-2">
      <button v-for="p in [['cuentas', 'Cuentas'], ['bitacora', 'Bitácora']]" :key="p[0]" type="button" class="rounded-lg border px-3 py-1.5 text-sm font-semibold" :class="pestana === p[0] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'" @click="verPestana(p[0])">{{ p[1] }}</button>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>

    <div v-if="credencial" class="card border-2 border-amber-300 bg-amber-50">
      <p class="text-sm text-slate-700">
        Acceso de <strong>{{ credencial.nombre }}</strong> — la contraseña temporal se muestra solo ahora. Pásasela por un medio seguro; es solo para el primer ingreso: al entrar elige la suya.{{ credencial.venceEn ? ` Esta clave vence el ${formatearFechaHora(credencial.venceEn)}.` : '' }}
      </p>
      <p class="mt-2 text-sm text-slate-600">Correo: <span class="select-all font-mono font-semibold text-slate-900">{{ credencial.email }}</span></p>
      <p class="my-1 select-all font-mono text-xl font-bold tracking-wide text-slate-900">{{ credencial.passwordTemporal }}</p>
      <div class="mt-2 flex gap-2">
        <button type="button" class="btn-secondary flex-1" @click="copiar(credencial.passwordTemporal)">Copiar clave</button>
        <button type="button" class="btn-primary flex-1" @click="credencial = null">Listo</button>
      </div>
    </div>

    <template v-if="pestana === 'cuentas'">
      <div v-if="mostrarForm" class="card flex flex-col gap-3">
        <div class="flex gap-4 text-sm">
          <label class="flex items-center gap-2"><input v-model="nuevo.origen" type="radio" value="empleado" /> Empleado de planilla</label>
          <label class="flex items-center gap-2"><input v-model="nuevo.origen" type="radio" value="externo" /> Persona externa (ej. contador)</label>
        </div>
        <div v-if="nuevo.origen === 'empleado'">
          <label class="label">Empleado *</label>
          <select v-model="nuevo.empleadoId" class="input">
            <option value="">Elegí un empleado sin acceso…</option>
            <option v-for="e in empleados" :key="e.id" :value="e.id">{{ e.nombre }}{{ e.puesto ? ` — ${e.puesto}` : '' }}</option>
          </select>
          <p v-if="empleadoElegido" class="mt-1 text-xs text-slate-500">El nombre y el vínculo se toman del empleado{{ empleadoElegido.cedula ? ` (cédula ${empleadoElegido.cedula})` : '' }}. Si deja la empresa, su acceso se desactiva solo.</p>
        </div>
        <div v-else><label class="label">Nombre *</label><input v-model="nuevo.nombre" class="input" /></div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label class="label">Correo (con el que entra) *</label><input v-model="nuevo.email" type="email" class="input" /></div>
          <div>
            <label class="label">Perfil</label>
            <select v-model="nuevo.rol" class="input"><option v-for="r in ROLES_ASIGNABLES" :key="r.valor" :value="r.valor">{{ r.etiqueta }}</option></select>
          </div>
        </div>
        <div>
          <label class="label">Contraseña temporal <span class="font-normal text-slate-500">(opcional: si la dejás vacía el sistema genera una fácil de dictar, como Conejo-4821)</span></label>
          <input v-model="nuevo.password" type="text" class="input" placeholder="Cualquiera de 6 o más caracteres; la persona la cambia al entrar" />
        </div>
        <button type="button" class="btn-primary" :disabled="!formValido || guardando" @click="crear">{{ guardando ? 'Creando…' : 'Crear acceso' }}</button>
      </div>

      <p v-if="cargando" class="text-base text-slate-500">Cargando…</p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="u in usuarios" :key="u.id" class="card">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-base font-semibold text-slate-900">
                {{ u.nombre }}
                <span v-if="u.rol === 'sistema'" class="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">Administrador del sistema</span>
              </p>
              <p class="text-sm text-slate-500">{{ u.email }} · {{ etiquetaRol(u.rol) }}</p>
              <p class="text-xs text-slate-500">
                {{ u.empleado ? `Empleado de planilla: ${u.empleado.nombre}` : 'Sin empleado vinculado' }} ·
                {{ u.ultimoAcceso ? `último acceso ${formatearFechaHora(u.ultimoAcceso)}` : 'nunca ha entrado' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span class="rounded-full px-2 py-1" :class="u.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'">{{ u.activo ? 'Activo' : 'Inactivo' }}</span>
              <span v-if="bloqueado(u)" class="rounded-full bg-red-100 px-2 py-1 text-red-700">Bloqueado</span>
              <span v-if="u.debeCambiarClave" class="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Clave temporal</span>
              <span v-if="u.totpActivo" class="rounded-full bg-blue-100 px-2 py-1 text-blue-800">2 pasos</span>
            </div>
          </div>

          <div v-if="u.rol !== 'sistema'" class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
            <button type="button" class="text-blue-700 underline" @click="abrirEdicion(u)">Editar / perfil</button>
            <button v-if="admitePermisos(u)" type="button" class="flex items-center gap-1 text-blue-700 underline" @click="abrirPermisos(u)"><ShieldCheck class="size-4" /> Permisos</button>
            <button type="button" class="flex items-center gap-1 text-blue-700 underline" @click="restablecer(u)"><KeyRound class="size-4" /> Restablecer clave</button>
            <button v-if="bloqueado(u)" type="button" class="flex items-center gap-1 text-blue-700 underline" @click="desbloquear(u)"><LockOpen class="size-4" /> Desbloquear</button>
            <button v-if="u.totpActivo" type="button" class="flex items-center gap-1 text-blue-700 underline" @click="reiniciarDosPasos(u)"><KeyRound class="size-4" /> Reiniciar 2 pasos</button>
            <button type="button" class="flex items-center gap-1 text-blue-700 underline" @click="cerrarSesiones(u)"><LogOut class="size-4" /> Cerrar sesiones</button>
            <button type="button" class="flex items-center gap-1 underline" :class="u.activo ? 'text-red-700' : 'text-green-700'" @click="alternarActivo(u)">
              <component :is="u.activo ? UserX : UserCheck" class="size-4" /> {{ u.activo ? 'Desactivar' : 'Activar' }}
            </button>
          </div>
          <p v-else class="mt-2 text-xs text-slate-500"><Lock class="inline size-3.5" /> Esta cuenta no se desactiva ni cambia de perfil desde la app; su clave la cambia su dueño con el ícono de llave.</p>

          <div v-if="editandoId === u.id" class="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <input v-model="edicion.nombre" class="input" placeholder="Nombre" />
            <input v-model="edicion.email" type="email" class="input" placeholder="Correo" />
            <select v-model="edicion.rol" class="input"><option v-for="r in ROLES_ASIGNABLES" :key="r.valor" :value="r.valor">{{ r.etiqueta }}</option></select>
            <div class="flex gap-2 sm:col-span-3">
              <button type="button" class="btn-secondary flex-1" @click="editandoId = null">Cancelar</button>
              <button type="button" class="btn-primary flex-1" @click="guardarEdicion(u)">Guardar</button>
            </div>
          </div>

          <div v-if="editandoPermisosId === u.id" class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="mb-3 text-sm text-slate-600">Qué funciones tiene {{ u.nombre }} — parte del perfil "{{ etiquetaRol(u.rol) }}", ajustado acá si hace falta.</p>
            <div v-for="a in AMBITOS" :key="a.titulo" class="mb-3">
              <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{{ a.titulo }}</p>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label v-for="v in a.valores" :key="v" class="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" class="mt-0.5 size-4" :checked="seleccion.has(v)" @change="alternarPermiso(v)" /> {{ etiquetaPermiso(v) }}
                </label>
              </div>
            </div>
            <p class="text-xs text-slate-500">Solo son funciones de la gestión y administración de la empresa. El control de accesos, los registros y el panel del sistema son exclusivos del administrador del sistema y no se asignan.</p>
            <p v-if="errorPermisos" class="mt-3 text-sm font-medium text-red-600">{{ errorPermisos }}</p>
            <div class="mt-3 flex gap-2">
              <button type="button" class="btn-secondary flex-1" @click="editandoPermisosId = null">Cancelar</button>
              <button type="button" class="btn-primary flex-1" :disabled="guardandoPermisos" @click="guardarPermisos(u)">{{ guardandoPermisos ? 'Guardando…' : 'Guardar permisos' }}</button>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <template v-else>
      <div class="card flex flex-wrap items-end gap-3">
        <div>
          <label class="label">Acción</label>
          <select v-model="filtro.accion" class="input" @change="cargarBitacora">
            <option value="">Todas</option>
            <option v-for="(etiqueta, clave) in ACCIONES" :key="clave" :value="clave">{{ etiqueta }}</option>
          </select>
        </div>
        <div class="min-w-56 flex-1"><label class="label">Buscar (correo, detalle)</label><input v-model="filtro.texto" class="input" @keyup.enter="cargarBitacora" /></div>
        <button type="button" class="btn-secondary" @click="cargarBitacora">Buscar</button>
        <button type="button" class="btn-secondary" @click="bajarBitacora">Descargar Excel</button>
      </div>
      <p v-if="cargandoBitacora" class="text-sm text-slate-500">Cargando…</p>
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[44rem] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-500"><th class="py-1 pr-2">Fecha</th><th class="py-1 pr-2">Acción</th><th class="py-1 pr-2">Quién</th><th class="py-1 pr-2">Sobre</th><th class="py-1 pr-2">Detalle</th><th class="py-1">IP</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in eventos" :key="e.id" class="border-b border-slate-100 align-top">
              <td class="py-1 pr-2 whitespace-nowrap">{{ formatearFechaHora(e.creadoEn) }}</td>
              <td class="py-1 pr-2 whitespace-nowrap font-medium" :class="esFallo(e.accion) ? 'text-red-700' : 'text-slate-900'">{{ ACCIONES[e.accion] ?? e.accion }}</td>
              <td class="py-1 pr-2">{{ e.usuarioEmail }}</td>
              <td class="py-1 pr-2 text-slate-600">{{ e.objetivo }}</td>
              <td class="py-1 pr-2 text-slate-600">{{ e.detalle }}</td>
              <td class="py-1 font-mono text-xs text-slate-500">{{ e.ip }}</td>
            </tr>
            <tr v-if="!eventos.length && !cargandoBitacora"><td colspan="6" class="py-3 text-slate-500">Sin eventos.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
