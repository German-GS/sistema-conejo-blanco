// Arma el XML v4.4 de una Factura Electrónica a partir de datos ya planos (sin
// base de datos). Es lo único que sabe del formato del comprobante; se prueba en
// xml-factura.spec.ts. Todo error aquí es de DATOS (falta el CABYS, el cliente
// no tiene correo…) y se escribe para que administración lo corrija.
//
// Los nombres y el ORDEN de los elementos siguen el anexo de estructuras v4.4 de
// Hacienda. No se pudo validar contra el XSD oficial desde esta máquina, así que
// la primera emisión en el ambiente de PRUEBAS de Hacienda es la que confirma el
// formato: cualquier diferencia vuelve en el mensaje de rechazo, que queda
// guardado en la factura (mensajeHacienda / xmlRespuesta).
//
// El SDK de Hacienda (@dojocoding/hacienda-sdk) se usa solo para firmar y enviar:
// su constructor de XML usa nombres que no coinciden con v4.4 (Codigo en vez de
// CodigoCABYS, CodigoTarifa en vez de CodigoTarifaIVA…) y su resumen resta el
// descuento dos veces, por eso el XML se arma acá.
import { create } from 'xmlbuilder2';
import { redondear } from '../common/utils/dinero.util.js';

export class ErrorDatosFactura extends Error {}

export const NAMESPACE_FACTURA_V44 = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';

export interface EmisorXml {
  razonSocial: string;
  nombreComercial: string;
  cedula: string; // solo dígitos
  tipoIdentificacion: string; // 01 física, 02 jurídica, 03 DIMEX, 04 NITE
  actividadEconomica: string; // 6 dígitos
  // Cédula de quien registró el sistema de facturación ante Hacienda (v4.4 la pide).
  proveedorSistemas: string;
  provincia: string;
  canton: string;
  distrito: string;
  otrasSenas: string;
  telefono: string;
  correo: string;
}

export interface LineaXml {
  codigo?: string; // código interno del producto
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  // Lo que realmente se cobra por la línea (después del descuento, sin IVA).
  subtotal: number;
  impuestoPorcentaje: number;
  cabys: string | null;
  esServicio?: boolean;
}

export interface DatosFacturaXml {
  clave: string;
  consecutivo: string;
  fechaEmision: Date;
  emisor: EmisorXml;
  receptor: { nombre: string; tipoIdentificacion: string; cedula: string; correo: string; telefono?: string };
  condicion: 'contado' | 'credito';
  diasCredito: number | null;
  medioPago: string; // efectivo | tarjeta | cheque | transferencia | sinpe | otro
  lineas: LineaXml[];
  // Total que Blanco guardó en la factura: el XML no puede salirse de él.
  totalEsperado: number;
  cabysPredeterminado: string | null;
}

export interface ResumenXml {
  totalVenta: number;
  totalDescuentos: number;
  totalVentaNeta: number;
  totalImpuesto: number;
  totalComprobante: number;
}

// Código de tarifa de IVA (v4.4) según el porcentaje.
const CODIGO_TARIFA: Record<string, string> = { '13': '08', '4': '04', '2': '03', '1': '02', '0': '01' };
const MEDIO_PAGO: Record<string, string> = { efectivo: '01', tarjeta: '02', cheque: '03', transferencia: '04', sinpe: '06', otro: '99' };
// CodigoDescuento 07 = descuento comercial.
const DESCUENTO_COMERCIAL = '07';

const soloDigitos = (v: string): string => String(v ?? '').replace(/\D/g, '');
const num = (n: number): string => String(Number(n.toFixed(5)));
const r5 = (n: number): number => Number(n.toFixed(5));

// Fecha con la hora de Costa Rica (UTC−6, sin horario de verano): 2026-10-26T14:05:00-06:00.
export function fechaIsoCostaRica(fecha: Date): string {
  const cr = new Date(fecha.getTime() - 6 * 3600_000);
  return `${cr.toISOString().slice(0, 19)}-06:00`;
}

