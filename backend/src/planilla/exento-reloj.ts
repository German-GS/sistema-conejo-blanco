// Quién queda fuera del control de asistencia: el que no usa el reloj de huella y los cargos de confianza (art. 143 del Código de Trabajo:
// reportan directamente a la gerencia y no tienen jornada fija). A estas personas se les paga siempre la jornada completa: no se piden ni se
// revisan sus marcas, no aparecen como «sin marcas» y sus días nunca bloquean la aprobación de una planilla.
export const exentoDeReloj = (e: { marcaReloj?: boolean | null; esConfianza?: boolean | null }): boolean => e.marcaReloj === false || e.esConfianza === true;
