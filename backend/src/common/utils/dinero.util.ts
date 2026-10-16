// Redondea a 2 decimales (mitad hacia arriba, simétrico para negativos).
// El `toFixed(6)` intermedio elimina el ruido binario de punto flotante antes
// de redondear: sin él, valores que son exactamente medio centavo como 2.135
// (que en binario es 213.49999999999997 al multiplicar por 100) se redondeaban
// hacia abajo y el IVA o un total quedaba 1 centavo corto.
export function redondear(monto: number): number {
  const signo = monto < 0 ? -1 : 1;
  const centavos = Math.round(Number((Math.abs(monto) * 100).toFixed(6)));
  const resultado = (signo * centavos) / 100;
  return resultado === 0 ? 0 : resultado; // evita -0
}

// Para mensajes de error/bitácora legibles en el backend (ej. "₡1 500,00").
export function formatearColones(monto: number | string): string {
  return `₡${Number(monto).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
