import { Injectable } from '@nestjs/common';
import { EstadoFactura } from '../common/enums/estado-factura.enum.js';
import type { Factura } from './factura.entity.js';
import type { HaciendaClient, ResultadoEnvioHacienda } from './hacienda-client.interface.js';

// Implementación interina: no firma ni envía nada de verdad. Deja la
// factura en PENDIENTE_ENVIO con un mensaje explicando por qué, en vez
// de fingir un envío exitoso — mismo criterio que el firmador/cliente
// NoOp que usó Conejo Motors mientras tramitaba sus llaves.
@Injectable()
export class NoOpHaciendaClient implements HaciendaClient {
  async enviar(_factura: Factura): Promise<ResultadoEnvioHacienda> {
    return {
      estado: EstadoFactura.PENDIENTE_ENVIO,
      mensaje: 'Envío a Hacienda no configurado todavía: falta la llave criptográfica (.p12) y la conexión al API de Hacienda.',
    };
  }
}
