// Préstamos del empleado en el Banco Popular: el banco manda una cuota MENSUAL y la empresa la reparte entre las semanas del mes,
// contando los sábados (4 o 5): la semana pertenece al mes de su sábado. Funciones puras, sin base de datos.
import { redondear } from '../common/utils/dinero.util.js';
import { FrecuenciaPago } from './planilla.enums.js';

const aFecha = (iso: string) => new Date(`${iso}T12:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);

// Todos los sábados de un mes (mes 1–12).
export function sabadosDelMes(anio: number, mes: number): string[] {
  const resultado: string[] = [];
  const d = new Date(Date.UTC(anio, mes - 1, 1, 12));
  while (d.getUTCMonth() === mes - 1) {
    if (d.getUTCDay() === 6) resultado.push(aIso(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return resultado;
}

// El primer sábado dentro del período de la planilla (null si el período no tiene sábado).
export function sabadoDelPeriodo(desde: string, hasta: string): string | null {
  const d = aFecha(desde);
  const fin = aFecha(hasta);
  while (d <= fin) {
    if (d.getUTCDay() === 6) return aIso(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

// Cuota de la semana cuyo sábado es `sabado`: la mensual entre los sábados del mes; el último sábado absorbe el redondeo,
// así que la suma de las semanas del mes da exactamente la cuota mensual.
export function cuotaSemanalPorSabados(cuotaMensual: number, sabado: string): number {
  const [anio, mes] = sabado.split('-').map(Number);
  const sabados = sabadosDelMes(anio, mes);
  const n = sabados.length;
  const base = redondear(cuotaMensual / n);
  return sabados.indexOf(sabado) < n - 1 ? base : redondear(cuotaMensual - base * (n - 1));
}

// Lo que corresponde descontar en una planilla según cada cuánto se paga: semanal por sábados, quincenal en dos mitades, mensual completa.
export function cuotaExternaDelPeriodo(cuotaMensual: number, frecuencia: FrecuenciaPago, desde: string, hasta: string): number {
  if (frecuencia === FrecuenciaPago.SEMANAL) {
    const sabado = sabadoDelPeriodo(desde, hasta);
    return sabado ? cuotaSemanalPorSabados(cuotaMensual, sabado) : 0;
  }
  if (frecuencia === FrecuenciaPago.QUINCENAL) {
    const primera = redondear(cuotaMensual / 2);
    return Number(hasta.slice(8, 10)) <= 15 ? primera : redondear(cuotaMensual - primera);
  }
  return cuotaMensual;
}
