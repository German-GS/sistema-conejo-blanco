import { Injectable, Logger } from '@nestjs/common';
import { Environment, HttpClient, TokenManager, getEnvironmentConfig, getStatus, signXml } from '@dojocoding/hacienda-sdk';
import type {
  EstadoConexionHacienda,
  HaciendaClient,
  ModoHacienda,
  ResultadoConsultaHacienda,
  ResultadoEnvioHacienda,
} from './hacienda-client.interface.js';
import { SecretosService } from './secretos.service.js';
import { EmisorConfigService } from './emisor-config.service.js';

// Estado de Hacienda (SDK) → el nuestro. «recibido» y «procesando» siguen en proceso.
const MAPA_ESTADO: Record<string, ResultadoConsultaHacienda['estado']> = {
  aceptado: 'aceptada',
  rechazado: 'rechazada',
  error: 'rechazada',
  recibido: 'enviada',
  procesando: 'enviada',
};

// Hacienda usa llaves y credenciales DISTINTAS en el ambiente de pruebas y en
// producción; firmar un envío de pruebas con la llave de producción lo rechaza.
// Los secretos de pruebas llevan «-stag» y los de producción «-prod».
export const nombresSecretos = (produccion: boolean) => {
  const sufijo = produccion ? 'prod' : 'stag';
  return {
    p12: `cb-hacienda-p12-${sufijo}`,
    pin: `cb-hacienda-p12-pin-${sufijo}`,
    clave: `cb-hacienda-idp-pass-${sufijo}`,
  };
};

// Usuario del IDP de Hacienda: cpj-3-101-123456@[stag.|prod.]comprobanteselectronicos.go.cr
// (así lo entrega la Oficina Virtual; la cédula va con guiones).
export function usuarioIdp(tipoIdentificacion: string, cedula: string, produccion: boolean): string {
  const digitos = cedula.replace(/\D/g, '');
  let conGuiones = digitos;
  if (tipoIdentificacion === '01' && digitos.length === 9) conGuiones = `${digitos.slice(0, 1)}-${digitos.slice(1, 5)}-${digitos.slice(5)}`;
  else if (tipoIdentificacion === '02' && digitos.length === 10) conGuiones = `${digitos.slice(0, 1)}-${digitos.slice(1, 4)}-${digitos.slice(4)}`;
  const prefijo = tipoIdentificacion === '01' ? 'cpf' : 'cpj';
  const dominio = produccion ? 'prod.comprobanteselectronicos.go.cr' : 'stag.comprobanteselectronicos.go.cr';
  return `${prefijo}-${conGuiones}@${dominio}`;
}

// Firma XAdES con la llave .p12 y habla con el API de recepción de Hacienda.
// Basado en la conexión que ya funciona en Conejo Motors (mismo SDK y mismas
// particularidades del API).
@Injectable()
export class HaciendaClientReal implements HaciendaClient {
  private readonly logger = new Logger(HaciendaClientReal.name);
  private conexion: Promise<{ http: HttpClient; tokens: TokenManager }> | null = null;

  constructor(
    private readonly modo: ModoHacienda,
    private readonly secretos: SecretosService,
    private readonly emisor: EmisorConfigService,
  ) {}

  private get produccion(): boolean {
    return this.modo === 'produccion';
  }

  private async conectar(): Promise<{ http: HttpClient; tokens: TokenManager }> {
    const entorno = this.produccion ? Environment.Production : Environment.Sandbox;
    const config = { ...getEnvironmentConfig(entorno) };
    // El SDK trae mal la URL de recepción del ambiente de pruebas: la correcta es api-sandbox.…/recepcion/v1.
    if (!this.produccion) (config as { apiBaseUrl: string }).apiBaseUrl = 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1';
    const nombres = nombresSecretos(this.produccion);
    const [contrasena, e] = await Promise.all([this.secretos.leerTexto(nombres.clave), this.emisor.obtener()]);
    const tokens = new TokenManager({ envConfig: config });
    await tokens.authenticate({ username: usuarioIdp(e.tipoIdentificacion, e.cedula, this.produccion), password: contrasena });
    this.logger.log(`Autenticado contra Hacienda (${entorno}).`);
    return { http: new HttpClient({ envConfig: config, tokenManager: tokens }), tokens };
  }

