// Formato estándar del código de producto:
//   2 letras mayúsculas + espacio + hasta 4 dígitos            KW 223
//   opcional: guion + hasta 2 dígitos                          KW 223-1
//   opcional: talla (1 a 3 letras) pegada al guion y número    KW 223-1L, KW 223-1XS
export const CODIGO_PRODUCTO_REGEX = /^[A-Z]{2} \d{1,4}(-\d{1,2}[A-Z]{0,3})?$/;

export const CODIGO_PRODUCTO_MENSAJE =
  'El código debe ser dos letras mayúsculas, un espacio y hasta 4 dígitos, opcionalmente seguido de -número y talla. Ej. "KW 223", "KW 223-1", "KW 223-1L" o "KW 223-1XS".';

// Acomoda lo que teclea la gente al formato estándar antes de validar:
// mayúsculas, sin espacios de más, "KW223" → "KW 223", "kw 223 - 1 l" →
// "KW 223-1L". Si después de acomodarlo sigue sin cumplir el formato, la
// validación lo rechaza — esto solo evita rechazar por detalles de tipeo.
export function normalizarCodigoProducto(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  return valor
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^([A-Z]{2})\s*(\d)/, '$1 $2')
    .replace(/(-\d+)\s+([A-Z]+)$/, '$1$2');
}
