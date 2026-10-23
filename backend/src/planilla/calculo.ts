// Lógica pura de planilla (sin base de datos): interpretar las marcas de un
// día y calcular una línea de planilla. Todo parametrizado — nada de
// porcentajes ni horas escritos acá. Se prueba en calculo.spec.ts.
import { CLAVES_DIA, type ClaveDia, type HorarioSemanal } from './horario.js';
import { redondear } from '../common/utils/dinero.util.js';
import { FrecuenciaPago, TipoSalario, EstadoDia, TipoResolucionDia } from './planilla.enums.js';

export type Parametros = Record<string, number>;
export type TipoDia = 'ordinario' | 'domingo' | 'feriado';

export function normalizarNumeroReloj(valor: unknown): string {
  const texto = String(valor ?? '').trim();
  const sinCeros = texto.replace(/^0+/, '');
  return sinCeros === '' && texto !== '' ? '0' : sinCeros;
}

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function deMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function diaSemana(fechaISO: string): number {
  return new Date(`${fechaISO}T00:00:00Z`).getUTCDay(); // 0 = domingo
}

export interface ResultadoDia {
  estado: EstadoDia;
  marcas: string[];
  minutosBrutos: number;
  minutosAlmuerzo: number;
  almuerzoEstimado: boolean;
  minutosNetos: number;
  minutosExtra: number;
  minutosEspeciales: number;
  descuenta: boolean;
  // Ausencia parcial: minutos que faltaron para completar la jornada y
  // cuántos de esos se descuentan (0 si están dentro de la tolerancia o
  // fueron justificados).
  minutosFaltantes: number;
  minutosDescontar: number;
  motivoRevision: string | null;
}

function vacio(estado: EstadoDia, marcas: string[], motivo: string | null, descuenta = false): ResultadoDia {
  return {
    estado,
    marcas,
    minutosBrutos: 0,
    minutosAlmuerzo: 0,
    almuerzoEstimado: false,
    minutosNetos: 0,
    minutosExtra: 0,
    minutosEspeciales: 0,
    descuenta,
    minutosFaltantes: 0,
    minutosDescontar: 0,
    motivoRevision: motivo,
  };
}

// Reparte los minutos netos entre ordinarios, extra y especiales (domingo/
// feriado) según el tipo de día.
function repartir(netos: number, tipoDia: TipoDia, p: Parametros, horasDiaMin?: number): { extra: number; especiales: number } {
  if (tipoDia !== 'ordinario') return { extra: 0, especiales: netos };
  let extra = Math.max(0, netos - (horasDiaMin ?? p.HORAS_DIA_ORDINARIA * 60));
  if (extra < (p.EXTRA_MINUTOS_MINIMOS ?? 0)) extra = 0;
  return { extra, especiales: 0 };
}

// Lo que cambia por empleado al leer las marcas: cuántas horas ordinarias
// trabaja por día (según sus horas semanales) y cómo se trata su almuerzo.
export interface OpcionesDia {
  // Minutos ordinarios por día (Lun–Sáb); lo que pasa de esto es hora extra.
  horasDiaMin?: number;
  // Minutos de almuerzo que se descuentan cuando el día trae solo entrada y salida.
  almuerzoMin?: number;
  // false = el empleado no marca almuerzo (anda en ruta): descontarlo no es un «estimado».
  marcaAlmuerzo?: boolean;
  // Puesto de confianza: sin jornada fija. Las marcas son informativas: no hay
  // horas extra ni descuento por horas faltantes, y no se piden decisiones por marcas sueltas.
  sinJornada?: boolean;
}

export interface DatosJornadaEmpleado {
  horasSemana?: string | number | null;
  esConfianza?: boolean | null;
  almuerzoMarca?: boolean | null;
  almuerzoMinutos?: number | null;
}

// Clave del día (lun…sab) de una fecha; null para el domingo.
export function claveDeFecha(fecha: string): ClaveDia | null {
  const d = diaSemana(fecha);
  return d === 0 ? null : CLAVES_DIA[d - 1];
}

// Entrada y salida de un día según el horario del empleado (el suyo, o el de
// la fábrica si se le aplicó), o el horario simple de antes si no hay uno por
// día. null = ese día no se trabaja.
export function horarioDelDia(e: HorarioEmpleado, fecha: string): { entrada: string; salida: string } | null {
  const clave = claveDeFecha(fecha);
  if (!clave) return null;
  if (e.horarioSemanal) return e.horarioSemanal[clave] ?? null;
  return { entrada: e.horarioEntrada, salida: clave === 'sab' ? e.horarioSalidaSabado : e.horarioSalida };
}

