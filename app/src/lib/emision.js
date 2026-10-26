import { exito, fallo, informar } from './avisos.js';

// Estado de emisión de una factura ante Hacienda. Solo «Emitida» (aceptada por
// Hacienda) da la certeza de que la factura es válida; el resto es camino.
export const ESTADOS_EMISION = {
  aceptada: { texto: 'Emitida', clase: 'bg-green-100 text-green-700', ayuda: 'Hacienda la aceptó: la factura es válida.' },
  enviada: { texto: 'En proceso', clase: 'bg-slate-200 text-slate-700', ayuda: 'Enviada a Hacienda, esperando que la acepte.' },
  pendiente_envio: { texto: 'Pendiente de envío', clase: 'bg-amber-100 text-amber-800', ayuda: 'Creada, pero todavía no se ha enviado a Hacienda.' },
  rechazada: { texto: 'Rechazada', clase: 'bg-red-100 text-red-700', ayuda: 'Hacienda la rechazó: no es válida hasta corregirla y emitirla de nuevo.' },
};

export const estadoEmision = (estado) => ESTADOS_EMISION[estado] ?? { texto: estado, clase: 'bg-slate-100 text-slate-600', ayuda: '' };

// Aviso al terminar de facturar: dice con claridad si la factura quedó emitida o no,
// para no suponer que «creada» significa «válida ante Hacienda».
export function avisarEmision(factura) {
  const consecutivo = factura?.consecutivo ? ` ${factura.consecutivo}` : '';
  switch (factura?.estado) {
    case 'aceptada':
      return exito(`Factura${consecutivo} emitida: Hacienda la aceptó.`);
    case 'enviada':
      return exito(`Factura${consecutivo} enviada a Hacienda. Está en proceso: el estado cambia a «Emitida» cuando la acepte.`);
    case 'rechazada':
      return fallo(`Hacienda rechazó la factura${consecutivo}. ${factura.mensajeHacienda ?? 'Revise los datos y emítala de nuevo.'}`);
    default:
      return informar(`Factura${consecutivo}: todavía NO está emitida. ${factura?.mensajeHacienda ?? 'Queda pendiente de envío a Hacienda.'}`, { duracion: 12000 });
  }
}
