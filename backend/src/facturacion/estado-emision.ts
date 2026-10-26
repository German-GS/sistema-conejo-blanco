import { EstadoFactura } from '../common/enums/estado-factura.enum.js';

// Cómo se le dice a cada estado ante Hacienda en pantallas y reportes. Una
// factura solo es válida cuando Hacienda la ACEPTA: «Emitida» es el único
// estado que da esa certeza.
export const ETIQUETA_EMISION: Record<EstadoFactura, string> = {
  [EstadoFactura.PENDIENTE_ENVIO]: 'Pendiente de envío',
  [EstadoFactura.ENVIADA]: 'En proceso',
  [EstadoFactura.ACEPTADA]: 'Emitida',
  [EstadoFactura.RECHAZADA]: 'Rechazada',
};

export const etiquetaEmision = (estado: string): string => ETIQUETA_EMISION[estado as EstadoFactura] ?? estado;

export const ESTADOS_EMISION = Object.values(EstadoFactura) as string[];