// Todo lo que falta o está mal en los datos, de una vez (no de a uno).
export function problemasDeDatos(d: DatosFacturaXml): string[] {
  const p: string[] = [];
  const e = d.emisor;
  if (!e.razonSocial.trim()) p.push('Falta la razón social del emisor.');
  if (soloDigitos(e.cedula).length < 9) p.push('Falta la cédula jurídica del emisor.');
  if (!/^\d{6}$/.test(e.actividadEconomica)) p.push('Falta el código de actividad económica del emisor (6 dígitos).');
  if (soloDigitos(e.proveedorSistemas).length < 9) p.push('Falta la cédula del proveedor de sistemas (quien registró el sistema ante Hacienda).');
  if (!e.correo.trim()) p.push('Falta el correo del emisor.');
  if (!e.otrasSenas.trim()) p.push('Falta la dirección (otras señas) del emisor.');
  if (d.clave.length === 50 && soloDigitos(e.cedula).padStart(12, '0') !== d.clave.slice(9, 21)) {
    p.push('La cédula del emisor no coincide con la que lleva la clave numérica de esta factura.');
  }
  const r = d.receptor;
  if (!r.nombre.trim()) p.push('El cliente no tiene nombre.');
  if (soloDigitos(r.cedula).length < 9) p.push('El cliente no tiene una cédula válida.');
  if (!r.correo.trim()) p.push('El cliente no tiene correo: Hacienda lo exige para entregarle la factura.');
  if (d.lineas.length === 0) p.push('La factura no tiene líneas.');
  d.lineas.forEach((l, i) => {
    const cabys = l.cabys ?? d.cabysPredeterminado;
    if (!cabys || !/^\d{13}$/.test(cabys)) p.push(`La línea ${i + 1} («${l.descripcion.slice(0, 40)}») no tiene código CABYS de 13 dígitos.`);
    if (CODIGO_TARIFA[String(redondear(l.impuestoPorcentaje))] === undefined) p.push(`La línea ${i + 1} tiene un IVA de ${l.impuestoPorcentaje}% que no se sabe enviar a Hacienda.`);
  });
  return p;
}

