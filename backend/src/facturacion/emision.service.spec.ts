import { describe, expect, it, vi } from 'vitest';
import { EmisionService, motivoDeRechazo } from './emision.service.js';
import { EstadoFactura } from '../common/enums/estado-factura.enum.js';
import type { Factura } from './factura.entity.js';
import type { HaciendaClient } from './hacienda-client.interface.js';

const emisorConfig = {
  razonSocial: 'Conejo Dorado SRL', nombreComercial: 'Conejo Blanco', cedula: '3102123456', tipoIdentificacion: '02', actividadEconomica: '152001',
  proveedorSistemas: '112345678', provincia: '1', canton: '01', distrito: '01', otrasSenas: 'Bodega 4', telefono: '22223333', correo: 'f@ejemplo.cr',
  cabysPredeterminado: '6403990000000', emisionDesde: null as string | null,
};
const consecutivo = '00100001010000000007';
const clave = `506261026${'3102123456'.padStart(12, '0')}${consecutivo}112345678`;

function nuevaFactura(extra: Partial<Factura> = {}): Factura {
  return {
    id: 'f1', origen: 'manual', consecutivo, claveNumerica: clave, estado: EstadoFactura.PENDIENTE_ENVIO, mensajeHacienda: null,
    xmlEnviado: null, xmlRespuesta: null, enviadaEn: null, resueltaEn: null, intentosEnvio: 0, intentosConsulta: 0, entregadoCliente: false,
    fechaEntrega: null, reemplazaAId: null, notaCredito: null, creadoEn: new Date('2026-10-26T20:00:00Z'), fecha: '2026-10-26',
    ivaPorcentaje: '13.00', total: '113000.00', tipoPago: 'contado', diasCredito: null, medioPago: 'transferencia',
    cliente: { nombre: 'Zapatería El Paso SA', tipoIdentificacion: '02', cedula: '3101654321', email: 'compras@elpaso.cr', telefono: '22221111' },
    lineas: [{ orden: 1, descripcion: 'Bota', cantidad: '10', precioUnitario: '10000.00', subtotal: '100000.00', impuestoPorcentaje: '13.00', varianteId: 'v1', variante: { producto: { codigo: 'KW034', cabys: '6403990000000' } } }],
    ...extra,
  } as unknown as Factura;
}

function armar(modo: string, cliente: Partial<HaciendaClient>, factura: Factura) {
  const guardadas: Factura[] = [];
  const repo = {
    findOne: vi.fn(async () => factura),
    find: vi.fn(async () => [factura]),
    save: vi.fn(async (f: Factura) => { guardadas.push({ ...f }); return f; }),
  };
  const correo = { configurado: vi.fn(async () => true), enviar: vi.fn(async () => undefined) };
  const numeracion = {
    siguienteSecuencial: vi.fn(async () => 8),
    armarConsecutivo: vi.fn(() => '00100001010000000008'),
    armarClave: vi.fn(() => ({ clave: `506261026${'3102123456'.padStart(12, '0')}00100001010000000008187654321` })),
  };
  const config = { get: (k: string, d?: string) => (k === 'HACIENDA_MODO' ? modo : d) };
  const servicio = new EmisionService(
    repo as never,
    { enviar: async () => ({ estado: 'pendiente_envio', mensaje: 'x' }), consultar: async () => ({ estado: 'enviada' }), estadoConexion: async () => ({ conectado: false, modo: 'sin_conectar', faltantes: [] }), ...cliente } as HaciendaClient,
    { obtener: async () => emisorConfig, faltantes: () => [] } as never,
    numeracion as never,
    correo as never,
    config as never,
  );
  return { servicio, repo, correo, numeracion, guardadas };
}