// Horas netas (minutos) que dura la jornada de ese día según el horario por
// día: de la entrada a la salida, menos el almuerzo (el sábado no lleva).
function netosDelHorario(e: HorarioEmpleado, fecha: string, p: Parametros): number | null {
  const h = e.horarioSemanal ? horarioDelDia(e, fecha) : null;
  if (!h) return null;
  const almuerzo = claveDeFecha(fecha) === 'sab' ? 0 : (e.almuerzoMinutos ?? p.ALMUERZO_MINUTOS);
  return Math.max(0, aMinutos(h.salida) - aMinutos(h.entrada) - almuerzo);
}

export function opcionesEmpleado(e: DatosJornadaEmpleado & Partial<HorarioEmpleado>, p: Parametros, fecha?: string): OpcionesDia {
  const horas = e.horasSemana != null ? Number(e.horasSemana) : 0;
  const delHorario = fecha && e.horarioSemanal && e.horarioEntrada !== undefined ? netosDelHorario(e as HorarioEmpleado, fecha, p) : null;
  return {
    horasDiaMin: delHorario ?? (horas > 0 ? Math.round((horas / 6) * 60) : p.HORAS_DIA_ORDINARIA * 60),
    almuerzoMin: e.almuerzoMinutos ?? p.ALMUERZO_MINUTOS,
    marcaAlmuerzo: e.almuerzoMarca ?? true,
    sinJornada: e.esConfianza === true,
  };
}

// Interpreta las marcas de un día SIN confiar en las columnas del reloj
// (Entrada/Comida/Salida): en la tarjeta impresa se vio que a veces mete
// dos marcas en la misma columna o deja una sola. Se ordenan todas las
// marcas del día y se decide por cuántas son.
export function clasificarDia(
  marcasTexto: string[],
  tipoDia: TipoDia,
  p: Parametros,
  almuerzoManual?: number,
  esperadoMinutos = 0,
  op: OpcionesDia = {},
): ResultadoDia {
  const minutos = [...new Set(marcasTexto.map(aMinutos))].sort((a, b) => a - b);
  // Doble marca del dedo: dos marcas a menos de 2 minutos son una sola.
  const m = minutos.filter((v, i) => i === 0 || v - minutos[i - 1] >= 2);
  const marcas = m.map(deMinutos);

  if (m.length === 0) {
    if (tipoDia === 'domingo') return vacio(EstadoDia.OK, marcas, null);
    if (tipoDia === 'feriado') return vacio(EstadoDia.FERIADO, marcas, null);
    return vacio(EstadoDia.AUSENCIA, marcas, 'Sin marcas: se descuenta el día completo salvo que se justifique.', true);
  }
  if (op.sinJornada) {
    // Cargo de confianza: cualquier cantidad de marcas está bien.
    const brutos = m.length >= 2 ? m[m.length - 1] - m[0] : 0;
    return {
      estado: EstadoDia.OK,
      marcas,
      minutosBrutos: brutos,
      minutosAlmuerzo: 0,
      almuerzoEstimado: false,
      minutosNetos: brutos,
      minutosExtra: 0,
      minutosEspeciales: tipoDia === 'ordinario' ? 0 : brutos,
      descuenta: false,
      minutosFaltantes: 0,
      minutosDescontar: 0,
      motivoRevision: null,
    };
  }
  if (m.length === 1) {
    return vacio(
      EstadoDia.MARCA_FALTANTE,
      marcas,
      `Una sola marca (${marcas[0]}): falta la entrada o la salida.`,
    );
  }

  let entrada = m[0];
  let salida = m[m.length - 1];
  let almuerzo = 0;
  let estimado = false;

  if (m.length === 2) {
    if (salida - entrada < 30) {
      return vacio(EstadoDia.MARCAS_AMBIGUAS, marcas, `Dos marcas casi seguidas (${marcas.join(' y ')}): parece una doble marca.`);
    }
  } else if (m.length === 4) {
    almuerzo = m[2] - m[1];
    if (almuerzo < 0 || almuerzo > 240) {
      return vacio(EstadoDia.MARCAS_AMBIGUAS, marcas, `El almuerzo (${marcas[1]} a ${marcas[2]}) no tiene sentido.`);
    }
  } else {
    return vacio(
      EstadoDia.MARCAS_AMBIGUAS,
      marcas,
      `${m.length} marcas (${marcas.join(', ')}): no se sabe cuáles son entradas y cuáles salidas.`,
    );
  }

  const brutos = salida - entrada;
  if (m.length === 2) {
    if (almuerzoManual !== undefined) {
      almuerzo = almuerzoManual;
    } else if (brutos > p.ALMUERZO_UMBRAL_HORAS * 60) {
      almuerzo = op.almuerzoMin ?? p.ALMUERZO_MINUTOS;
      estimado = op.marcaAlmuerzo !== false;
    }
  }
  const netos = Math.max(0, brutos - almuerzo);
  const { extra, especiales } = repartir(netos, tipoDia, p, op.horasDiaMin);
  const faltantes = tipoDia === 'ordinario' && esperadoMinutos > 0 ? Math.max(0, esperadoMinutos - netos) : 0;
  const descontar = faltantes > (p.TOLERANCIA_FALTANTE_MINUTOS ?? 10) ? faltantes : 0;

  return {
    estado: EstadoDia.OK,
    marcas,
    minutosBrutos: brutos,
    minutosAlmuerzo: almuerzo,
    almuerzoEstimado: estimado,
    minutosNetos: netos,
    minutosExtra: extra,
    minutosEspeciales: especiales,
    descuenta: false,
    minutosFaltantes: faltantes,
    minutosDescontar: descontar,
    motivoRevision: null,
  };
}