export function construirXmlFactura(d: DatosFacturaXml): { xml: string; resumen: ResumenXml } {
  const problemas = problemasDeDatos(d);
  if (problemas.length) throw new ErrorDatosFactura(problemas.join(' '));

  // --- Líneas y totales (los de Hacienda: la venta es SIN descuento, y el descuento se resta aparte) ---
  let merchGravada = 0, merchExenta = 0, servGravado = 0, servExento = 0, descuentos = 0, impuestos = 0;
  const desglose = new Map<string, number>(); // código de tarifa → impuesto
  const lineas = d.lineas.map((l, i) => {
    const montoTotal = r5(l.cantidad * l.precioUnitario);
    const descuento = r5(montoTotal - l.subtotal);
    const subTotal = r5(montoTotal - Math.max(0, descuento));
    const codigoTarifa = CODIGO_TARIFA[String(redondear(l.impuestoPorcentaje))];
    const impuesto = r5((subTotal * l.impuestoPorcentaje) / 100);
    const gravada = l.impuestoPorcentaje > 0;
    if (l.esServicio) gravada ? (servGravado += montoTotal) : (servExento += montoTotal);
    else gravada ? (merchGravada += montoTotal) : (merchExenta += montoTotal);
    descuentos += Math.max(0, descuento);
    impuestos += impuesto;
    desglose.set(codigoTarifa, r5((desglose.get(codigoTarifa) ?? 0) + impuesto));
    return { l, i, montoTotal, descuento: Math.max(0, descuento), subTotal, codigoTarifa, impuesto };
  });
  const totalGravado = r5(merchGravada + servGravado);
  const totalExento = r5(merchExenta + servExento);
  const totalVenta = r5(totalGravado + totalExento);
  const totalDescuentos = r5(descuentos);
  const totalVentaNeta = r5(totalVenta - totalDescuentos);
  const totalImpuesto = r5(impuestos);
  const totalComprobante = r5(totalVentaNeta + totalImpuesto);
  const resumen: ResumenXml = { totalVenta, totalDescuentos, totalVentaNeta, totalImpuesto, totalComprobante };

  if (Math.abs(totalComprobante - d.totalEsperado) > 0.05) {
    throw new ErrorDatosFactura(
      `El total del comprobante (${totalComprobante.toFixed(2)}) no coincide con el de la factura (${d.totalEsperado.toFixed(2)}): no se envía para no mandar a Hacienda un monto distinto.`,
    );
  }

  // --- Documento ---
  const e = d.emisor;
  const telefono = soloDigitos(e.telefono);
  const doc: Record<string, unknown> = {
    Clave: d.clave,
    ProveedorSistemas: soloDigitos(e.proveedorSistemas),
    CodigoActividadEmisor: e.actividadEconomica,
    NumeroConsecutivo: d.consecutivo,
    FechaEmision: fechaIsoCostaRica(d.fechaEmision),
    Emisor: {
      Nombre: e.razonSocial.trim(),
      Identificacion: { Tipo: e.tipoIdentificacion, Numero: soloDigitos(e.cedula) },
      ...(e.nombreComercial.trim() ? { NombreComercial: e.nombreComercial.trim() } : {}),
      Ubicacion: { Provincia: e.provincia, Canton: e.canton, Distrito: e.distrito, OtrasSenas: e.otrasSenas.trim().slice(0, 250) },
      ...(telefono.length >= 8 ? { Telefono: { CodigoPais: '506', NumTelefono: telefono.slice(-8) } } : {}),
      CorreoElectronico: e.correo.trim(),
    },
    Receptor: {
      Nombre: d.receptor.nombre.trim(),
      Identificacion: { Tipo: d.receptor.tipoIdentificacion, Numero: soloDigitos(d.receptor.cedula) },
      CorreoElectronico: d.receptor.correo.trim(),
    },
    CondicionVenta: d.condicion === 'credito' ? '02' : '01',
    ...(d.condicion === 'credito' ? { PlazoCredito: String(d.diasCredito ?? 0) } : {}),
    DetalleServicio: {
      LineaDetalle: lineas.map(({ l, i, montoTotal, descuento, subTotal, codigoTarifa, impuesto }) => ({
        NumeroLinea: i + 1,
        CodigoCABYS: l.cabys ?? d.cabysPredeterminado,
        ...(l.codigo ? { CodigoComercial: { Tipo: '04', Codigo: l.codigo.slice(0, 20) } } : {}),
        Cantidad: num(l.cantidad),
        UnidadMedida: l.esServicio ? 'Os' : 'Unid',
        Detalle: l.descripcion.slice(0, 200),
        PrecioUnitario: num(l.precioUnitario),
        MontoTotal: num(montoTotal),
        ...(descuento > 0.004 ? { Descuento: { MontoDescuento: num(descuento), CodigoDescuento: DESCUENTO_COMERCIAL } } : {}),
        SubTotal: num(subTotal),
        BaseImponible: num(subTotal),
        Impuesto: { Codigo: '01', CodigoTarifaIVA: codigoTarifa, Tarifa: num(l.impuestoPorcentaje), Monto: num(impuesto) },
        ImpuestoNeto: num(impuesto),
        MontoTotalLinea: num(r5(subTotal + impuesto)),
      })),
    },
    ResumenFactura: {
      CodigoTipoMoneda: { CodigoMoneda: 'CRC', TipoCambio: '1.00000' },
      TotalServGravados: num(servGravado),
      TotalServExentos: num(servExento),
      TotalMercanciasGravadas: num(merchGravada),
      TotalMercanciasExentas: num(merchExenta),
      TotalGravado: num(totalGravado),
      TotalExento: num(totalExento),
      TotalVenta: num(totalVenta),
      TotalDescuentos: num(totalDescuentos),
      TotalVentaNeta: num(totalVentaNeta),
      TotalDesgloseImpuesto: [...desglose.entries()].map(([codigoTarifa, monto]) => ({ Codigo: '01', CodigoTarifaIVA: codigoTarifa, TotalMontoImpuesto: num(monto) })),
      TotalImpuesto: num(totalImpuesto),
      MedioPago: { TipoMedioPago: MEDIO_PAGO[d.medioPago] ?? '99', TotalMedioPago: num(totalComprobante) },
      TotalComprobante: num(totalComprobante),
    },
  };

  const xml = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(NAMESPACE_FACTURA_V44, 'FacturaElectronica')
    .ele(doc as never)
    .end({ prettyPrint: true });
  return { xml, resumen };
}
