import { reactive } from 'vue';

// Confirmación propia (reemplaza a la ventana del navegador): explica qué va a pasar, pone el botón de la acción con su nombre y, para
// lo que no se puede deshacer, pide escribir una palabra. Uso: if (!(await confirmar('¿Anular el pedido #18? Se devuelve el inventario.'))) return;
//   confirmar(texto, { titulo, detalle, aceptar, cancelar, peligro, palabra })
// Si no se indica titulo/detalle se sacan del texto: la pregunta «¿…?» es el título y lo demás, el detalle.
export const dialogo = reactive({ abierto: false, titulo: '', detalle: [], aceptar: 'Aceptar', cancelar: 'Cancelar', peligro: false, palabra: '', resolver: null });

const VERBOS_PELIGRO = /^(eliminar|anular|borrar|revocar|desactivar|quitar|reabrir|convertir|cerrar|vaciar|restablecer|activar el mantenimiento|activarlo)/i;

function partir(texto) {
  const limpio = String(texto).trim();
  const m = limpio.match(/¿[^?]+\?/g);
  const pregunta = m ? m[m.length - 1] : '';
  const resto = (pregunta ? limpio.replace(pregunta, '') : limpio).trim();
  return { hayPregunta: Boolean(pregunta), titulo: pregunta.replace(/^¿|\?$/g, ''), detalle: resto.split(/\n+/).map((x) => x.trim()).filter(Boolean) };
}

export function confirmar(texto, opciones = {}) {
  const p = partir(texto);
  const titulo = opciones.titulo ?? (p.hayPregunta ? `¿${p.titulo.charAt(0).toUpperCase()}${p.titulo.slice(1)}?` : 'Confirmar');
  const verbo = (p.titulo.match(/^(\p{L}+)/u) ?? [])[1] ?? '';
  const infinitivo = /(ar|er|ir)$/i.test(verbo);
  Object.assign(dialogo, {
    abierto: true,
    titulo,
    detalle: opciones.detalle ?? p.detalle,
    aceptar: opciones.aceptar ?? (infinitivo ? `Sí, ${verbo.toLowerCase()}` : 'Aceptar'),
    cancelar: opciones.cancelar ?? 'Cancelar',
    peligro: opciones.peligro ?? VERBOS_PELIGRO.test(p.titulo),
    palabra: opciones.palabra ?? '',
  });
  return new Promise((resolver) => {
    dialogo.resolver = resolver;
  });
}

export function responderDialogo(valor) {
  const r = dialogo.resolver;
  dialogo.abierto = false;
  dialogo.resolver = null;
  r?.(valor);
}
