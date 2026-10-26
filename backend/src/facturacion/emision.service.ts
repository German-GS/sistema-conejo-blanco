import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { Factura } from './factura.entity.js';
import { EstadoFactura } from '../common/enums/estado-factura.enum.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import { HACIENDA_CLIENT, type HaciendaClient, type ModoHacienda } from './hacienda-client.interface.js';
import { EmisorConfigService } from './emisor-config.service.js';
import { NumeracionService } from './numeracion.service.js';
import { CorreoService } from './correo.service.js';
import { ErrorDatosFactura, construirXmlFactura, type DatosFacturaXml, type LineaXml } from './xml-factura.js';

const TAMANO_LOTE = 50;
const HORAS_PARA_ESCALAR = 24;
const TIPO_FACTURA = '01';

export function modoHacienda(config: ConfigService): ModoHacienda {
  const modo = String(config.get('HACIENDA_MODO') ?? 'noop').toLowerCase();
  return modo === 'pruebas' || modo === 'produccion' ? modo : 'noop';
}

// Orquesta la emisión de una factura: arma el XML, lo firma y envía por el
// HaciendaClient, y sigue el estado hasta que Hacienda la acepta o la rechaza.
// Una factura solo es válida cuando queda «aceptada»; todo lo demás es camino.
@Injectable()
export class EmisionService {
  private readonly logger = new Logger(EmisionService.name);

  constructor(
    @InjectRepository(Factura) private readonly facturaRepo: Repository<Factura>,
    @Inject(HACIENDA_CLIENT) private readonly client: HaciendaClient,
    private readonly emisor: EmisorConfigService,
    private readonly numeracion: NumeracionService,
    private readonly correo: CorreoService,
    private readonly config: ConfigService,
  ) {}

  get modo(): ModoHacienda {
    return modoHacienda(this.config);
  }

  private cargar(id: string): Promise<Factura | null> {
    return this.facturaRepo.findOne({
      where: { id },
      relations: { cliente: true, lineas: { variante: { producto: true } }, pedido: { lineas: { variante: { producto: true } } }, notaCredito: true },
      order: { lineas: { orden: 'ASC' } },
    });
  }

  private async cargarOFallar(id: string): Promise<Factura> {
    const f = await this.cargar(id);
    if (!f) throw new NotFoundException('La factura no existe.');
    return f;
  }

  // Datos planos de la factura para armar el XML (de pedido o hecha a mano).
  async datosXml(f: Factura): Promise<DatosFacturaXml> {
    const e = await this.emisor.obtener();
    const manual = f.origen === 'manual';
    const iva = Number(f.ivaPorcentaje);
    const lineas: LineaXml[] = manual
      ? f.lineas.map((l) => ({
          codigo: l.variante?.producto?.codigo,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
          subtotal: Number(l.subtotal),
          impuestoPorcentaje: Number(l.impuestoPorcentaje),
          cabys: l.variante?.producto?.cabys || null,
          esServicio: !l.varianteId,
        }))
      : (f.pedido?.lineas ?? []).map((l) => ({
          codigo: l.codigoProducto,
          descripcion: `${l.codigoProducto} — ${l.nombreProducto} (${l.color})`,
          cantidad: l.pares,
          precioUnitario: Number(l.precioPorPar),
          subtotal: Number(l.montoLinea),
          impuestoPorcentaje: iva,
          cabys: l.variante?.producto?.cabys || null,
        }));
    const tipoPago = manual ? f.tipoPago : f.pedido?.tipoPago;
    const dias = manual ? f.diasCredito : f.pedido?.diasCredito;
    return {
      clave: f.claveNumerica,
      consecutivo: f.consecutivo,
      fechaEmision: f.creadoEn,
      emisor: {
        razonSocial: e.razonSocial,
        nombreComercial: e.nombreComercial,
        cedula: e.cedula,
        tipoIdentificacion: e.tipoIdentificacion,
        actividadEconomica: e.actividadEconomica,
        proveedorSistemas: e.proveedorSistemas,
        provincia: e.provincia,
        canton: e.canton,
        distrito: e.distrito,
        otrasSenas: e.otrasSenas,
        telefono: e.telefono,
        correo: e.correo,
      },
      receptor: { nombre: f.cliente.nombre, tipoIdentificacion: f.cliente.tipoIdentificacion, cedula: f.cliente.cedula, correo: f.cliente.email, telefono: f.cliente.telefono },
      condicion: tipoPago === TipoPago.CREDITO ? 'credito' : 'contado',
      diasCredito: dias ?? null,
      medioPago: manual ? (f.medioPago ?? 'transferencia') : 'transferencia',
      lineas,
      totalEsperado: Number(f.total),
      cabysPredeterminado: e.cabysPredeterminado || null,
    };
  }

