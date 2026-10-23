// Ayudas de accesibilidad que funcionan en toda la aplicación sin tocar cada formulario:
//  1. Une cada etiqueta (<label>) con su campo: al tocar la etiqueta se enfoca el campo y un lector de pantalla sabe qué es.
//  2. Los campos sin etiqueta toman su texto de ayuda (placeholder) o su título como nombre accesible.
// Los formularios nuevos deben usar el componente Campo (components/Campo.vue), que hace esto de origen.
let contador = 0;
const CAMPOS = 'input:not([type=hidden]), select, textarea';

function asociarEtiquetas(raiz) {
  for (const etiqueta of raiz.querySelectorAll('label:not([for])')) {
    if (etiqueta.querySelector(CAMPOS)) continue; // ya envuelve su campo
    let campo = null;
    const siguiente = etiqueta.nextElementSibling;
    if (siguiente) campo = siguiente.matches(CAMPOS) ? siguiente : siguiente.querySelector(CAMPOS);
    if (!campo) {
      const candidatos = etiqueta.parentElement?.querySelectorAll(CAMPOS);
      if (candidatos?.length === 1) campo = candidatos[0];
    }
    if (!campo || campo.closest('label')) continue;
    if (!campo.id) campo.id = `cb-campo-${++contador}`;
    etiqueta.htmlFor = campo.id;
  }
}

function nombrarCamposSinEtiqueta(raiz) {
  for (const campo of raiz.querySelectorAll(CAMPOS)) {
    if (campo.labels?.length || campo.hasAttribute('aria-label') || campo.hasAttribute('aria-labelledby')) continue;
    const nombre = campo.getAttribute('title') || campo.getAttribute('placeholder');
    if (nombre) campo.setAttribute('aria-label', nombre);
  }
}

export function iniciarAccesibilidad() {
  let programado = 0;
  const pasada = () => {
    programado = 0;
    asociarEtiquetas(document);
    nombrarCamposSinEtiqueta(document);
  };
  const observador = new MutationObserver(() => {
    if (!programado) programado = requestAnimationFrame(pasada);
  });
  observador.observe(document.body, { childList: true, subtree: true });
  pasada();
  return () => observador.disconnect();
}
