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

export type Periodicidad = 'semana' | 'quincena' | 'mes';

// Los sábados de la misma quincena (1–15 o 16–fin de mes) que un sábado dado.
function sabadosDeLaQuincena(sabado: string): string[] {
  const [anio, mes] = sabado.split('-').map(Number);
  const primera = Number(sabado.slice(8, 10)) <= 15;
  return sabadosDelMes(anio, mes).filter((s) => (Number(s.slice(8, 10)) <= 15) === primera);
}

// Reparte un monto entre una lista de sábados y devuelve lo que toca al sábado indicado (el último absorbe el redondeo).
function repartirEnSabados(monto: number, sabados: string[], sabado: string): number {
  const n = sabados.length;
  const base = redondear(monto / n);
  return sabados.indexOf(sabado) < n - 1 ? base : redondear(monto - base * (n - 1));
}

const sabadosEnPeriodo = (desde: string, hasta: string): number => {
  let n = 0;
  for (const d = aFecha(desde); d <= aFecha(hasta); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 6) n++;
  return n;
};

// Lo que corresponde descontar en una planilla: el monto se indica por semana, por quincena o por mes (como lo manda el banco o el juzgado)
// y se reparte según cada cuánto se paga:
//  - planilla semanal: por semana = el monto cada semana; por quincena o por mes = el monto entre los sábados de esa quincena o mes;
//  - planilla quincenal: por quincena = el monto; por mes = la mitad; por semana = el monto × los sábados de la quincena;
//  - planilla mensual: por mes = el monto; por quincena = el doble; por semana = el monto × los sábados del mes.
export function cuotaExternaDelPeriodo(monto: number, periodicidad: Periodicidad, frecuencia: FrecuenciaPago, desde: string, hasta: string): number {
  if (frecuencia === FrecuenciaPago.SEMANAL) {
    const sabado = sabadoDelPeriodo(desde, hasta);
    if (!sabado) return 0;
    if (periodicidad === 'semana') return monto;
    if (periodicidad === 'quincena') return repartirEnSabados(monto, sabadosDeLaQuincena(sabado), sabado);
    return cuotaSemanalPorSabados(monto, sabado);
  }
  if (frecuencia === FrecuenciaPago.QUINCENAL) {
    if (periodicidad === 'quincena') return monto;
    if (periodicidad === 'semana') return redondear(monto * sabadosEnPeriodo(desde, hasta));
    const primera = redondear(monto / 2);
    return Number(hasta.slice(8, 10)) <= 15 ? primera : redondear(monto - primera);
  }
  if (periodicidad === 'mes') return monto;
  if (periodicidad === 'quincena') return redondear(monto * 2);
  return redondear(monto * sabadosEnPeriodo(desde, hasta));
}
