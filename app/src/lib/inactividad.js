// Cierra la sesión tras un rato sin usar la app — medida de seguridad para
// computadoras/celulares compartidos o desatendidos.
//
// La última actividad se guarda en localStorage (no en memoria) por dos
// motivos: varias pestañas abiertas comparten el mismo reloj (actividad en
// una mantiene viva a todas), y si la computadora se duerme los timers del
// navegador se pausan — al despertar se compara contra la hora real y se
// cierra la sesión igual, en vez de esperar otros 10 minutos.
let minutosInactividad = 10;

// El administrador del sistema define el tiempo (Sistema → Seguridad).
export function fijarMinutosInactividad(minutos) {
  if (Number.isFinite(minutos) && minutos >= 2) minutosInactividad = minutos;
}
export const minutosDeInactividad = () => minutosInactividad;

const CLAVE_ACTIVIDAD = 'conejo-blanco-ultima-actividad';
const EVENTOS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
const REVISAR_CADA_MS = 15_000;
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

  function registrarActividad() {
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
    if (Date.now() - ultima >= minutosInactividad * 60_000) {
      detener();
      alExpirar();
    }
  }

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
    for (const evento of EVENTOS) window.removeEventListener(evento, registrarActividad);
    document.removeEventListener('visibilitychange', alVolverAVerse);
  }

  return detener;
}
