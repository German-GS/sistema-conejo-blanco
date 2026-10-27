// Detección de anomalías en las marcas (lógica pura, se prueba en anomalias.spec.ts). Por ahora solo el almuerzo: cuando el día trae
// las 4 marcas, se mide cuánto duró. No cambia el pago (el almuerzo siempre se descuenta fijo): solo deja constancia.
import { aMinutos, type Parametros } from './calculo.js';
import type { TipoAnomalia } from './anomalia-empleado.entity.js';

export interface AnomaliaDetectada {
  tipo: TipoAnomalia;
  minutos: number;
  detalle: string;
}

export function detectarAnomaliasAlmuerzo(marcas: string[], p: Parametros, almuerzoEsperado: number): AnomaliaDetectada[] {
  if (marcas.length !== 4 || almuerzoEsperado <= 0) return [];
  const duracion = aMinutos(marcas[2]) - aMinutos(marcas[1]);
  const corto = p.ALMUERZO_ANOMALIA_CORTO_MINUTOS ?? 30;
  const largoMax = almuerzoEsperado + (p.TOLERANCIA_MARCA_MINUTOS ?? 10);
  const rango = `${marcas[1]} a ${marcas[2]}`;
  if (duracion < corto) {
    return [{ tipo: 'almuerzo_corto', minutos: duracion, detalle: `Almuerzo de ${duracion} min (${rango}); lo establecido es ${almuerzoEsperado} min.` }];
  }
  if (duracion > largoMax) {
    return [{ tipo: 'almuerzo_largo', minutos: duracion, detalle: `Almuerzo de ${duracion} min (${rango}); lo establecido es ${almuerzoEsperado} min, con tolerancia de ${p.TOLERANCIA_MARCA_MINUTOS ?? 10}.` }];
  }
  return [];
}

// Lo que se detecta de un día de asistencia frente al horario del empleado: llegada tarde, salida antes de la hora y ausencia injustificada.
// Solo deja constancia (no cambia el pago). Los días con marcas por confirmar, feriados y domingos no cuentan.
export interface DiaParaAnomalias {
  tipoDia: string;
  estado: string;
  descuenta: boolean;
  marcas: string[];
  resolucionTipo: string | null;
}

// Decisiones de administración que dan por buena la falta de ese día (no se amonesta lo justificado).
const JUSTIFICADAS = ['ausencia_justificada', 'horas_justificadas', 'incapacidad'];

export function detectarAnomaliasDeDia(d: DiaParaAnomalias, tramo: { entrada: string; salida: string } | null, esperadoMin: number, p: Parametros): AnomaliaDetectada[] {
  if (d.tipoDia !== 'ordinario' || !tramo) return [];
  const justificada = d.resolucionTipo !== null && JUSTIFICADAS.includes(d.resolucionTipo);
  if (justificada) return [];

  if (d.estado === 'ausencia') {
    if (!d.descuenta && d.resolucionTipo !== 'ausencia_injustificada') return [];
    return [{ tipo: 'ausencia', minutos: esperadoMin, detalle: `No se presentó a trabajar y no hay justificación (ausencia injustificada). Su horario era de ${tramo.entrada} a ${tramo.salida}.` }];
  }
  if (d.estado !== 'ok' || d.marcas.length < 2) return [];

  const tol = p.TOLERANCIA_MARCA_MINUTOS ?? 10;
  const detectadas: AnomaliaDetectada[] = [];
  const primera = d.marcas[0];
  const ultima = d.marcas[d.marcas.length - 1];
  const tarde = aMinutos(primera) - aMinutos(tramo.entrada);
  if (tarde > tol) detectadas.push({ tipo: 'tardanza', minutos: tarde, detalle: `Llegó a las ${primera}; su horario de entrada es a las ${tramo.entrada} (${tarde} minutos tarde).` });
  const antes = aMinutos(tramo.salida) - aMinutos(ultima);
  // Entrar y salir más temprano pero cumplir el horario completo no es salir antes de la hora: solo cuenta si faltó tiempo.
  const cumplioElHorario = aMinutos(ultima) - aMinutos(primera) + tol >= aMinutos(tramo.salida) - aMinutos(tramo.entrada);
  if (antes > tol && !cumplioElHorario) detectadas.push({ tipo: 'salida_temprana', minutos: antes, detalle: `Salió a las ${ultima}; su horario de salida es a las ${tramo.salida} (${antes} minutos antes).` });
  return detectadas;
}
