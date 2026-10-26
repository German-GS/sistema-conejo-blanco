import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SecretosService } from './secretos.service.js';

export const SECRETO_CORREO = 'cb-smtp-url'; // ej. smtps://usuario:clave@smtp.ejemplo.com:465

export interface AdjuntoCorreo {
  filename: string;
  content: string;
  contentType: string;
}

// Envío de correo saliente (la factura aceptada al cliente). El servidor SMTP
// vive en un secreto, no en el código. Sin ese secreto, simplemente no envía y
// lo dice: la factura sigue siendo válida, solo falta entregarla.
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);

  constructor(private readonly secretos: SecretosService) {}

  configurado(): Promise<boolean> {
    return this.secretos.existe(SECRETO_CORREO);
  }

  async enviar(datos: { para: string; asunto: string; html: string; remitente: string; adjuntos: AdjuntoCorreo[] }): Promise<void> {
    const url = await this.secretos.leerTexto(SECRETO_CORREO);
    const transporte = nodemailer.createTransport(url);
    await transporte.sendMail({
      from: datos.remitente,
      to: datos.para,
      subject: datos.asunto,
      html: datos.html,
      attachments: datos.adjuntos.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    this.logger.log(`Correo «${datos.asunto}» enviado a ${datos.para}.`);
  }
}
