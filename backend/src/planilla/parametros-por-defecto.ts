import { TipoParametroPlanilla as T } from './planilla.enums.js';

// Tablas de Conejo Motors (cargas sociales, renta y créditos fiscales)
// copiadas tal cual — administración las edita desde la pantalla de
// parámetros cuando cambien. Lo que NO viene de Motors (jornada,
// factores de pago y provisiones) se agregó para este módulo: revisar
// con el contador antes de usar con plata real.
// Renta de salarios: valores 2026 del Decreto Ejecutivo N.º 45333-H (La Gaceta
// N.º 229, 5-dic-2025). Se actualizan cada año por IPC.
export const PARAMETROS_POR_DEFECTO: Array<{ nombre: string; valor: number; descripcion: string; tipo: T }> = [
  { nombre: 'DEDUCCION_OBRERO_SEM', valor: 5.5, descripcion: 'Deducción al empleado para SEM (CCSS), %.', tipo: T.DEDUCCION_EMPLEADO },
  { nombre: 'DEDUCCION_OBRERO_IVM', valor: 4.33, descripcion: 'Deducción al empleado para IVM (CCSS), % — 4,33 desde enero 2026 (era 4,17).', tipo: T.DEDUCCION_EMPLEADO },
  { nombre: 'DEDUCCION_BANCO_POPULAR', valor: 1.0, descripcion: 'Aporte del trabajador al Banco Popular, %.', tipo: T.DEDUCCION_EMPLEADO },

  { nombre: 'APORTE_PATRONAL_SEM', valor: 9.25, descripcion: 'Aporte patronal al SEM (CCSS), %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_IVM', valor: 5.58, descripcion: 'Aporte patronal al IVM (CCSS), % — 5,58 desde enero 2026 (era 5,42).', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_FODESAF', valor: 5.0, descripcion: 'Asignaciones Familiares (FODESAF), %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_INA', valor: 1.5, descripcion: 'INA, %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_IMAS', valor: 0.5, descripcion: 'IMAS, %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_BANCO_POPULAR_CUOTA', valor: 0.25, descripcion: 'Cuota patronal al Banco Popular, %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_ROP', valor: 2.0, descripcion: 'Régimen Obligatorio de Pensiones Complementarias (ROP), %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_FCL', valor: 1.5, descripcion: 'Fondo de Capitalización Laboral (FCL), %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_INS_RIESGOS', valor: 1.0, descripcion: 'Póliza de Riesgos del Trabajo (INS), promedio %.', tipo: T.CARGA_PATRONAL },
  { nombre: 'APORTE_PATRONAL_BANCO_POPULAR_LEY', valor: 0.25, descripcion: 'Aporte patronal al Banco Popular (Ley 7983), %.', tipo: T.CARGA_PATRONAL },

  { nombre: 'RENTA_TRAMO_1_LIMITE', valor: 918000, descripcion: 'Límite mensual del tramo exento de renta (₡).', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_1_PORCENTAJE', valor: 0, descripcion: 'Porcentaje del tramo 1, %.', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_2_LIMITE', valor: 1347000, descripcion: 'Límite superior del tramo 2 (₡).', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_2_PORCENTAJE', valor: 10, descripcion: 'Porcentaje del tramo 2, %.', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_3_LIMITE', valor: 2364000, descripcion: 'Límite superior del tramo 3 (₡).', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_3_PORCENTAJE', valor: 15, descripcion: 'Porcentaje del tramo 3, %.', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_4_LIMITE', valor: 4727000, descripcion: 'Límite superior del tramo 4 (₡).', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_4_PORCENTAJE', valor: 20, descripcion: 'Porcentaje del tramo 4, %.', tipo: T.RENTA },
  { nombre: 'RENTA_TRAMO_5_PORCENTAJE', valor: 25, descripcion: 'Porcentaje del exceso sobre el tramo 4, %.', tipo: T.RENTA },
  { nombre: 'RENTA_CREDITO_HIJO', valor: 1710, descripcion: 'Crédito fiscal mensual por cada hijo (₡).', tipo: T.CREDITO_FISCAL },
  { nombre: 'RENTA_CREDITO_CONYUGE', valor: 2590, descripcion: 'Crédito fiscal mensual por cónyuge (₡).', tipo: T.CREDITO_FISCAL },

  { nombre: 'PROVISION_AGUINALDO', valor: 8.33, descripcion: 'Provisión mensual de aguinaldo sobre el bruto, %.', tipo: T.PROVISION },
  { nombre: 'PROVISION_VACACIONES', valor: 4.17, descripcion: 'Provisión de vacaciones sobre el bruto, %.', tipo: T.PROVISION },
  { nombre: 'PROVISION_CESANTIA', valor: 5.33, descripcion: 'Provisión de cesantía sobre el bruto, %.', tipo: T.PROVISION },

  { nombre: 'HORAS_DIA_ORDINARIA', valor: 8, descripcion: 'Horas de la jornada ordinaria diaria.', tipo: T.JORNADA },
  { nombre: 'HORAS_SEMANA_PAGADAS', valor: 48, descripcion: 'Horas que se pagan por semana (lunes a sábado).', tipo: T.JORNADA },
  { nombre: 'ALMUERZO_MINUTOS', valor: 60, descripcion: 'Minutos de almuerzo que NO se pagan cuando no se marcan.', tipo: T.JORNADA },
  { nombre: 'ALMUERZO_UMBRAL_HORAS', valor: 6, descripcion: 'Si el día dura más que esto sin marcas de almuerzo, se descuenta el almuerzo.', tipo: T.JORNADA },
  { nombre: 'EXTRA_MINUTOS_MINIMOS', valor: 0, descripcion: 'Minutos de extra por día que se ignoran (0 = se paga todo lo marcado).', tipo: T.JORNADA },
  { nombre: 'TOLERANCIA_FALTANTE_MINUTOS', valor: 10, descripcion: 'Minutos faltantes por día que se toleran (llegadas tarde pequeñas). Si faltan más, se descuenta todo lo faltante.', tipo: T.JORNADA },
  { nombre: 'TOLERANCIA_MARCA_MINUTOS', valor: 10, descripcion: 'Tolerancia de ± minutos en entrada y salida: dentro, la marca cuenta como la hora del horario (ni tardanza ni extra). Fuera, cuenta la hora real.', tipo: T.JORNADA },
  { nombre: 'ALMUERZO_BLOQUE_FIJO', valor: 1, descripcion: '1 = el almuerzo es un bloque fijo que siempre se descuenta (se ignoran las marcas del medio). 0 = se usan las marcas de almuerzo.', tipo: T.JORNADA },
  { nombre: 'MARCA_SOSPECHOSA_MINUTOS', valor: 120, descripcion: 'Si la primera marca llega tantos minutos (o más) tarde, o la última sale tantos antes, se supone que falta una marca: se estima y queda en «Resolver», sin rebajar. 0 = apagado.', tipo: T.JORNADA },
  { nombre: 'REBAJO_SOLO_VERIFICADO', valor: 1, descripcion: '1 = solo se rebajan horas faltantes si el tiempo está verificado (marcas reales o supervisor). 0 = también se rebaja lo digitado a mano sin confirmar.', tipo: T.JORNADA },
  { nombre: 'TOPE_ORDINARIAS_SEMANA_HORAS', valor: 48, descripcion: 'Horas ordinarias máximas por semana (lunes a domingo). Lo que pase de ahí en la semana se paga como hora extra, desde el primer minuto.', tipo: T.JORNADA },
  { nombre: 'ALMUERZO_ANOMALIA_CORTO_MINUTOS', valor: 30, descripcion: 'Un almuerzo marcado de menos de estos minutos se anota como anomalía del empleado (no cambia el pago: el almuerzo siempre se descuenta fijo).', tipo: T.JORNADA },
  { nombre: 'INCAPACIDAD_PAGO_EMPRESA_PORCENTAJE', valor: 50, descripcion: 'En una incapacidad, % de las horas que paga la empresa (el resto lo cubre la CCSS o el INS). Se puede cambiar en cada decisión.', tipo: T.JORNADA },
  { nombre: 'FACTOR_EXTRA', valor: 1.5, descripcion: 'Multiplicador de la hora extra (tiempo y medio).', tipo: T.JORNADA },
  { nombre: 'FACTOR_FERIADO', valor: 2, descripcion: 'Multiplicador de la hora trabajada en feriado.', tipo: T.JORNADA },
  { nombre: 'FACTOR_DOMINGO', valor: 2, descripcion: 'Multiplicador de la hora trabajada en el día de descanso (domingo).', tipo: T.JORNADA },
];

export const FERIADOS_POR_DEFECTO_NOTA =
  'Los feriados no vienen precargados: se agregan desde la pantalla de parámetros, con su fecha y si son de pago obligatorio.';
