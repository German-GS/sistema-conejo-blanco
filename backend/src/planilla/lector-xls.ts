// Lector mínimo de archivos Excel antiguos (.xls, BIFF8) — solo lo que
// necesita el reloj de huella, que exporta la «Tarjeta de Tiempo» con todas
// las celdas como texto. Lee el contenedor OLE y las celdas de texto
// (registro LABEL); no ejecuta nada del archivo.

export interface CeldaXls {
  fila: number;
  col: number;
  texto: string;
}

const FIN_CADENA = 0xfffffffa;

export const esXls = (buf: Buffer) => buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1;

function leerStreamWorkbook(buf: Buffer): Buffer {
  const ss = 1 << buf.readUInt16LE(30);
  const sector = (i: number) => buf.subarray((i + 1) * ss, (i + 2) * ss);

  const difat: number[] = [];
  for (let i = 0; i < 109; i++) difat.push(buf.readUInt32LE(76 + i * 4));
  let siguienteDifat = buf.readUInt32LE(68);
  for (let n = buf.readUInt32LE(72); n > 0 && siguienteDifat < FIN_CADENA; n--) {
    const s = sector(siguienteDifat);
    for (let i = 0; i < ss / 4 - 1; i++) difat.push(s.readUInt32LE(i * 4));
    siguienteDifat = s.readUInt32LE(ss - 4);
  }
  const fat: number[] = [];
  for (const i of difat) {
    if (i >= FIN_CADENA) continue;
    const s = sector(i);
    for (let k = 0; k < ss / 4; k++) fat.push(s.readUInt32LE(k * 4));
  }
  const leer = (inicio: number): Buffer => {
    const partes: Buffer[] = [];
    for (let i = inicio, guarda = 0; i < FIN_CADENA && guarda < 1_000_000; i = fat[i], guarda++) partes.push(sector(i));
    return Buffer.concat(partes);
  };

  const dir = leer(buf.readUInt32LE(48));
  for (let k = 0; k * 128 < dir.length; k++) {
    const e = dir.subarray(k * 128, (k + 1) * 128);
    const largoNombre = e.readUInt16LE(64);
    const nombre = e.subarray(0, Math.max(largoNombre - 2, 0)).toString('utf16le');
    if (e[66] === 2 && (nombre === 'Workbook' || nombre === 'Book')) {
      const tamano = e.readUInt32LE(120);
      if (tamano < buf.readUInt32LE(56)) throw new Error('El archivo .xls tiene un formato interno que no se puede leer.');
      return leer(e.readUInt32LE(116)).subarray(0, tamano);
    }
  }
  throw new Error('No se encontró la hoja de cálculo dentro del archivo .xls.');
}

export function leerCeldasXls(buf: Buffer): CeldaXls[] {
  const wb = leerStreamWorkbook(buf);
  const celdas: CeldaXls[] = [];
  for (let p = 0; p + 4 <= wb.length; ) {
    const tipo = wb.readUInt16LE(p);
    const largo = wb.readUInt16LE(p + 2);
    const cuerpo = wb.subarray(p + 4, p + 4 + largo);
    p += 4 + largo;
    if (tipo !== 0x0204 || cuerpo.length < 9) continue; // LABEL
    const fila = cuerpo.readUInt16LE(0);
    const col = cuerpo.readUInt16LE(2);
    const cch = cuerpo.readUInt16LE(6);
    const flags = cuerpo[8];
    let inicio = 9;
    if (flags & 0x08) inicio += 2; // texto con formato
    if (flags & 0x04) inicio += 4; // texto fonético
    const bytes = cch * (flags & 0x01 ? 2 : 1);
    const crudo = cuerpo.subarray(inicio, inicio + bytes);
    celdas.push({ fila, col, texto: flags & 0x01 ? crudo.toString('utf16le') : crudo.toString('latin1') });
  }
  return celdas;
}
