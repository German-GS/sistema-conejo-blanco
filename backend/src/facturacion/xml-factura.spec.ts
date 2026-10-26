import { describe, expect, it } from 'vitest';
import { ErrorDatosFactura, construirXmlFactura, fechaIsoCostaRica, problemasDeDatos, type DatosFacturaXml } from './xml-factura.js';

const emisor = {
  razonSocial: 'Conejo Dorado SRL', nombreComercial: 'Conejo Blanco', cedula: '3-102-123456', tipoIdentificacion: '02', actividadEconomica: '152001', proveedorSistemas: '1-1234-5678',
  provincia: '1', canton: '01', distrito: '01', otrasSenas: 'Zona industrial, bodega 4', telefono: '2222-3333', correo: 'facturas@ejemplo.cr',
};
// consecutivo: sucursal 001 + terminal 00001 + tipo 01 + secuencial 0000000007
const consecutivo = '00100001010000000007';
const clave = `506261026${'3102123456'.padStart(12, '0')}${consecutivo}112345678`;
const base = (): DatosFacturaXml => ({
  clave, consecutivo, fechaEmision: new Date('2026-10-26T20:05:00Z'), emisor,
  receptor: { nombre: 'Zapatería El Paso SA', tipoIdentificacion: '02', cedula: '3-101-654321', correo: 'compras@elpaso.cr' },
  condicion: 'contado', diasCredito: null, medioPago: 'transferencia',
  lineas: [
    { codigo: 'KW034', descripcion: 'KW034 — Bota (negro)', cantidad: 24, precioUnitario: 5000, subtotal: 120000, impuestoPorcentaje: 13, cabys: '6403990000000' },
    { codigo: 'KW035', descripcion: 'KW035 — Bota (café)', cantidad: 12, precioUnitario: 5000, subtotal: 54000, impuestoPorcentaje: 13, cabys: null },
  ],
  totalEsperado: 196620, // (120000 + 54000) × 1,13
  cabysPredeterminado: '6403990000000',
});

describe('construirXmlFactura', () => {
  it('arma un XML v4.4 con los datos de la factura', () => {
    const { xml, resumen } = construirXmlFactura(base());
    expect(resumen.totalComprobante).toBeCloseTo(196620, 2);
    expect(resumen.totalVenta).toBe(180000);
    expect(resumen.totalDescuentos).toBe(6000);
    expect(xml).toContain('<Clave>' + clave + '</Clave>');
    expect(xml).toContain('<NumeroConsecutivo>' + consecutivo + '</NumeroConsecutivo>');
    expect(xml).toContain('FacturaElectronica');
    expect(xml).toContain('<CodigoCABYS>6403990000000</CodigoCABYS>');
    expect(xml).toContain('<ProveedorSistemas>112345678</ProveedorSistemas>');
    expect(xml).toContain('<CodigoActividadEmisor>152001</CodigoActividadEmisor>');
    expect(xml).toContain('<CondicionVenta>01</CondicionVenta>');
    expect(xml).toContain('2026-10-26T14:05:00-06:00');
  });

  it('un descuento se declara como tal y la línea queda con lo que se cobra', () => {
    const { xml } = construirXmlFactura(base());
    expect(xml).toContain('<CodigoDescuento>07</CodigoDescuento>');
    expect(xml).toContain('<MontoDescuento>6000</MontoDescuento>');
    expect(xml).toContain('<TotalVentaNeta>174000</TotalVentaNeta>');
    expect(xml).toContain('<TotalDesgloseImpuesto>');
  });

  it('a crédito lleva el plazo', () => {
    const d = { ...base(), condicion: 'credito' as const, diasCredito: 30 };
    const { xml } = construirXmlFactura(d);
    expect(xml).toContain('<CondicionVenta>02</CondicionVenta>');
    expect(xml).toContain('<PlazoCredito>30</PlazoCredito>');
  });

  it('el orden de los elementos del encabezado y del resumen es el del anexo v4.4', () => {
    const { xml } = construirXmlFactura(base());
    const orden = ['<Clave>', '<ProveedorSistemas>', '<CodigoActividadEmisor>', '<NumeroConsecutivo>', '<FechaEmision>', '<Emisor>', '<Receptor>', '<CondicionVenta>', '<DetalleServicio>', '<ResumenFactura>'];
    const posiciones = orden.map((t) => xml.indexOf(t));
    expect(posiciones.every((x) => x > 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    const resumen = ['<TotalVenta>', '<TotalDescuentos>', '<TotalVentaNeta>', '<TotalDesgloseImpuesto>', '<TotalImpuesto>', '<MedioPago>', '<TotalComprobante>'];
    const pr = resumen.map((t) => xml.indexOf(t, xml.indexOf('<ResumenFactura>')));
    expect([...pr].sort((a, b) => a - b)).toEqual(pr);
  });

  it('reporta todos los datos que faltan de una vez, en palabras claras', () => {
    const d = base();
    d.cabysPredeterminado = null;
    d.lineas[1].cabys = null;
    d.receptor.correo = '';
    d.emisor = { ...emisor, actividadEconomica: '', proveedorSistemas: '' };
    const problemas = problemasDeDatos(d);
    expect(problemas.join(' ')).toMatch(/actividad económica/);
    expect(problemas.join(' ')).toMatch(/correo/);
    expect(problemas.join(' ')).toMatch(/línea 2.*CABYS/);
    expect(() => construirXmlFactura(d)).toThrow(ErrorDatosFactura);
  });

  it('no manda un total distinto al de la factura', () => {
    expect(() => construirXmlFactura({ ...base(), totalEsperado: 190000 })).toThrow(/no coincide/);
  });

  it('la cédula del emisor debe ser la de la clave', () => {
    const d = base();
    d.emisor = { ...emisor, cedula: '3-102-999999' };
    expect(problemasDeDatos(d).join(' ')).toMatch(/no coincide con la que lleva la clave/);
  });

  it('un IVA que no se conoce se avisa', () => {
    const d = base();
    d.lineas[0].impuestoPorcentaje = 7;
    expect(problemasDeDatos(d).join(' ')).toMatch(/IVA de 7%/);
  });
});

describe('fechaIsoCostaRica', () => {
  it('usa la hora de Costa Rica', () => {
    expect(fechaIsoCostaRica(new Date('2026-10-26T03:30:00Z'))).toBe('2026-10-25T21:30:00-06:00');
  });
});
