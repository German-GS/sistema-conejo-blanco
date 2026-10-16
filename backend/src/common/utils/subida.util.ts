import { BadRequestException } from '@nestjs/common';
import { closeSync, openSync, readSync, unlinkSync } from 'node:fs';

// La extensión del archivo guardado sale del tipo MIME validado, nunca del
// nombre que manda el cliente (evita guardar "foto.php" o "foto.html").
export const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function cabecera(ruta: string): Buffer {
  const buf = Buffer.alloc(12);
  const fd = openSync(ruta, 'r');
  try {
    readSync(fd, buf, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  return buf;
}

function coincideFirma(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return buf.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

// El mimetype lo declara el cliente y se falsifica fácil: se confirma con los
// primeros bytes reales del archivo. Si no coincide, se borra del disco.
export function verificarArchivoSubido(archivo: Express.Multer.File): void {
  let valido = false;
  try {
    valido = coincideFirma(cabecera(archivo.path), archivo.mimetype);
  } catch {
    valido = false;
  }
  if (!valido) {
    try {
      unlinkSync(archivo.path);
    } catch {
      // ya no estaba
    }
    throw new BadRequestException('El archivo no es una imagen o PDF válido.');
  }
}
