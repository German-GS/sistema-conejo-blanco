// Mismo redondeo que el backend (common/utils/dinero.util.ts): 2 decimales,
// mitad hacia arriba, sin el error de punto flotante que dejaba medios
// centavos como 2.135 en 2.13. Así la vista previa coincide con lo que se guarda.
export function redondear(monto) {
  const signo = monto < 0 ? -1 : 1;
  const centavos = Math.round(Number((Math.abs(monto) * 100).toFixed(6)));
  const resultado = (signo * centavos) / 100;
  return resultado === 0 ? 0 : resultado;
}
