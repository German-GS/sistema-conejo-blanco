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
