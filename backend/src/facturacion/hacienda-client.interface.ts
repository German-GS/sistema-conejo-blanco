// Punto de conexión con Hacienda: firma y transmisión del comprobante ya armado
// (el XML lo arma xml-factura.ts). Hay dos implementaciones:
//  - NoOpHaciendaClient: no firma ni envía nada y lo dice (sin llaves todavía).
//  - HaciendaClientReal: firma XAdES con la llave .p12 y envía/consulta contra el
//    API de Hacienda (ambiente de pruebas o producción, según HACIENDA_MODO).
// FacturacionModule elige una u otra; nada más en el sistema cambia.
export const HACIENDA_CLIENT = 'HACIENDA_CLIENT';

export type ModoHacienda = 'noop' | 'pruebas' | 'produccion';

export interface ResultadoEnvioHacienda {
  // enviada = Hacienda la recibió (falta que la acepte); pendiente_envio = no se pudo enviar (se reintenta).
  estado: 'enviada' | 'pendiente_envio';
  mensaje: string;
  // XML firmado tal como salió (para guardarlo y entregarlo al cliente).
  xmlFirmado?: string;
}

export interface ResultadoConsultaHacienda {
  estado: 'aceptada' | 'rechazada' | 'enviada';
  mensaje?: string;
  xmlRespuesta?: string;
}

// Qué tan lista está la conexión: lo que se muestra en el panel de facturación electrónica.
export interface EstadoConexionHacienda {
  conectado: boolean;
  // 'sin_conectar' (hoy), 'pruebas' (ambiente de pruebas de Hacienda) o 'produccion'.
  modo: 'sin_conectar' | 'pruebas' | 'produccion';
  // Lo que falta del lado de las llaves y credenciales (los datos del emisor se revisan aparte).
  faltantes: string[];
}

export interface HaciendaClient {
  enviar(claveNumerica: string, xmlSinFirmar: string): Promise<ResultadoEnvioHacienda>;
  consultar(claveNumerica: string): Promise<ResultadoConsultaHacienda>;
  estadoConexion(): Promise<EstadoConexionHacienda>;
}