describe('EmisionService', () => {
  it('sin conexión la factura queda pendiente de envío y lo dice', async () => {
    const f = nuevaFactura();
    const { servicio } = armar('noop', { enviar: async () => ({ estado: 'pendiente_envio', mensaje: 'Envío a Hacienda no configurado todavía' }) }, f);
    const r = await servicio.enviar('f1');
    expect(r.estado).toBe(EstadoFactura.PENDIENTE_ENVIO);
    expect(r.mensajeHacienda).toMatch(/no configurado/);
  });

  it('con conexión y datos completos: queda «enviada» con su XML y la hora', async () => {
    const f = nuevaFactura();
    const enviar = vi.fn(async (_clave: string, _xml: string) => ({ estado: 'enviada' as const, mensaje: 'Recibida por Hacienda', xmlFirmado: '<xml firmado/>' }));
    const { servicio } = armar('pruebas', { enviar }, f);
    const r = await servicio.enviar('f1');
    expect(r.estado).toBe(EstadoFactura.ENVIADA);
    expect(r.xmlEnviado).toBe('<xml firmado/>');
    expect(r.enviadaEn).toBeInstanceOf(Date);
    expect(r.intentosEnvio).toBe(1);
    expect(enviar.mock.calls[0][1]).toContain('<CodigoCABYS>6403990000000</CodigoCABYS>');
  });

  it('si faltan datos no se manda nada y la factura dice qué corregir', async () => {
    const f = nuevaFactura({ cliente: { nombre: 'X', tipoIdentificacion: '02', cedula: '3101654321', email: '', telefono: '' } as never });
    const enviar = vi.fn();
    const { servicio } = armar('pruebas', { enviar }, f);
    const r = await servicio.enviar('f1');
    expect(enviar).not.toHaveBeenCalled();
    expect(r.estado).toBe(EstadoFactura.PENDIENTE_ENVIO);
    expect(r.mensajeHacienda).toMatch(/correo/);
  });

  it('no vuelve a enviar una factura ya enviada o aceptada', async () => {
    const enviar = vi.fn();
    for (const estado of [EstadoFactura.ENVIADA, EstadoFactura.ACEPTADA]) {
      const { servicio } = armar('pruebas', { enviar }, nuevaFactura({ estado }));
      await servicio.enviar('f1');
    }
    expect(enviar).not.toHaveBeenCalled();
  });

  it('Hacienda acepta: pasa a «aceptada» (Emitida) y se entrega al cliente una sola vez', async () => {
    const f = nuevaFactura({ estado: EstadoFactura.ENVIADA, xmlEnviado: '<xml/>', enviadaEn: new Date() });
    const { servicio, correo } = armar('pruebas', { consultar: async () => ({ estado: 'aceptada', xmlRespuesta: '<MensajeHacienda/>' }) }, f);
    const r = await servicio.consultar('f1');
    expect(r.estado).toBe(EstadoFactura.ACEPTADA);
    expect(r.resueltaEn).toBeInstanceOf(Date);
    expect(correo.enviar).toHaveBeenCalledTimes(1);
    expect(r.entregadoCliente).toBe(true);
    await servicio.consultar('f1'); // idempotente
    expect(correo.enviar).toHaveBeenCalledTimes(1);
  });

  it('Hacienda rechaza: queda «rechazada» con el motivo, sin correo al cliente', async () => {
    const f = nuevaFactura({ estado: EstadoFactura.ENVIADA, enviadaEn: new Date() });
    const xml = '<MensajeHacienda><DetalleMensaje>El CABYS no existe</DetalleMensaje></MensajeHacienda>';
    const { servicio, correo } = armar('pruebas', { consultar: async () => ({ estado: 'rechazada', xmlRespuesta: xml }) }, f);
    const r = await servicio.consultar('f1');
    expect(r.estado).toBe(EstadoFactura.RECHAZADA);
    expect(r.mensajeHacienda).toMatch(/El CABYS no existe/);
    expect(correo.enviar).not.toHaveBeenCalled();
  });

  it('«en proceso» sigue en proceso y cuenta el intento', async () => {
    const f = nuevaFactura({ estado: EstadoFactura.ENVIADA, enviadaEn: new Date() });
    const { servicio } = armar('pruebas', { consultar: async () => ({ estado: 'enviada', mensaje: 'procesando' }) }, f);
    const r = await servicio.consultar('f1');
    expect(r.estado).toBe(EstadoFactura.ENVIADA);
    expect(r.intentosConsulta).toBe(1);
  });

  it('re-emitir una rechazada usa consecutivo y clave NUEVOS y vuelve a enviarla', async () => {
    const f = nuevaFactura({ estado: EstadoFactura.RECHAZADA, mensajeHacienda: 'rechazada' });
    const enviar = vi.fn(async () => ({ estado: 'enviada' as const, mensaje: 'ok', xmlFirmado: '<x/>' }));
    const { servicio, numeracion } = armar('pruebas', { enviar }, f);
    const r = await servicio.reemitir('f1');
    expect(numeracion.siguienteSecuencial).toHaveBeenCalled();
    expect(r.consecutivo).toBe('00100001010000000008');
    expect(r.claveNumerica).not.toBe(clave);
    expect(r.estado).toBe(EstadoFactura.ENVIADA);
  });

  it('solo se re-emite una factura rechazada', async () => {
    const { servicio } = armar('pruebas', {}, nuevaFactura({ estado: EstadoFactura.ACEPTADA }));
    await expect(servicio.reemitir('f1')).rejects.toThrow(/rechazada/);
  });

  it('una factura anulada no se envía', async () => {
    const { servicio } = armar('pruebas', {}, nuevaFactura({ notaCredito: { id: 'n1' } as never }));
    await expect(servicio.enviar('f1')).rejects.toThrow(/anulada/);
  });
});

describe('motivoDeRechazo', () => {
  it('saca el detalle del mensaje de Hacienda', () => {
    expect(motivoDeRechazo('<M><DetalleMensaje> Línea 1: falta  CABYS </DetalleMensaje></M>')).toBe('Hacienda rechazó el comprobante: Línea 1: falta CABYS');
    expect(motivoDeRechazo(undefined)).toBeNull();
  });
});
