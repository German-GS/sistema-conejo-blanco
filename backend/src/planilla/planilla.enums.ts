export enum TipoSalario {
  MENSUAL = 'mensual',
  SEMANAL = 'semanal',
  POR_HORA = 'por_hora',
}

export enum FrecuenciaPago {
  SEMANAL = 'semanal',
  QUINCENAL = 'quincenal',
  MENSUAL = 'mensual',
}

export enum TipoParametroPlanilla {
  DEDUCCION_EMPLEADO = 'deduccion_empleado',
  CARGA_PATRONAL = 'carga_patronal',
  PROVISION = 'provision',
  RENTA = 'renta',
  CREDITO_FISCAL = 'credito_fiscal',
  JORNADA = 'jornada',
}

// Cómo quedó un día después de leer las marcas del reloj.
//  - ok: marcas coherentes, se calcula solo.
//  - ausencia: ningún marcaje en un día laboral — se descuenta el día
//    completo salvo que el administrador la justifique.
//  - marca_faltante / marcas_ambiguas: alguien tiene que decidir (ver
//    TipoResolucionDia) — no se puede aprobar una planilla con estos.
//  - feriado: feriado sin marcas, se paga según la ley.
export enum EstadoDia {
  OK = 'ok',
  AUSENCIA = 'ausencia',
  MARCA_FALTANTE = 'marca_faltante',
  MARCAS_AMBIGUAS = 'marcas_ambiguas',
  FERIADO = 'feriado',
}

export enum TipoResolucionDia {
  HORARIO_ESTANDAR = 'horario_estandar',
  HORA_MANUAL = 'hora_manual',
  AUSENCIA_INJUSTIFICADA = 'ausencia_injustificada',
  AUSENCIA_JUSTIFICADA = 'ausencia_justificada',
  // El día tiene marcas pero trabajó menos horas de las debidas (llegó tarde,
  // salió antes, almuerzo largo): se decide si esas horas se descuentan.
  // El día trae entrada y salida: se dice cuánto fue el almuerzo (ej. 30 min).
  ALMUERZO_MANUAL = 'almuerzo_manual',
  HORAS_JUSTIFICADAS = 'horas_justificadas',
  HORAS_INJUSTIFICADAS = 'horas_injustificadas',
  // Incapacidad médica: la empresa paga solo una parte de esas horas (50 % por defecto, el resto lo cubre la CCSS o el INS).
  INCAPACIDAD = 'incapacidad',
}

export enum EstadoPlanilla {
  BORRADOR = 'borrador',
  APROBADA = 'aprobada',
  PAGADA = 'pagada',
  // Aprobada por error o con datos incorrectos: se reversó su asiento y puede
  // volver a generarse. Nunca se borra.
  ANULADA = 'anulada',
}

// Planillas que cuentan como emitidas (aprobadas o ya pagadas): excluye borradores y anuladas.
export const ESTADOS_VIGENTES = [EstadoPlanilla.APROBADA, EstadoPlanilla.PAGADA];