  // Envía la factura a Hacienda (o reintenta si no se pudo). No lanza por datos
  // faltantes: deja la factura «Pendiente de envío» con el motivo escrito, para
  // que se vea en la lista y se corrija.
  async enviar(id: string): Promise<Factura> {
    const f = await this.cargarOFallar(id);
    if (f.notaCredito) throw new BadRequestException('Esta factura está anulada con una nota de crédito: no se envía.');
    if (f.estado === EstadoFactura.ENVIADA || f.estado === EstadoFactura.ACEPTADA) return f;

    if (this.modo === 'noop') {
      const r = await this.client.enviar(f.claveNumerica, '');
      f.estado = EstadoFactura.PENDIENTE_ENVIO;
      f.mensajeHacienda = r.mensaje;
      return this.facturaRepo.save(f);
    }

    let xml: string;
    try {
      xml = construirXmlFactura(await this.datosXml(f)).xml;
    } catch (err) {
      if (!(err instanceof ErrorDatosFactura)) throw err;
      f.estado = EstadoFactura.PENDIENTE_ENVIO;
      f.mensajeHacienda = `No se pudo armar el comprobante: ${err.message}`;
      return this.facturaRepo.save(f);
    }

    f.intentosEnvio += 1;
    const r = await this.client.enviar(f.claveNumerica, xml);
    f.mensajeHacienda = r.mensaje;
    if (r.xmlFirmado) f.xmlEnviado = r.xmlFirmado;
    if (r.estado === 'enviada') {
      f.estado = EstadoFactura.ENVIADA;
      f.enviadaEn = new Date();
      f.intentosConsulta = 0;
    } else {
      f.estado = EstadoFactura.PENDIENTE_ENVIO;
    }
    return this.facturaRepo.save(f);
  }

  // Pregunta a Hacienda cómo va una factura enviada y aplica el resultado.
  async consultar(id: string): Promise<Factura> {
    const f = await this.cargarOFallar(id);
    if (f.estado !== EstadoFactura.ENVIADA) return f; // idempotente: ya resuelta o sin enviar
    const r = await this.client.consultar(f.claveNumerica);
    if (r.estado === 'aceptada') {
      f.estado = EstadoFactura.ACEPTADA;
      f.resueltaEn = new Date();
      f.xmlRespuesta = r.xmlRespuesta ?? f.xmlRespuesta;
      f.mensajeHacienda = 'Hacienda aceptó el comprobante.';
      await this.facturaRepo.save(f);
      this.logger.log(`Factura ${f.consecutivo} ACEPTADA por Hacienda.`);
      await this.entregarAlCliente(f);
    } else if (r.estado === 'rechazada') {
      f.estado = EstadoFactura.RECHAZADA;
      f.resueltaEn = new Date();
      f.xmlRespuesta = r.xmlRespuesta ?? f.xmlRespuesta;
      f.mensajeHacienda = motivoDeRechazo(r.xmlRespuesta) ?? 'Hacienda rechazó el comprobante.';
      await this.facturaRepo.save(f);
      this.logger.warn(`Factura ${f.consecutivo} RECHAZADA por Hacienda: ${f.mensajeHacienda}`);
    } else {
      f.intentosConsulta += 1;
      f.mensajeHacienda = r.mensaje ?? f.mensajeHacienda;
      await this.facturaRepo.save(f);
      const horas = f.enviadaEn ? (Date.now() - f.enviadaEn.getTime()) / 3_600_000 : 0;
      if (horas > HORAS_PARA_ESCALAR) this.logger.warn(`Factura ${f.consecutivo} sigue «en proceso» tras ${horas.toFixed(1)} h: revisar con Hacienda.`);
    }
    return this.cargarOFallar(id);
  }