export interface DatosResolucion {
  entrada?: string;
  salida?: string;
  almuerzoMinutos?: number;
  // Marcas originales del día (para decidir sobre horas faltantes).
  marcas?: string[];
  // En hora manual / horario estándar: no descontar las horas faltantes.
  justificarHoras?: boolean;
}

export interface HorarioEmpleado extends DatosJornadaEmpleado {
  // Horario por día (el del empleado o, si no tiene, el de la fábrica).
  horarioSemanal?: HorarioSemanal | null;
  horarioEntrada: string;
  horarioSalida: string;
  horarioSalidaSabado: string;
}

// Minutos que el empleado debería trabajar (netos) en un día ordinario:
// 8 h de lunes a viernes; el sábado, de la entrada a la salida de sábado.
export function esperadoMinutos(fecha: string, horario: HorarioEmpleado, p: Parametros): number {
  if (horario.horarioSemanal) return netosDelHorario(horario, fecha, p) ?? 0;
  if (diaSemana(fecha) === 6) {
    return Math.max(0, aMinutos(horario.horarioSalidaSabado) - aMinutos(horario.horarioEntrada));
  }
  return opcionesEmpleado(horario, p, fecha).horasDiaMin!;
}

// Aplica la decisión de administración sobre un día problemático.
export function aplicarResolucion(
  tipo: TipoResolucionDia,
  datos: DatosResolucion,
  fecha: string,
  tipoDia: TipoDia,
  horario: HorarioEmpleado,
  p: Parametros,
): ResultadoDia {
  if (tipo === TipoResolucionDia.AUSENCIA_INJUSTIFICADA) {
    return vacio(EstadoDia.AUSENCIA, [], null, true);
  }
  if (tipo === TipoResolucionDia.AUSENCIA_JUSTIFICADA) {
    return vacio(EstadoDia.AUSENCIA, [], null, false);
  }
  if (tipo === TipoResolucionDia.HORARIO_ESTANDAR) {
    const tramo = horarioDelDia(horario, fecha);
    if (!tramo) throw new Error('Ese día no tiene horario: elija otra opción (hora manual o ausencia).');
    const marcas = [tramo.entrada, tramo.salida];
    return clasificarDia(marcas, tipoDia, p, undefined, esperadoMinutos(fecha, horario, p), opcionesEmpleado(horario, p, fecha));
  }
  if (tipo === TipoResolucionDia.ALMUERZO_MANUAL) {
    // El día trae entrada y salida: administración dice cuánto almorzó.
    if (datos.almuerzoMinutos === undefined) throw new Error('Indique cuántos minutos de almuerzo.');
    const r = clasificarDia(datos.marcas ?? [], tipoDia, p, datos.almuerzoMinutos, esperadoMinutos(fecha, horario, p), opcionesEmpleado(horario, p, fecha));
    if (r.estado !== EstadoDia.OK || r.marcas.length !== 2) {
      throw new Error('El almuerzo solo se ajusta en días con entrada y salida (sin marcas de almuerzo).');
    }
    if (datos.justificarHoras) r.minutosDescontar = 0;
    return r;
  }
  if (tipo === TipoResolucionDia.HORAS_JUSTIFICADAS || tipo === TipoResolucionDia.HORAS_INJUSTIFICADAS) {
    const r = clasificarDia(datos.marcas ?? [], tipoDia, p, datos.almuerzoMinutos, esperadoMinutos(fecha, horario, p), opcionesEmpleado(horario, p, fecha));
    if (r.estado !== EstadoDia.OK) throw new Error('Este día no tiene marcas completas: resolvelo con hora manual.');
    if (r.minutosFaltantes === 0) throw new Error('Este día no tiene horas faltantes.');
    r.minutosDescontar = tipo === TipoResolucionDia.HORAS_JUSTIFICADAS ? 0 : r.minutosFaltantes;
    return r;
  }
  // HORA_MANUAL
  if (!datos.entrada || !datos.salida) throw new Error('Falta la hora de entrada y de salida.');
  if (aMinutos(datos.salida) <= aMinutos(datos.entrada)) throw new Error('La salida debe ser después de la entrada.');
  const r = clasificarDia([datos.entrada, datos.salida], tipoDia, p, datos.almuerzoMinutos, esperadoMinutos(fecha, horario, p), opcionesEmpleado(horario, p, fecha));
  if (r.estado !== EstadoDia.OK) throw new Error('Las horas indicadas no son válidas (la salida debe ser al menos 30 minutos después de la entrada).');
  if (datos.justificarHoras) r.minutosDescontar = 0;
  return r;
}

