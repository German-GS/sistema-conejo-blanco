// Detección de anomalías en las marcas (lógica pura, se prueba en anomalias.spec.ts). Por ahora solo el almuerzo: cuando el día trae
// las 4 marcas, se mide el almuerzo. No cambia el pago por sí solo (el almuerzo se descuenta fijo): deja constancia en las marcas y administración
// decide si descuenta el exceso.
import { aMinutos, type Parametros } from './calculo.js';
import type { TipoAnomalia } from './anomalia-empleado.entity.js';

export interface AnomaliaDetectada {
  tipo: TipoAnomalia;
  minutos: number;
  detalle: string;
}

const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Con hora fija de almuerzo (ALMUERZO_HORA_INICIO) se mide contra el reloj: salir a almorzar antes de la hora y regresar después de la hora
// de regreso (inicio + minutos de almuerzo), cada uno con su tolerancia. Sin hora fija solo se mide cuánto duró el almuerzo.
export function detectarAnomaliasAlmuerzo(marcas: string[], p: Parametros, almuerzoEsperado: number): AnomaliaDetectada[] {
  if (marcas.length !== 4 || almuerzoEsperado <= 0) return [];
  const sale = aMinutos(marcas[1]);
  const regresa = aMinutos(marcas[2]);
  const duracion = regresa - sale;
  const corto = p.ALMUERZO_ANOMALIA_CORTO_MINUTOS ?? 30;
  const inicio = p.ALMUERZO_HORA_INICIO ?? 0;
  const tolSalida = p.TOLERANCIA_ALMUERZO_SALIDA_MINUTOS ?? 10;
  const tolRegreso = p.TOLERANCIA_ALMUERZO_REGRESO_MINUTOS ?? 10;
  const rango = `${marcas[1]} a ${marcas[2]}`;
  const detectadas: AnomaliaDetectada[] = [];
  if (duracion < corto) detectadas.push({ tipo: 'almuerzo_corto', minutos: duracion, detalle: `Almuerzo de ${duracion} min (${rango}); lo establecido es ${almuerzoEsperado} min.` });
  if (inicio > 0) {
    if (inicio - sale > tolSalida) {
      detectadas.push({ tipo: 'almuerzo_salida_temprana', minutos: inicio - sale, detalle: `Salió a almorzar a las ${marcas[1]}; la hora de almuerzo es a las ${hhmm(inicio)} (${inicio - sale} minutos antes, con tolerancia de ${tolSalida}).` });
    }
    const limite = inicio + almuerzoEsperado;
    if (regresa - limite > tolRegreso) {
      detectadas.push({ tipo: 'almuerzo_regreso_tarde', minutos: regresa - limite, detalle: `Regresó del almuerzo a las ${marcas[2]}; debía regresar a las ${hhmm(limite)} (${regresa - limite} minutos tarde, con tolerancia de ${tolRegreso}). El almuerzo duró ${duracion} min (${rango}).` });
    }
  } else if (duracion > almuerzoEsperado + tolRegreso) {
    detectadas.push({ tipo: 'almuerzo_largo', minutos: duracion, detalle: `Almuerzo de ${duracion} min (${rango}); lo establecido es ${almuerzoEsperado} min, con tolerancia de ${tolRegreso}.` });
  }
  return detectadas;
}

// Lo que se detecta de un día de asistencia frente al horario del empleado: llegada tarde, salida antes de la hora y ausencia injustificada,
// pero SOLO cuando la asistencia ya tuvo consecuencia: una ausencia injustificada o un rebajo de horas. Solo deja constancia (no cambia el pago).
// Los días con marcas por confirmar, feriados y domingos no cuentan.
export interface DiaParaAnomalias {
  tipoDia: string;
  estado: string;
  descuenta: boolean;
  marcas: string[];
  resolucionTipo: string | null;
  // Minutos que realmente se rebajan de ese día (ya con la compensación de la semana). Sin rebajo no hay anomalía: si cuando se hizo la
  // asistencia no hubo problema (dentro de la tolerancia, compensado, justificado), no tiene sentido anotarlo.
  minutosDescontar: number;
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
  if (d.estado !== 'ok' || d.marcas.length < 2 || d.minutosDescontar <= 0) return [];

  const tolEntrada = p.TOLERANCIA_ENTRADA_MINUTOS ?? 10;
  const tolSalida = p.TOLERANCIA_SALIDA_MINUTOS ?? 10;
  const detectadas: AnomaliaDetectada[] = [];
  const primera = d.marcas[0];
  const ultima = d.marcas[d.marcas.length - 1];
  const tarde = aMinutos(primera) - aMinutos(tramo.entrada);
  if (tarde > tolEntrada) detectadas.push({ tipo: 'tardanza', minutos: tarde, detalle: `Llegó a las ${primera}; su horario de entrada es a las ${tramo.entrada} (${tarde} minutos tarde).` });
  const antes = aMinutos(tramo.salida) - aMinutos(ultima);
  // Entrar y salir más temprano pero cumplir el horario completo no es salir antes de la hora: solo cuenta si faltó tiempo.
  const cumplioElHorario = aMinutos(ultima) - aMinutos(primera) + tolSalida >= aMinutos(tramo.salida) - aMinutos(tramo.entrada);
  if (antes > tolSalida && !cumplioElHorario) detectadas.push({ tipo: 'salida_temprana', minutos: antes, detalle: `Salió a las ${ultima}; su horario de salida es a las ${tramo.salida} (${antes} minutos antes).` });
  return detectadas;
}
