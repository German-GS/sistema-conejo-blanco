import { Injectable, Logger } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROYECTO = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'conejo-blanco-app';

// Lee secretos de Google Secret Manager (llave .p12, su PIN, contraseña del
// usuario de Hacienda, correo saliente) con caché en memoria: se leen una vez por
// arranque, no en cada factura. Nunca se guardan en el código ni en la base.
@Injectable()
export class SecretosService {
  private readonly logger = new Logger(SecretosService.name);
  private cliente: SecretManagerServiceClient | null = null;
  private readonly cache = new Map<string, Buffer>();

  private conexion(): SecretManagerServiceClient {
    return (this.cliente ??= new SecretManagerServiceClient());
  }

  async leerBuffer(nombre: string): Promise<Buffer> {
    const guardado = this.cache.get(nombre);
    if (guardado) return guardado;
    const [version] = await this.conexion().accessSecretVersion({ name: `projects/${PROYECTO}/secrets/${nombre}/versions/latest` });
    const datos = version.payload?.data;
    if (!datos) throw new Error(`El secreto «${nombre}» está vacío.`);
    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos as Uint8Array);
    this.cache.set(nombre, buffer);
    this.logger.log(`Secreto «${nombre}» cargado.`);
    return buffer;
  }

  async leerTexto(nombre: string): Promise<string> {
    return (await this.leerBuffer(nombre)).toString('utf8').trim();
  }

  // Para el panel de preparación: ¿ya se cargó este secreto? (sin devolver su valor).
  async existe(nombre: string): Promise<boolean> {
    try {
      await this.leerBuffer(nombre);
      return true;
    } catch {
      return false;
    }
  }
}
