// Debe coincidir con backend/src/common/utils/codigo-producto.util.ts.
// Formato: 2 letras mayúsculas + espacio + hasta 4 dígitos, opcionalmente
// -número y talla (KW 223, KW 223-1, KW 223-1L, KW 223-1XS).
export const CODIGO_PRODUCTO_REGEX = /^[A-Z]{2} \d{1,4}(-\d{1,2}[A-Z]{0,3})?$/;

export const CODIGO_PRODUCTO_AYUDA = 'Formato: KW 223 · KW 223-1 · KW 223-1L · KW 223-1XS';

export function normalizarCodigoProducto(valor) {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^([A-Z]{2})\s*(\d)/, '$1 $2')
    .replace(/(-\d+)\s+([A-Z]+)$/, '$1$2');
}

export function codigoProductoValido(valor) {
  return CODIGO_PRODUCTO_REGEX.test(normalizarCodigoProducto(valor));
}
