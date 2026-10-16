// Provincia del cliente, para filtrar reportes (ej. facturas por
// vencer) por zona geográfica. Distinto del concepto "Ubicación" que ya
// existe en el sistema (Fábrica/Bodega/Tienda, ver ubicaciones/) — ese es
// de dónde sale la mercadería, esto es dónde está el cliente.
export enum Provincia {
  SAN_JOSE = 'san_jose',
  ALAJUELA = 'alajuela',
  CARTAGO = 'cartago',
  HEREDIA = 'heredia',
  GUANACASTE = 'guanacaste',
  PUNTARENAS = 'puntarenas',
  LIMON = 'limon',
}
