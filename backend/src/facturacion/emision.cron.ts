import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmisionService } from './emision.service.js';

// El flujo de Hacienda es asíncrono: enviar solo significa «recibido». Cada 10
// minutos se consulta cómo van las facturas enviadas (aceptadas o rechazadas) y
// se envían las pendientes que ya corresponde enviar.
@Injectable()
export class EmisionCron {
  private readonly logger = new Logger(EmisionCron.name);
  private corriendo = false;

  constructor(private readonly emision: EmisionService) {}

  @Cron('*/10 * * * *')
  async revisar(): Promise<void> {
    if (this.corriendo) return; // no se solapan dos revisiones
    this.corriendo = true;
    try {
      await this.emision.confirmarEstados();
    } catch (err) {
      this.logger.error(`Falló la revisión de facturas con Hacienda: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.corriendo = false;
    }
  }
}