  // Una factura rechazada quema su consecutivo: se corrige y se vuelve a emitir con
  // numeración NUEVA, sin duplicar la venta ni sus asientos (es la misma factura).
  async reemitir(id: string): Promise<Factura> {
    const f = await this.cargarOFallar(id);
    if (f.estado !== EstadoFactura.RECHAZADA) throw new BadRequestException('Solo se vuelve a emitir una factura rechazada por Hacienda.');
    const e = await this.emisor.obtener();
    const sucursal = this.config.get<string>('EMISOR_SUCURSAL', '001');
    const terminal = this.config.get<string>('EMISOR_TERMINAL', '00001');
    const secuencial = await this.numeracion.siguienteSecuencial(sucursal, terminal, TIPO_FACTURA);
    const consecutivo = this.numeracion.armarConsecutivo({ sucursal, terminal, tipo: TIPO_FACTURA, secuencial });
    const { clave } = this.numeracion.armarClave({ cedulaEmisor: e.cedula, consecutivo });
    this.logger.log(`Re-emisión: ${f.consecutivo} → ${consecutivo}`);
    f.reemplazaAId = f.id;
    f.consecutivo = consecutivo;
    f.claveNumerica = clave;
    f.estado = EstadoFactura.PENDIENTE_ENVIO;
    f.mensajeHacienda = 'Re-emitida con numeración nueva: pendiente de envío.';
    f.xmlEnviado = null;
    f.xmlRespuesta = null;
    f.enviadaEn = null;
    f.resueltaEn = null;
    f.intentosEnvio = 0;
    f.intentosConsulta = 0;
    await this.facturaRepo.save(f);
    return this.enviar(f.id);
  }

