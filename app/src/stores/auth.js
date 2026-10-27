import { defineStore } from 'pinia';
import { api, ApiError, clearToken, getToken, setToken } from '../lib/api.js';
import { borrarCredencial, guardarCredencial, verificarCredencial } from '../lib/loginLocal.js';
import { registrarActividad } from '../lib/actividad.js';
import { sesionVencidaPorInactividad } from '../lib/inactividad.js';

const SESSION_KEY = 'conejo-blanco-sesion';
// Sesión sin internet (solo encargado de tienda): hay usuario pero no token; el POS sigue trabajando y se vuelve a confirmar la
// contraseña cuando regrese la conexión para poder enviar lo pendiente.
const LOCAL_KEY = 'conejo-blanco-sesion-local';
let contrasenaEnMemoria = null;

const esSesionLocal = () => !getToken() && localStorage.getItem(LOCAL_KEY) === '1';

function sesionGuardada() {
  if (!getToken() && !esSesionLocal()) return null;
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
    sesionLocal: esSesionLocal(),
    // Lo que el administrador del sistema deja ver a todos: módulos habilitados, inactividad, mantenimiento.
    config: { modulos: {}, inactividadMinutos: 10, mantenimiento: { activo: false, mensaje: '' } },
  }),
  getters: {
    autenticado: (state) => Boolean(state.usuario),
    // El administrador del sistema también pasa todo lo de administración.
    esAdministracion: (state) => ['administracion', 'gerente_general', 'sistema'].includes(state.usuario?.rol),
    esGerenteGeneral: (state) => state.usuario?.rol === 'gerente_general',
    // Quien puede anotar marcas a mano mientras el reloj no funciona: administrador del sistema y gerencia general.
    puedeAnotarMarcas: (state) => ['sistema', 'gerente_general'].includes(state.usuario?.rol),
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
      let data;
      try {
        data = await api.post('/auth/login', { email, password });
      } catch (err) {
        // Sin internet: el encargado de tienda entra con la huella guardada en esta computadora.
        if (err instanceof ApiError && err.status === 0) return this.loginSinInternet(email, password);
        // El servidor ya no acepta esa contraseña (la cambiaron o la cuenta se desactivó): ya no sirve para entrar sin internet.
        if (err instanceof ApiError && err.status === 401) void borrarCredencial(email);
        throw err;
      }
      if (data.requiereDosPasos) return data;
      this.iniciarSesion(data);
      if (data.usuario?.rol === 'encargado_tienda') void guardarCredencial(email, password, data.usuario);
      return null;
    },
    async loginSinInternet(email, password) {
      const r = await verificarCredencial(email, password);
      if (r.error) throw new ApiError(r.error, 401);
      clearToken();
      localStorage.setItem(SESSION_KEY, JSON.stringify(r.usuario));
      localStorage.setItem(LOCAL_KEY, '1');
      contrasenaEnMemoria = password;
      this.usuario = r.usuario;
      this.sesionLocal = true;
      void registrarActividad('entrada_sin_internet', `${r.usuario.nombre} entró sin internet (verificado con la huella guardada en esta computadora)`);
      return null;
    },
    // El token venció con el equipo en funcionamiento: no se saca a la persona de la caja, se le pide confirmar la contraseña.
    pasarASesionLocal() {
      void registrarActividad('sesion_vencida', 'La sesión venció con la caja abierta; se pidió confirmar la contraseña');
      clearToken();
      localStorage.setItem(LOCAL_KEY, '1');
      this.sesionLocal = true;
    },
    async reautenticar(password) {
      const data = await api.post('/auth/login', { email: this.usuario.email, password });
      if (data.requiereDosPasos) throw new ApiError('Esta cuenta pide verificación en dos pasos: cierre sesión y entre de nuevo.', 400);
      this.iniciarSesion(data);
      void guardarCredencial(this.usuario.email, password, data.usuario);
      void registrarActividad('sesion_confirmada', 'Contraseña confirmada con internet; se envió lo pendiente');
      return true;
    },
    async reautenticarSilencioso() {
      if (!contrasenaEnMemoria || !this.usuario) return false;
      try {
        return await this.reautenticar(contrasenaEnMemoria);
      } catch {
        return false;
      }
    },
    async loginDosPasos(ticket, codigo) {
      this.iniciarSesion(await api.post('/auth/login-2fa', { ticket, codigo }));
    },
    iniciarSesion(data) {
      contrasenaEnMemoria = null;
      localStorage.removeItem(LOCAL_KEY);
      this.sesionLocal = false;
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
      if (this.sesionLocal) return;
      try {
        const me = await api.get('/auth/me');
        this.guardarUsuario({ permisos: me.permisos, rol: me.rol, nombre: me.nombre, tienda: me.tienda ?? null });
      } catch {
        /* si la sesión ya no sirve, api.js avisa y se cierra sola */
      }
    },
    async cargarConfig() {
      if (this.sesionLocal) return;
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
      if (this.usuario?.rol === 'encargado_tienda') void registrarActividad('salida', `${this.usuario.nombre} salió de la caja`);
      contrasenaEnMemoria = null;
      localStorage.removeItem(LOCAL_KEY);
      this.sesionLocal = false;
      clearToken();
      localStorage.removeItem(SESSION_KEY);
      this.usuario = null;
    },
    tienePermiso(permiso) {
      return Boolean(this.usuario?.permisos?.includes(permiso));
    },
  },
});