// ---------------------------------------------------------------------------
// Renta
// ---------------------------------------------------------------------------

export function impuestoRenta(baseMensual: number, p: Parametros): number {
  const l1 = p.RENTA_TRAMO_1_LIMITE;
  const l2 = p.RENTA_TRAMO_2_LIMITE;
  const l3 = p.RENTA_TRAMO_3_LIMITE;
  const l4 = p.RENTA_TRAMO_4_LIMITE;
  let impuesto = 0;
  if (baseMensual > l1) impuesto += (Math.min(baseMensual, l2) - l1) * (p.RENTA_TRAMO_2_PORCENTAJE / 100);
  if (baseMensual > l2) impuesto += (Math.min(baseMensual, l3) - l2) * (p.RENTA_TRAMO_3_PORCENTAJE / 100);
  if (baseMensual > l3) impuesto += (Math.min(baseMensual, l4) - l3) * (p.RENTA_TRAMO_4_PORCENTAJE / 100);
  if (baseMensual > l4) impuesto += (baseMensual - l4) * (p.RENTA_TRAMO_5_PORCENTAJE / 100);
  return impuesto;
}

// ---------------------------------------------------------------------------
// Línea de planilla
// ---------------------------------------------------------------------------

export interface DiaParaPago {
  fecha: string;
  tipoDia: TipoDia;
  estado: EstadoDia;
  descuenta: boolean;
  minutosNetos: number;
  minutosExtra: number;
  minutosEspeciales: number;
  feriadoPagoObligatorio: boolean;
  minutosDescontar?: number;
}

export interface EmpleadoParaPago {
  // Horas ordinarias por semana de este empleado (vacío = las del sistema).
  horasSemana?: number | null;
  // Cómo se paga el día de descanso (domingo) a quien cobra por semana:
  //  - 'comercio': el descanso está incluido en el pago semanal (se paga aunque
  //    no se trabaje) y la hora vale el salario semanal ÷ 56 (7 días × 8 h);
  //  - 'industria' (o vacío): se paga solo el tiempo efectivamente laborado de
  //    lunes a sábado (÷ 48) y el domingo no se paga si no se trabaja.
  sector?: 'industria' | 'comercio' | null;
  tipoSalario: TipoSalario;
  montoSalario: number;
  frecuenciaPago: FrecuenciaPago;
  tieneConyuge: boolean;
  cantidadHijos: number;
}

export interface DeudaParaPago {
  id: string;
  descripcion: string;
  cuota: number;
  saldo: number;
}

export interface EntradaLinea {
  empleado: EmpleadoParaPago;
  dias: DiaParaPago[];
  desde: string;
  hasta: string;
  p: Parametros;
  // Lo ya pagado a este empleado en el mismo mes (otras planillas) — la
  // renta se calcula sobre lo acumulado del mes y se retiene la diferencia.
  brutoPrevioMes: number;
  rentaPrevioMes: number;
  deudas: DeudaParaPago[];
}