  private obtenerConexion() {
    // Si la autenticación falla no se deja la promesa rota en caché: se puede reintentar.
    this.conexion ??= this.conectar().catch((err) => {
      this.conexion = null;
      throw err;
    });
    return this.conexion;
  }

  async enviar(claveNumerica: string, xmlSinFirmar: string): Promise<ResultadoEnvioHacienda> {
    const nombres = nombresSecretos(this.produccion);
    let xmlFirmado: string;
    try {
      const [p12, pin] = await Promise.all([this.secretos.leerBuffer(nombres.p12), this.secretos.leerTexto(nombres.pin)]);
      xmlFirmado = await signXml(xmlSinFirmar, p12, pin);
    } catch (err) {
      this.logger.error(`No se pudo firmar la factura ${claveNumerica}: ${err instanceof Error ? err.message : err}`);
      return { estado: 'pendiente_envio', mensaje: `No se pudo firmar el comprobante: ${err instanceof Error ? err.message : 'error desconocido'}` };
    }
    try {
      const e = await this.emisor.obtener();
      const { http, tokens } = await this.obtenerConexion();
      const token = await tokens.getAccessToken();
      // POST directo: la API responde 202 con cuerpo vacío y el SDK falla al leer ese cuerpo.
      const base = (http as unknown as { baseUrl: string }).baseUrl;
      const respuesta = await fetch(`${base}/recepcion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clave: claveNumerica,
          fecha: new Date().toISOString(),
          emisor: { tipoIdentificacion: e.tipoIdentificacion, numeroIdentificacion: e.cedula },
          comprobanteXml: Buffer.from(xmlFirmado, 'utf8').toString('base64'),
        }),
      });
      if (respuesta.status === 201 || respuesta.status === 202) return { estado: 'enviada', mensaje: 'Recibida por Hacienda: esperando su aceptación.', xmlFirmado };
      const cuerpo = await respuesta.text().catch(() => '');
      this.logger.error(`Hacienda respondió HTTP ${respuesta.status} para ${claveNumerica}: ${cuerpo || '(vacío)'}`);
      return { estado: 'pendiente_envio', mensaje: `Hacienda respondió HTTP ${respuesta.status}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`, xmlFirmado };
    } catch (err) {
      this.logger.error(`Envío a Hacienda falló para ${claveNumerica}: ${err instanceof Error ? err.message : err}`);
      return { estado: 'pendiente_envio', mensaje: `No se pudo comunicar con Hacienda: ${err instanceof Error ? err.message : 'error desconocido'}`, xmlFirmado };
    }
  }

  async consultar(claveNumerica: string): Promise<ResultadoConsultaHacienda> {
    const { http } = await this.obtenerConexion();
    const r = await getStatus(http, claveNumerica);
    const estado = MAPA_ESTADO[r.status] ?? 'enviada';
    return { estado, xmlRespuesta: r.responseXml, mensaje: estado === 'enviada' ? 'Hacienda todavía la está procesando.' : undefined };
  }

  async estadoConexion(): Promise<EstadoConexionHacienda> {
    const nombres = nombresSecretos(this.produccion);
    const [p12, pin, clave] = await Promise.all([this.secretos.existe(nombres.p12), this.secretos.existe(nombres.pin), this.secretos.existe(nombres.clave)]);
    const faltantes: string[] = [];
    if (!p12) faltantes.push(`Llave criptográfica (.p12) ${this.produccion ? 'de producción' : 'de pruebas'} (secreto «${nombres.p12}»)`);
    if (!pin) faltantes.push(`PIN de la llave (secreto «${nombres.pin}»)`);
    if (!clave) faltantes.push(`Contraseña del usuario de la API de Hacienda (secreto «${nombres.clave}»)`);
    return { conectado: faltantes.length === 0, modo: this.produccion ? 'produccion' : 'pruebas', faltantes };
  }
}
