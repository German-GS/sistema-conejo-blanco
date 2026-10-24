# Reglas de asistencia (reloj de huella)

Valen desde la 1.14.0. Todo es configurable en Planilla → Parámetros (tipo «jornada»); al cambiarlo se recalculan los días sin resolver.

| Regla | Parámetro | Por defecto |
|---|---|---|
| Tolerancia ± en entrada y salida | `TOLERANCIA_MARCA_MINUTOS` | 10 |
| Almuerzo fijo (ignora marcas del medio) | `ALMUERZO_BLOQUE_FIJO` | 1 |
| Marca «sospechosa» (primera tarde / última temprana) | `MARCA_SOSPECHOSA_MINUTOS` | 120 (0 = apagado) |
| Rebajar solo tiempo verificado | `REBAJO_SOLO_VERIFICADO` | 1 |

## Cómo se lee un día
1. Se toma la **primera** y la **última** marca; lo del medio no cuenta (el almuerzo es el bloque fijo del empleado; el sábado no lleva).
2. Cada una dentro de ±10 min del horario se redondea a la hora del horario. Fuera, cuenta la real.
3. Si falta algo, el día queda **«Marca faltante (estimado)»** con la hora que propone el horario, sin rebajo ni extras:
   - marca única → si es de la mitad temprana del horario se toma como entrada (se estima la salida) y viceversa;
   - primera marca ≥ 120 min tarde → falta la entrada; última ≥ 120 min antes de la salida → falta la salida; ambas → ambiguo.
4. Lo que se rebaja son las **horas no trabajadas verificadas**: salen de marcas reales o de una hora manual / horario estándar **confirmada por un supervisor**. Sin supervisor se paga lo digitado pero no se rebaja.

## Casos reales (están como pruebas en `backend/src/planilla/reglas-asistencia.spec.ts`)
- Entrada 08:57, salida 17:00 → tardía real: 57 min no trabajados, se rebajan.
- 11:12 · 17:00 → falta la entrada (estimada 08:00), a «Resolver», sin rebajo.
- Marca única 06:4x → es la entrada; se estima la salida, a «Resolver».

## Bitácora
Cada decisión sobre un día guarda usuario, fecha, motivo, supervisor, marcas y estado antes y cómo quedó (`planilla_resoluciones`, inmutable). Se consulta en Asistencia → «4. Bitácora de correcciones» o `GET /planilla/asistencia/bitacora?desde&hasta&empleadoId`.

## Pendiente de validar
Tolerancia simétrica, almuerzo fijo y rebajo solo con verificación son decisiones de política: deben reflejar el reglamento interno y revisarse con un abogado laboral antes de usarse con plata real.
