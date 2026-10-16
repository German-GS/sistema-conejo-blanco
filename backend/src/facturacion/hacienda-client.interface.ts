import type { Factura } from './factura.entity.js';
import type { EstadoFactura } from '../common/enums/estado-factura.enum.js';

export interface ResultadoEnvioHacienda {
  estado: EstadoFactura;
  mensaje: string;
}

// Punto de conexión con Hacienda. Firmar (XAdES, con la llave .p12 de
// Conejo Blanco) y enviar el XML v4.4 del comprobante requiere esa
// llave real y los códigos CABYS por variante de producto (que el
// catálogo todavía no captura) — ninguna de las dos cosas existe en
// este sistema todavía.
//
// Para conectar de verdad: implementar esta interfaz (firmar + POST al
// API de Hacienda + interpretar la aceptación/rechazo) y cambiar el
// provider 'HACIENDA_CLIENT' en facturacion.module.ts de
// NoOpHaciendaClient a la implementación real. Nada más en el sistema
// necesita cambiar.
export const HACIENDA_CLIENT = 'HACIENDA_CLIENT';

export interface HaciendaClient {
  enviar(factura: Factura): Promise<ResultadoEnvioHacienda>;
}
