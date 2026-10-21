import { defineStore } from 'pinia';
import { api, clearToken, getToken, setToken } from '../lib/api.js';
import { sesionVencidaPorInactividad } from '../lib/inactividad.js';

const SESSION_KEY = 'conejo-blanco-sesion';

function sesionGuardada() {
  if (!getToken()) return null;
  // El encargado de tienda deja la sesión abierta durante su turno (la terminal también trabaja sin internet): no se cierra por inactividad.
  const guardada = localStorage.getItem(SESSION_KEY);
  const esEncargado = guardada ? JSON.parse(guardada)?.rol === 'encargado_tienda' : false;
  if (!esEncargado && sesionVencidaPorInactividad()) {
    clearToken();
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    usuario: sesionGuardada(),
    // Lo que el administrador del sistema deja ver a todos: módulos habilitados, inactividad, mantenimiento.
    config: { modulos: {}, inactividadMinutos: 10, mantenimiento: { activo: false, mensaje: '' } },
  }),
  getters: {
    autenticado: (state) => Boolean(state.usuario),
    // El administrador del sistema también pasa todo lo de administración.
    esAdministracion: (state) => ['administracion', 'gerente_general', 'sistema'].includes(state.usuario?.rol),
    esGerenteGeneral: (state) => state.usuario?.rol === 'gerente_general',
    // Parámetros de ley: los modifican el gerente general y el administrador del sistema.
    puedeEditarLey: (state) => ['gerente_general', 'sistema'].includes(state.usuario?.rol),
    esSistema: (state) => state.usuario?.rol === 'sistema',
    esVendedor: (state) => state.usuario?.rol === 'vendedor',
    esEncargadoTienda: (state) => state.usuario?.rol === 'encargado_tienda',
    // La tienda asignada a su cuenta (solo el encargado de tienda la tiene).
    tiendaAsignada: (state) => state.usuario?.tienda ?? null,
    // Quién puede abrir el punto de venta: el encargado de tienda y la gerencia (para supervisar o cubrir la caja).
    puedeUsarPOS: (state) => ['encargado_tienda', 'administracion', 'gerente_general', 'sistema'].includes(state.usuario?.rol),
    // Cualquier perfil que NO sea vendedor usa el panel de administración
    // (sidebar) — administración ve todo, contador/asistente ven según
    // sus permisos (ver tienePermiso).
    usaPanelAdmin: (state) => state.usuario && state.usuario.rol !== 'vendedor' && state.usuario.rol !== 'encargado_tienda',
  },
  actions: {
    // Devuelve { requiereDosPasos, ticket } si la cuenta pide el código de la app autenticadora;
    // si no, deja la sesión iniciada.
    async login(email, password) {
      const data = await api.post('/auth/login', { email, password });
      if (data.requiereDosPasos) return data;
      this.iniciarSesion(data);
      return null;
    },
    async loginDosPasos(ticket, codigo) {
      this.iniciarSesion(await api.post('/auth/login-2fa', { ticket, codigo }));
    },
    iniciarSesion(data) {
      setToken(data.accessToken);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.usuario));
      this.usuario = data.usuario;
    },
    guardarUsuario(cambios) {
      this.usuario = { ...this.usuario, ...cambios };
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.usuario));
    },
    async activarDosPasos(codigo) {
      const data = await api.post('/auth/dos-pasos/activar', { codigo });
      setToken(data.accessToken);
      this.guardarUsuario({ totpActivo: true, requiereDosPasos: false });
    },
    async desactivarDosPasos(password, codigo) {
      await api.post('/auth/dos-pasos/desactivar', { password, codigo });
      this.guardarUsuario({ totpActivo: false });
    },
    // Trae de nuevo los permisos de la cuenta (por si el administrador del sistema los cambió).
    async refrescarPerfil() {
      try {
        const me = await api.get('/auth/me');
        this.guardarUsuario({ permisos: me.permisos, rol: me.rol, nombre: me.nombre, tienda: me.tienda ?? null });
      } catch {
        /* si la sesión ya no sirve, api.js avisa y se cierra sola */
      }
    },
    async cargarConfig() {
      try {
        this.config = await api.get('/sistema/publico');
      } catch {
        /* se queda con lo anterior */
      }
    },
    moduloActivo(modulo) {
      return this.usuario?.rol === 'sistema' || this.config.modulos?.[modulo] !== false;
    },
    async cambiarPassword(passwordActual, passwordNueva) {
      const data = await api.patch('/auth/password', { passwordActual, passwordNueva });
      // El cambio invalida los tokens anteriores: el backend manda uno nuevo.
      setToken(data.accessToken);
      this.guardarUsuario({ debeCambiarClave: false });
    },
    logout() {
      clearToken();
      localStorage.removeItem(SESSION_KEY);
      this.usuario = null;
    },
    tienePermiso(permiso) {
      return Boolean(this.usuario?.permisos?.includes(permiso));
    },
  },
});
