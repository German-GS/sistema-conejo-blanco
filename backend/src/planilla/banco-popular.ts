// Archivo de la planilla web del Banco Popular. Reproduce lo que hace la
// macro del Excel «BP CONEJO…» (hoja BASE FINAL → CREATXT):
//   - línea de encabezado: HD|patrono.convenio|fecha|cuenta|moneda|total×2|movimientos|créditos|débitos
//   - una línea de débito (código 544) con la cuenta de la empresa por el
//     total, y una de crédito (código 545) por cada empleado;
//   - 29 campos separados por «|», solo ASCII, mayúsculas, saltos CRLF.
import { redondear } from '../common/utils/dinero.util.js';

export const CODIGO_DEBITO = 544;
export const CODIGO_CREDITO = 545;
const COLUMNAS = 29;
const MAX_NOMBRE = 35;
const MAX_NARRATIVA = 35;

export interface EmpresaBp {
  nombreEmpresa: string;
  numeroPatrono: string;
  cedulaPatrono: string;
  identificadorCliente: string;
  convenio: number;
  cuentaPatrono: string;
  moneda: string;
}

export interface PagoBp {
  nombre: string;
  cedula: string;
  identificadorBp: string;
  iban: string;
  monto: number;
}

// La macro quita |, \, °, comas y acentos (Ñ→N, Á→A, ü→U…). Acá además se
// pasa a mayúsculas y se recorta al largo que acepta el banco.
export function limpiarTexto(texto: string, max: number): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/Ñ/g, 'N')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[|\\°,/]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// La descripción del archivo (narrativa y nombre): solo letras, números y espacios. El banco rechaza el archivo si trae «/» u otros símbolos
// (por ejemplo una fecha escrita 19/10), así que no se deja nada más.
export function limpiarDescripcion(texto: string, max: number): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/Ñ/g, 'N')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// IBAN de Costa Rica: CR + 20 dígitos. El banco pide 17 dígitos: del
// carácter 6 en adelante (Mid(iban, 6, 17) en la macro).
export function cuentaDeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase().slice(5, 22);
}
export const ibanValido = (iban: string) => /^CR\d{20}$/.test(iban.replace(/\s+/g, '').toUpperCase());

// Los números salen como los escribe Excel: sin ceros de más (104596.4,
// 215424) y con punto decimal.
export function numeroTexto(n: number): string {
  return String(redondear(n));
}

export function fechaCompacta(fechaISO: string): string {
  return fechaISO.replaceAll('-', '');
}

function linea(campos: Array<string | number>): string {
  return campos.join('|');
}

function filaDA(p: { cuenta: string; monto: number; codigo: number; nombre: string; narrativa: string; cedula: string; facturacion: string }): string {
  const f: Array<string | number> = Array(COLUMNAS).fill('');
  f[0] = 'DA';
  f[1] = p.cuenta; // B ACCOUNT
  f[5] = numeroTexto(p.monto); // F AMOUNT
  f[9] = p.codigo; // J TXN.CODE
  f[11] = p.nombre; // L THEIR.REF
  f[18] = p.narrativa; // S NARRATIVE
  f[22] = p.nombre; // W THEIR.NAME
  f[25] = p.cedula; // Z CU.LEGAL.NUMBER
  f[26] = p.facturacion; // AA BILLING.CU.ID
  return linea(f);
}

export interface ArchivoBp {
  nombreArchivo: string;
  contenido: string;
  total: number;
  pagos: number;
}

export function armarArchivoBp(empresa: EmpresaBp, pagos: PagoBp[], descripcion: string, fechaISO: string): ArchivoBp {
  if (pagos.length === 0) throw new Error('No hay pagos para el archivo.');
  const total = redondear(pagos.reduce((a, p) => a + p.monto, 0));
  const narrativa = limpiarDescripcion(descripcion, MAX_NARRATIVA);
  const idEmpresa = `${empresa.numeroPatrono}.${empresa.convenio}.${empresa.identificadorCliente}`;
  const cuentaEmpresa = cuentaDeIban(empresa.cuentaPatrono);

  const lineas = [
    linea([
      'HD',
      `${empresa.numeroPatrono}.${empresa.convenio}`,
      fechaCompacta(fechaISO),
      cuentaEmpresa,
      empresa.moneda,
      // SIPRASUMMARY: débitos + créditos (la macro suma dos veces el total).
      numeroTexto(total * 2),
      pagos.length + 1, // CONTROL.TOTAL: movimientos
      pagos.length, // CALC.CR.TOTAL: créditos
      1, // CALC.DR.TOTAL: débitos
    ]),
    filaDA({
      cuenta: cuentaEmpresa,
      monto: total,
      codigo: CODIGO_DEBITO,
      nombre: limpiarTexto(empresa.nombreEmpresa, MAX_NOMBRE),
      narrativa,
      cedula: empresa.cedulaPatrono,
      facturacion: idEmpresa,
    }),
    ...pagos.map((p) =>
      filaDA({
        cuenta: cuentaDeIban(p.iban),
        monto: p.monto,
        codigo: CODIGO_CREDITO,
        nombre: limpiarTexto(p.nombre, MAX_NOMBRE),
        narrativa,
        cedula: p.cedula,
        facturacion: `${empresa.numeroPatrono}.${empresa.convenio}.${p.identificadorBp}`,
      }),
    ),
  ];

  return {
    // Mismo nombre que arma la macro: PLANILLA <descripción> CREADA EL <aaaammdd>
    nombreArchivo: `PLANILLA ${limpiarDescripcion(descripcion, 25)} CREADA EL ${fechaCompacta(fechaISO)}.txt`,
    contenido: lineas.join('\r\n') + '\r\n',
    total,
    pagos: pagos.length,
  };
}
