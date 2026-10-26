import { Injectable } from '@nestjs/common';
import type { EstadoConexionHacienda, HaciendaClient, ResultadoConsultaHacienda, ResultadoEnvioHacienda } from './hacienda-client.interface.js';

// Implementación mientras no hay llaves: no firma ni envía nada de verdad y lo
// dice, en vez de fingir un envío exitoso. La factura queda «Pendiente de envío».
@Injectable()
export class NoOpHaciendaClient implements HaciendaClient {
  async enviar(): Promise<ResultadoEnvioHacienda> {
    return {
      estado: 'pendiente_envio',
      mensaje: 'Envío a Hacienda no configurado todavía: falta la llave criptográfica (.p12) y las credenciales del API de Hacienda.',
    };
  }

  async consultar(): Promise<ResultadoConsultaHacienda> {
    return { estado: 'enviada', mensaje: 'Hacienda no está conectado: no hay nada que consultar.' };
  }

  async estadoConexion(): Promise<EstadoConexionHacienda> {
    return {
      conectado: false,
      modo: 'sin_conectar',
      faltantes: [
        'Llave criptográfica (.p12) y su PIN, descargadas de la Oficina Virtual de Hacienda',
        'Usuario y contraseña de la API de Hacienda (credenciales del ATV)',
        'Poner el sistema en modo «pruebas» (HACIENDA_MODO) para empezar con el ambiente de pruebas de Hacienda',
      ],
    };
  }
}
