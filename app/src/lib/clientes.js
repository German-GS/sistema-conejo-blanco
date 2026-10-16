// Tipos de identificación que reconoce Hacienda para el receptor de un
// comprobante electrónico (Factura Electrónica v4.4) — debe coincidir
// con TipoIdentificacion del backend (common/enums/tipo-identificacion.enum.ts).
export const TIPOS_IDENTIFICACION = [
  { valor: '01', etiqueta: 'Física' },
  { valor: '02', etiqueta: 'Jurídica' },
  { valor: '03', etiqueta: 'DIMEX (residente extranjero)' },
  { valor: '04', etiqueta: 'NITE' },
];
