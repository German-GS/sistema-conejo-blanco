import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export const MIN_LARGO_PASSWORD = 10;

const COMUNES = new Set([
  'cambiar123',
  'password1',
  'password123',
  '1234567890',
  '0123456789',
  'qwerty1234',
  'qwertyuiop',
  'abc1234567',
  'admin12345',
  'conejoblanco',
  'conejo1234',
  'contrasena1',
  'bienvenido1',
]);

// Política de claves del personal. Mínimo 10 caracteres, al menos una letra
// y un dígito, y que no sea una clave obvia ni derivada del correo/nombre.
export function validarPoliticaPassword(
  password: string,
  contexto: { email?: string; nombre?: string } = {},
  largoMinimo = MIN_LARGO_PASSWORD,
): void {
  const errores: string[] = [];
  if (password.length < largoMinimo) {
    errores.push(`al menos ${largoMinimo} caracteres`);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errores.push('letras y números');
  }
  const baja = password.toLowerCase();
  if (COMUNES.has(baja) || /^(.)\1+$/.test(password)) {
    errores.push('no ser una clave común');
  }
  const local = contexto.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && baja.includes(local)) {
    errores.push('no contener tu correo');
  }
  const primerNombre = contexto.nombre?.split(/\s+/)[0]?.toLowerCase();
  if (primerNombre && primerNombre.length >= 4 && baja.includes(primerNombre)) {
    errores.push('no contener tu nombre');
  }
  if (errores.length > 0) {
    throw new BadRequestException(`La contraseña debe tener: ${errores.join(', ')}.`);
  }
}

const PALABRAS = [
  'Conejo', 'Blanco', 'Lana', 'Hilo', 'Medias', 'Tejido', 'Aguja', 'Telar', 'Cinta', 'Nube',
  'Sol', 'Luna', 'Cielo', 'Rio', 'Monte', 'Campo', 'Flor', 'Rosa', 'Luz', 'Mar',
  'Pino', 'Cedro', 'Miel', 'Pan', 'Cafe', 'Mango', 'Piña', 'Coco', 'Limon', 'Fresa',
];

// Clave temporal fácil de dictar y de escribir: una palabra, un guion y cuatro números (ej. Conejo-4821).
// Es solo para el primer ingreso: la persona debe cambiarla, y vence si no se usa a tiempo.
// Si la política de largo mínimo es mayor, se completa con más números.
export function generarPasswordTemporal(largoMinimo = MIN_LARGO_PASSWORD): string {
  const palabra = PALABRAS[randomInt(PALABRAS.length)].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let numeros = String(randomInt(10_000)).padStart(4, '0');
  while (palabra.length + 1 + numeros.length < largoMinimo) numeros += String(randomInt(10));
  return `${palabra}-${numeros}`;
}