  // Tarea periódica: confirma las enviadas y envía las pendientes que correspondan.
  async confirmarEstados(): Promise<void> {
    if (this.modo === 'noop') return;
    const enviadas = await this.facturaRepo.find({ where: { estado: EstadoFactura.ENVIADA }, order: { enviadaEn: 'ASC' }, take: TAMANO_LOTE });
    for (const f of enviadas) {
      try {
        await this.consultar(f.id);
      } catch (err) {
        this.logger.error(`No se pudo consultar ${f.consecutivo}: ${err instanceof Error ? err.message : err}`);
      }
    }
    // Solo las creadas desde la fecha de arranque de la emisión: las anteriores esperan una decisión.
    const e = await this.emisor.obtener();
    if (!e.emisionDesde) return;
    const pendientes = await this.facturaRepo.find({
      where: { estado: EstadoFactura.PENDIENTE_ENVIO, fecha: MoreThanOrEqual(e.emisionDesde), notaCredito: IsNull() },
      order: { creadoEn: 'ASC' },
      take: TAMANO_LOTE,
    });
    for (const f of pendientes) {
      try {
        await this.enviar(f.id);
      } catch (err) {
        this.logger.error(`No se pudo enviar ${f.consecutivo}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Envío masivo manual (ej. las facturas anteriores a la conexión, cuando administración decide enviarlas).
  async enviarPendientes(ids?: string[]): Promise<{ intentadas: number; enviadas: number }> {
    const donde = ids?.length ? { id: In(ids), estado: EstadoFactura.PENDIENTE_ENVIO } : { estado: EstadoFactura.PENDIENTE_ENVIO };
    const pendientes = await this.facturaRepo.find({ where: { ...donde, notaCredito: IsNull() }, order: { creadoEn: 'ASC' }, take: 200 });
    let enviadas = 0;
    for (const f of pendientes) {
      const r = await this.enviar(f.id);
      if (r.estado === EstadoFactura.ENVIADA) enviadas++;
    }
    return { intentadas: pendientes.length, enviadas };
  }

  // XML firmado de Hacienda + su respuesta, al correo del cliente. Una sola vez.
  async entregarAlCliente(f: Factura, forzar = false): Promise<{ enviado: boolean; motivo?: string }> {
    if (f.entregadoCliente && !forzar) return { enviado: false, motivo: 'Ya se entregó al cliente.' };
    if (f.estado !== EstadoFactura.ACEPTADA) return { enviado: false, motivo: 'La factura todavía no está emitida (aceptada por Hacienda).' };
    const para = f.cliente?.email;
    if (!para) return { enviado: false, motivo: 'El cliente no tiene correo registrado.' };
    if (!(await this.correo.configurado())) {
      this.logger.warn(`Factura ${f.consecutivo} aceptada, pero el correo saliente no está configurado: no se entregó.`);
      return { enviado: false, motivo: 'El correo saliente no está configurado todavía.' };
    }
    try {
      const e = await this.emisor.obtener();
      const adjuntos = [{ filename: `factura-${f.consecutivo}.xml`, content: f.xmlEnviado ?? '', contentType: 'application/xml' }];
      if (f.xmlRespuesta) adjuntos.push({ filename: `respuesta-hacienda-${f.consecutivo}.xml`, content: f.xmlRespuesta, contentType: 'application/xml' });
      await this.correo.enviar({
        para,
        remitente: `${e.nombreComercial || e.razonSocial} <${e.correo}>`,
        asunto: `Factura electrónica ${f.consecutivo} — ${e.nombreComercial || e.razonSocial}`,
        html: `<p>Adjuntamos la factura electrónica y el mensaje de aceptación del Ministerio de Hacienda.</p><p>Consecutivo: ${f.consecutivo}<br>Clave numérica: ${f.claveNumerica}</p>`,
        adjuntos,
      });
      f.entregadoCliente = true;
      f.fechaEntrega = new Date();
      await this.facturaRepo.save(f);
      return { enviado: true };
    } catch (err) {
      this.logger.error(`No se pudo entregar ${f.consecutivo} a ${para}: ${err instanceof Error ? err.message : err}`);
      return { enviado: false, motivo: `No se pudo enviar el correo: ${err instanceof Error ? err.message : 'error desconocido'}` };
    }
  }

  async reenviarCorreo(id: string): Promise<{ enviado: boolean; motivo?: string }> {
    return this.entregarAlCliente(await this.cargarOFallar(id), true);
  }

  // Panel de preparación: qué falta en el emisor, las llaves, los CABYS y el correo.
  async preparacion() {
    const [conexion, e, correoListo] = await Promise.all([this.client.estadoConexion(), this.emisor.obtener(), this.correo.configurado()]);
    return {
      modo: this.modo,
      conexion,
      emisor: { datos: e, faltantes: this.emisor.faltantes(e) },
      correo: { configurado: correoListo },
    };
  }
}

// Saca el motivo del mensaje de rechazo de Hacienda (XML) para mostrarlo en la factura.
export function motivoDeRechazo(xml?: string): string | null {
  if (!xml) return null;
  const detalle = /<DetalleMensaje>([\s\S]*?)<\/DetalleMensaje>/.exec(xml)?.[1] ?? /<Mensaje>([\s\S]*?)<\/Mensaje>/.exec(xml)?.[1];
  const texto = detalle?.replace(/\s+/g, ' ').trim();
  return texto ? `Hacienda rechazó el comprobante: ${texto.slice(0, 500)}` : null;
}
