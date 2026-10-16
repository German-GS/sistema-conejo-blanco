// Debe coincidir con el backend (common/enums/provincia.enum.ts). Es la
// provincia del CLIENTE — distinta del concepto "Ubicación" (Fábrica/
// Bodega/Tienda) que ya existe para inventario.
export const PROVINCIAS = [
  { valor: 'san_jose', etiqueta: 'San José' },
  { valor: 'alajuela', etiqueta: 'Alajuela' },
  { valor: 'cartago', etiqueta: 'Cartago' },
  { valor: 'heredia', etiqueta: 'Heredia' },
  { valor: 'guanacaste', etiqueta: 'Guanacaste' },
  { valor: 'puntarenas', etiqueta: 'Puntarenas' },
  { valor: 'limon', etiqueta: 'Limón' },
];

export function etiquetaProvincia(valor) {
  return PROVINCIAS.find((p) => p.valor === valor)?.etiqueta ?? '—';
}
