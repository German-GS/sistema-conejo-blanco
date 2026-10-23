// Cierra la sesión tras un rato sin usar la app — medida de seguridad para
// computadoras/celulares compartidos o desatendidos.
//
// La última actividad se guarda en localStorage (no en memoria) por dos
// motivos: varias pestañas abiertas comparten el mismo reloj (actividad en
// una mantiene viva a todas), y si la computadora se duerme los timers del
// navegador se pausan — al despertar se compara contra la hora real y se
// cierra la sesión igual, en vez de esperar otros 10 minutos.
import { reactive } from 'vue';

let minutosInactividad = 10;

// Aviso previo: faltando 60 s (o 30 s si el límite es muy corto) para cerrar la sesión se le pregunta a la persona si sigue ahí.
// Mientras el aviso está abierto, mover el mouse no lo cierra: hay que tocar «Seguir trabajando».
export const inactividad = reactive({ restante: 0 });
let continuarActual = null;
export const continuarSesion = () => continuarActual?.();

// El administrador del sistema define el tiempo (Sistema → Seguridad).
export function fijarMinutosInactividad(minutos) {
  if (Number.isFinite(minutos) && minutos >= 2) minutosInactividad = minutos;
}
export const minutosDeInactividad = () => minutosInactividad;

const CLAVE_ACTIVIDAD = 'conejo-blanco-ultima-actividad';
const EVENTOS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
const REVISAR_CADA_MS = 5_000;
const GUARDAR_CADA_MS = 5_000; // no escribir en localStorage en cada mousemove

// Para el arranque de la app: si la pestaña se cerró y se reabre pasado el
// límite, la sesión guardada no debe revivir (si no, cerrar la pestaña
// "reiniciaría" el reloj y se saltaría la medida).
export function sesionVencidaPorInactividad() {
  const ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD));
  return Boolean(ultima) && Date.now() - ultima >= minutosInactividad * 60_000;
}

export function iniciarControlInactividad(alExpirar) {
  let ultimoGuardado = 0;

  let avisoActivo = false;
  let cuenta = null;
  const AVISO_MS = minutosInactividad * 60_000 > 150_000 ? 60_000 : 30_000;

  function cerrarAviso() {
    avisoActivo = false;
    inactividad.restante = 0;
    clearInterval(cuenta);
    cuenta = null;
  }

  function registrarActividad(e) {
    if (avisoActivo && e) return; // con el aviso abierto solo cuenta el botón «Seguir trabajando»
    const ahora = Date.now();
    if (ahora - ultimoGuardado < GUARDAR_CADA_MS) return;
    ultimoGuardado = ahora;
    try {
      localStorage.setItem(CLAVE_ACTIVIDAD, String(ahora));
    } catch {
      // Sin localStorage (modo privado estricto) el control sigue funcionando
      // con lo último que quedó guardado; peor caso, cierra antes de tiempo.
    }
  }

  function revisar() {
    const ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD) ?? Date.now());
    const faltan = minutosInactividad * 60_000 - (Date.now() - ultima);
    if (faltan <= 0) {
      cerrarAviso();
      detener();
      alExpirar();
    } else if (faltan <= AVISO_MS) {
      avisoActivo = true;
      inactividad.restante = Math.ceil(faltan / 1000);
      if (!cuenta) cuenta = setInterval(revisar, 1000);
    } else if (avisoActivo) {
      cerrarAviso(); // hubo actividad en otra pestaña
    }
  }

  // «Seguir trabajando»: cuenta como actividad ahora mismo.
  continuarActual = () => {
    cerrarAviso();
    ultimoGuardado = 0;
    registrarActividad();
  };

  function alVolverAVerse() {
    if (document.visibilityState === 'visible') revisar();
  }

  // Arranca "activo ahora": iniciar sesión cuenta como actividad.
  ultimoGuardado = 0;
  registrarActividad();

  for (const evento of EVENTOS) {
    window.addEventListener(evento, registrarActividad, { passive: true });
  }
  document.addEventListener('visibilitychange', alVolverAVerse);
  const intervalo = setInterval(revisar, REVISAR_CADA_MS);

  function detener() {
    clearInterval(intervalo);
    cerrarAviso();
    continuarActual = null;
    for (const evento of EVENTOS) window.removeEventListener(evento, registrarActividad);
    document.removeEventListener('visibilitychange', alVolverAVerse);
  }

  return detener;
}