export interface ResultadoLinea {
  salarioBase: number;
  tarifaHora: number;
  diasAusenciaDescontados: number;
  descuentoAusencias: number;
  horasAusentes: number;
  descuentoHoras: number;
  horasExtra: number;
  montoExtra: number;
  horasEspeciales: number;
  montoEspeciales: number;
  bruto: number;
  sem: number;
  ivm: number;
  bancoPopular: number;
  renta: number;
  deudasDescontadas: number;
  detalleDeudas: Array<{ id: string; descripcion: string; monto: number }>;
  totalDeducciones: number;
  neto: number;
  cargasPatronales: number;
  desgloseCargas: Record<string, number>;
  provisiones: number;
  desgloseProvisiones: Record<string, number>;
}

export function diasLaborables(desde: string, hasta: string): string[] {
  const resultado: string[] = [];
  for (let f = desde; f <= hasta; f = siguiente(f)) {
    if (diaSemana(f) !== 0) resultado.push(f);
  }
  return resultado;
}

function siguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function calcularLinea(e: EntradaLinea): ResultadoLinea {
  const { empleado, dias, p } = e;
  const horasSemana = empleado.horasSemana && empleado.horasSemana > 0 ? empleado.horasSemana : p.HORAS_SEMANA_PAGADAS;
  const horasDia = empleado.horasSemana && empleado.horasSemana > 0 ? empleado.horasSemana / 6 : p.HORAS_DIA_ORDINARIA;

  // Quien cobra por quincena o por mes ya tiene el día de descanso (y los
  // feriados) dentro del salario — art. 152 del Código de Trabajo: si se
  // trabaja, solo se suma lo que falta para llegar al doble. Lo mismo vale
  // para el salario semanal del comercio, donde el descanso se paga aunque no
  // se trabaje. En la industria con pago semanal solo por el tiempo
  // efectivamente laborado, y en el pago por hora, el domingo no se paga si no
  // se trabaja y, si se trabaja, se paga el factor completo.
  const comercioSemanal = empleado.tipoSalario === TipoSalario.SEMANAL && empleado.sector === 'comercio';
  const descansoIncluido =
    empleado.frecuenciaPago === FrecuenciaPago.QUINCENAL || empleado.frecuenciaPago === FrecuenciaPago.MENSUAL || comercioSemanal;

  // Tarifa por hora según lo pactado.
  const tarifaHora =
    empleado.tipoSalario === TipoSalario.POR_HORA
      ? empleado.montoSalario
      : empleado.tipoSalario === TipoSalario.SEMANAL
        ? empleado.montoSalario / (comercioSemanal && !(empleado.horasSemana && empleado.horasSemana > 0) ? 7 * horasDia : horasSemana)
        : empleado.montoSalario / 30 / horasDia;

  // Salario del período con asistencia completa.
  let salarioBase: number;
  if (empleado.tipoSalario === TipoSalario.POR_HORA) {
    salarioBase = tarifaHora * horasDia * diasLaborables(e.desde, e.hasta).length;
  } else if (empleado.tipoSalario === TipoSalario.SEMANAL) {
    salarioBase = empleado.montoSalario;
  } else if (empleado.frecuenciaPago === FrecuenciaPago.MENSUAL) {
    salarioBase = empleado.montoSalario;
  } else if (empleado.frecuenciaPago === FrecuenciaPago.QUINCENAL) {
    salarioBase = empleado.montoSalario / 2;
  } else {
    salarioBase = (empleado.montoSalario / 30) * 7;
  }

  let diasAusencia = 0;
  let minutosAusentes = 0;
  let minutosExtra = 0;
  let minutosEspeciales = 0;
  let montoEspeciales = 0;
  for (const d of dias) {
    if (d.tipoDia === 'domingo' && d.minutosEspeciales === 0) continue;
    const laborable = diaSemana(d.fecha) !== 0;
    if (d.descuenta && laborable) diasAusencia += 1;
    // Feriado de pago NO obligatorio sin trabajar: a quien no cobra salario
    // fijo mensual/quincenal no se le paga ese día.
    if (
      d.tipoDia === 'feriado' &&
      !d.feriadoPagoObligatorio &&
      d.minutosNetos === 0 &&
      !descansoIncluido &&
      laborable
    ) {
      diasAusencia += 1;
    }
    if (!d.descuenta) minutosAusentes += d.minutosDescontar ?? 0;
    minutosExtra += d.minutosExtra;
    if (d.minutosEspeciales > 0) {
      minutosEspeciales += d.minutosEspeciales;
      const factor = d.tipoDia === 'feriado' ? p.FACTOR_FERIADO : p.FACTOR_DOMINGO;
      const multiplicador = descansoIncluido ? factor - 1 : factor;
      montoEspeciales += (d.minutosEspeciales / 60) * tarifaHora * multiplicador;
    }
  }

  const descuentoAusencias = redondear(diasAusencia * horasDia * tarifaHora);
  const horasAusentes = redondear(minutosAusentes / 60);
  const descuentoHoras = redondear((minutosAusentes / 60) * tarifaHora);
  const horasExtra = redondear(minutosExtra / 60);
  const montoExtra = redondear(horasExtra * tarifaHora * p.FACTOR_EXTRA);
  const bruto = redondear(salarioBase - descuentoAusencias - descuentoHoras + montoExtra + redondear(montoEspeciales));

  const sem = redondear((bruto * p.DEDUCCION_OBRERO_SEM) / 100);
  const ivm = redondear((bruto * p.DEDUCCION_OBRERO_IVM) / 100);
  const bancoPopular = redondear((bruto * p.DEDUCCION_BANCO_POPULAR) / 100);

  // Renta: sobre lo acumulado del mes (bruto menos SEM e IVM), menos los
  // créditos familiares, y se retiene solo lo que falta respecto de lo ya
  // retenido en planillas anteriores del mismo mes.
  const brutoMes = e.brutoPrevioMes + bruto;
  const baseMes = brutoMes * (1 - (p.DEDUCCION_OBRERO_SEM + p.DEDUCCION_OBRERO_IVM) / 100);
  const creditos =
    (empleado.tieneConyuge ? p.RENTA_CREDITO_CONYUGE : 0) + empleado.cantidadHijos * p.RENTA_CREDITO_HIJO;
  const rentaAcumulada = Math.max(0, impuestoRenta(baseMes, p) - creditos);
  const renta = redondear(Math.max(0, rentaAcumulada - e.rentaPrevioMes));

  // Deudas con la empresa: nunca se descuenta más de lo que queda después
  // de los rebajos de ley, ni más del saldo.
  let disponible = bruto - sem - ivm - bancoPopular - renta;
  const detalleDeudas: ResultadoLinea['detalleDeudas'] = [];
  let deudasDescontadas = 0;
  for (const deuda of e.deudas) {
    const monto = redondear(Math.max(0, Math.min(deuda.cuota, deuda.saldo, disponible)));
    if (monto <= 0) continue;
    detalleDeudas.push({ id: deuda.id, descripcion: deuda.descripcion, monto });
    deudasDescontadas = redondear(deudasDescontadas + monto);
    disponible -= monto;
  }

  const totalDeducciones = redondear(sem + ivm + bancoPopular + renta + deudasDescontadas);
  const neto = redondear(bruto - totalDeducciones);

  const desgloseCargas: Record<string, number> = {};
  let cargasPatronales = 0;
  const desgloseProvisiones: Record<string, number> = {};
  let provisiones = 0;
  for (const [nombre, valor] of Object.entries(p)) {
    if (nombre.startsWith('APORTE_PATRONAL_')) {
      const monto = redondear((bruto * valor) / 100);
      desgloseCargas[nombre] = monto;
      cargasPatronales = redondear(cargasPatronales + monto);
    } else if (nombre.startsWith('PROVISION_')) {
      const monto = redondear((bruto * valor) / 100);
      desgloseProvisiones[nombre] = monto;
      provisiones = redondear(provisiones + monto);
    }
  }

  return {
    salarioBase: redondear(salarioBase),
    tarifaHora: redondear(tarifaHora),
    diasAusenciaDescontados: diasAusencia,
    descuentoAusencias,
    horasAusentes,
    descuentoHoras,
    horasExtra,
    montoExtra,
    horasEspeciales: redondear(minutosEspeciales / 60),
    montoEspeciales: redondear(montoEspeciales),
    bruto,
    sem,
    ivm,
    bancoPopular,
    renta,
    deudasDescontadas,
    detalleDeudas,
    totalDeducciones,
    neto,
    cargasPatronales,
    desgloseCargas,
    provisiones,
    desgloseProvisiones,
  };
}
