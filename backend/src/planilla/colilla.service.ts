import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { PlanillasService } from './planillas.service.js';
import type { ConfiguracionFactura } from '../configuracion/configuracion-factura.entity.js';
import type { Planilla } from './planilla.entity.js';
import type { PlanillaLinea } from './planilla-linea.entity.js';

// Media carta horizontal en puntos (1 pt = 1/72"): 8.5" × 5.5".
const ANCHO = 612;
const ALTO = 396;
const MARGEN = 26;

const FUENTE = join(process.cwd(), 'assets', 'fonts', 'DejaVuSansCondensed.ttf');
const FUENTE_NEGRITA = join(process.cwd(), 'assets', 'fonts', 'DejaVuSansCondensed-Bold.ttf');

const GRIS = '#555555';
const LINEA = '#BBBBBB';

// ₡12 345,67 — con la fuente DejaVu, que sí trae el símbolo del colón.
export function formatoColones(monto: number | string): string {
  const n = Math.round(Number(monto) * 100) / 100;
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}₡${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimales}`;
}

function fecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function nombreArchivo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

@Injectable()
export class ColillaService {
  constructor(
    private readonly planillas: PlanillasService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Una colilla (si viene empleadoId) o todas las de la planilla en un solo PDF,
  // una por página de media carta.
  async generar(planillaId: string, empleadoId?: string): Promise<{ nombre: string; buffer: Buffer }> {
    const planilla = await this.planillas.buscarOFallar(planillaId);
    const empresa = await this.configuracion.obtenerFactura();
    const lineas = empleadoId ? planilla.lineas.filter((l) => l.empleadoId === empleadoId) : planilla.lineas;
    if (lineas.length === 0) throw new NotFoundException('No hay colillas para esa planilla o empleado.');

    const doc = new PDFDocument({ size: [ANCHO, ALTO], margin: MARGEN, autoFirstPage: false, info: { Title: 'Colilla de pago', Author: empresa.razonSocial || 'Conejo Blanco' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    const terminado = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    for (const linea of lineas) {
      doc.addPage({ size: [ANCHO, ALTO], margin: MARGEN });
      this.dibujar(doc, planilla, linea, empresa);
    }
    doc.end();
    await terminado;

    const nombre =
      lineas.length === 1
        ? `colilla-${nombreArchivo(lineas[0].empleadoNombre)}-${planilla.fechaDesde}.pdf`
        : `colillas-${planilla.fechaDesde}-a-${planilla.fechaHasta}.pdf`;
    return { nombre, buffer: Buffer.concat(trozos) };
  }

  private dibujar(doc: PDFKit.PDFDocument, planilla: Planilla, l: PlanillaLinea, empresa: ConfiguracionFactura): void {
    const n = (v: string) => Number(v);
    const ancho = ANCHO - MARGEN * 2;
    const mitad = (ancho - 20) / 2;
    const xIzq = MARGEN;
    const xDer = MARGEN + mitad + 20;

    if (planilla.estado === 'borrador') {
      doc.save().rotate(-25, { origin: [ANCHO / 2, ALTO / 2] }).font(FUENTE_NEGRITA).fontSize(70).fillColor('#EEEEEE').text('BORRADOR', 90, 150, { lineBreak: false }).restore();
    }

    // --- Encabezado ---
    let xTexto = MARGEN;
    const logo = this.rutaLogo(empresa.logoUrl);
    if (logo) {
      try {
        doc.image(logo, MARGEN, MARGEN, { fit: [44, 44] });
        xTexto = MARGEN + 52;
      } catch {
        // logo ilegible: la colilla sale sin él
      }
    }
    doc.fillColor('#000').font(FUENTE_NEGRITA).fontSize(12).text(empresa.razonSocial || 'Conejo Dorado SRL', xTexto, MARGEN, { width: 340, lineBreak: false });
    doc.font(FUENTE).fontSize(8).fillColor(GRIS);
    const datos = [empresa.cedulaJuridica && `Céd. jurídica ${empresa.cedulaJuridica}`, empresa.telefono && `Tel. ${empresa.telefono}`, empresa.correo].filter(Boolean).join('  ·  ');
    doc.text(datos, xTexto, MARGEN + 17, { width: 340, lineBreak: false });
    if (empresa.direccion) doc.text(empresa.direccion, xTexto, MARGEN + 28, { width: 340, lineBreak: false });

    doc.font(FUENTE_NEGRITA).fontSize(13).fillColor('#000').text('COLILLA DE PAGO', ANCHO - MARGEN - 220, MARGEN, { width: 220, align: 'right', lineBreak: false });
    doc.font(FUENTE).fontSize(8.5).fillColor(GRIS).text(`Período: ${fecha(planilla.fechaDesde)} al ${fecha(planilla.fechaHasta)}`, ANCHO - MARGEN - 220, MARGEN + 18, { width: 220, align: 'right', lineBreak: false });

    let y = MARGEN + 50;
    doc.moveTo(MARGEN, y).lineTo(ANCHO - MARGEN, y).strokeColor(LINEA).lineWidth(0.8).stroke();

    // --- Empleado ---
    y += 6;
    doc.font(FUENTE_NEGRITA).fontSize(10.5).fillColor('#000').text(l.empleadoNombre, MARGEN, y, { width: 330, lineBreak: false });
    doc.font(FUENTE).fontSize(8.5).fillColor(GRIS);
    doc.text(`Cédula: ${l.empleadoCedula ?? '—'}`, MARGEN, y + 15, { width: 200, lineBreak: false });
    doc.text(`Tarifa por hora: ${formatoColones(l.tarifaHora)}`, xDer, y + 15, { width: mitad, align: 'right', lineBreak: false });

    // --- Tablas ---
    y += 36;
    const ingresos: Array<[string, number]> = [[`Salario del período`, n(l.salarioBase)]];
    if (n(l.descuentoAusencias) > 0) ingresos.push([`Ausencias (${l.diasAusenciaDescontados} día${l.diasAusenciaDescontados === 1 ? '' : 's'})`, -n(l.descuentoAusencias)]);
    if (n(l.descuentoHoras) > 0) ingresos.push([`Horas faltantes (${n(l.horasAusentes)} h)`, -n(l.descuentoHoras)]);
    if (n(l.montoExtra) > 0) ingresos.push([`Horas extra (${n(l.horasExtra)} h)`, n(l.montoExtra)]);
    if (n(l.montoEspeciales) > 0) ingresos.push([`Feriado / domingo (${n(l.horasEspeciales)} h)`, n(l.montoEspeciales)]);

    const deducciones: Array<[string, number]> = [
      ['CCSS — SEM (salud)', n(l.sem)],
      ['CCSS — IVM (pensión)', n(l.ivm)],
      ['Banco Popular', n(l.bancoPopular)],
    ];
    if (n(l.renta) > 0) deducciones.push(['Impuesto sobre la renta', n(l.renta)]);
    const deudas = (l.detalle as { deudas?: Array<{ descripcion: string; monto: number }> }).deudas ?? [];
    const externas = (l.detalle as { externas?: Array<{ descripcion: string; monto: number }> }).externas ?? [];
    for (const x of externas) deducciones.push([`Préstamo B. Popular ${x.descripcion}`.slice(0, 30), x.monto]);
    for (const d of deudas) deducciones.push([d.descripcion.slice(0, 30), d.monto]);

    this.columna(doc, 'INGRESOS', ingresos, xIzq, y, mitad);
    this.columna(doc, 'DEDUCCIONES', deducciones, xDer, y, mitad);

    // Totales alineados abajo de las tablas
    const filasMax = Math.min(9, Math.max(5, ingresos.length, deducciones.length));
    const yTotales = y + 20 + filasMax * 13 + 6;
    doc.moveTo(xIzq, yTotales).lineTo(xIzq + mitad, yTotales).moveTo(xDer, yTotales).lineTo(xDer + mitad, yTotales).strokeColor(LINEA).lineWidth(0.8).stroke();
    this.fila(doc, 'Total ingresos (bruto)', n(l.bruto), xIzq, yTotales + 4, mitad, true);
    this.fila(doc, 'Total deducciones', n(l.totalDeducciones), xDer, yTotales + 4, mitad, true);

    // Viáticos: van aparte, fuera del bruto y de las deducciones, y se suman al neto.
    const viaticos = n(l.viaticos);
    if (viaticos > 0) this.fila(doc, 'Viáticos (no afectos a cargas)', viaticos, xIzq, yTotales + 20, mitad, false);

    // --- Neto ---
    const yNeto = yTotales + (viaticos > 0 ? 40 : 26);
    doc.roundedRect(MARGEN, yNeto, ancho, 30, 4).fillAndStroke('#F2F2F2', LINEA);
    doc.fillColor('#000').font(FUENTE_NEGRITA).fontSize(11).text('NETO A PAGAR', MARGEN + 12, yNeto + 9, { lineBreak: false });
    doc.fontSize(15).text(formatoColones(l.neto), MARGEN + 12, yNeto + 6, { width: ancho - 24, align: 'right', lineBreak: false });

    // --- Firma ---
    const yFirma = ALTO - MARGEN - 18;
    doc.moveTo(MARGEN, yFirma).lineTo(MARGEN + 200, yFirma).moveTo(ANCHO - MARGEN - 110, yFirma).lineTo(ANCHO - MARGEN, yFirma).strokeColor('#888').lineWidth(0.6).stroke();
    doc.font(FUENTE).fontSize(7.5).fillColor(GRIS);
    doc.text('Recibí conforme (firma)', MARGEN, yFirma + 3, { width: 200, lineBreak: false });
    doc.text('Fecha', ANCHO - MARGEN - 110, yFirma + 3, { width: 110, lineBreak: false });
  }

  private columna(doc: PDFKit.PDFDocument, titulo: string, filas: Array<[string, number]>, x: number, y: number, ancho: number): void {
    doc.font(FUENTE_NEGRITA).fontSize(8.5).fillColor(GRIS).text(titulo, x, y, { width: ancho, lineBreak: false });
    doc.moveTo(x, y + 12).lineTo(x + ancho, y + 12).strokeColor(LINEA).lineWidth(0.8).stroke();
    filas.slice(0, 9).forEach(([texto, monto], i) => this.fila(doc, texto, monto, x, y + 18 + i * 13, ancho, false));
  }

  private fila(doc: PDFKit.PDFDocument, texto: string, monto: number, x: number, y: number, ancho: number, negrita: boolean): void {
    doc.font(negrita ? FUENTE_NEGRITA : FUENTE).fontSize(9).fillColor('#000');
    doc.text(texto, x, y, { width: ancho - 90, lineBreak: false, ellipsis: true });
    doc.text(formatoColones(monto), x + ancho - 90, y, { width: 90, align: 'right', lineBreak: false });
  }

  // logoUrl guarda "/uploads/empresa/<archivo>" (carpeta local o bucket montado).
  // pdfkit solo lee JPG y PNG.
  private rutaLogo(logoUrl: string | null): string | null {
    if (!logoUrl || !/^\/uploads\/empresa\/[\w.-]+\.(jpg|png)$/i.test(logoUrl)) return null;
    const ruta = join(process.cwd(), logoUrl.replace(/^\//, ''));
    return existsSync(ruta) ? ruta : null;
  }
}
