import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { calcularLinea, claveDeFecha, clasificarDia, esperadoMinutos, horarioDelDia, opcionesEmpleado } from './calculo.js';
import { validarHorarioSemanal } from './horario.js';
import { tipoDeDia } from './asistencia.service.js';
import { EstadoDia, FrecuenciaPago, TipoSalario } from './planilla.enums.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));
const DOMINGO = '2026-10-11'; // domingo
const SABADO = '2026-10-10';
const LUNES = '2026-10-12';

// Comercio: trabaja domingo y de lunes a jueves; el viernes y el sábado no (su día libre pagado es el viernes y el sábado queda sin turno).
const tienda = {
  horarioEntrada: '08:00', horarioSalida: '17:00', horarioSalidaSabado: '13:00',
  horarioSemanal: validarHorarioSemanal({
    lun: { entrada: '08:00', salida: '17:00' }, mar: { entrada: '08:00', salida: '17:00' }, mie: { entrada: '08:00', salida: '17:00' },
    jue: { entrada: '08:00', salida: '17:00' }, vie: null, sab: { entrada: '08:00', salida: '17:00' }, dom: { entrada: '08:00', salida: '17:00' },
  }),
};
const fabrica = { ...tienda, horarioSemanal: validarHorarioSemanal({ lun: { entrada: '08:00', salida: '17:00' }, sab: { entrada: '08:00', salida: '13:00' } }) };

describe('domingo en el horario por día', () => {
  it('el domingo tiene su clave y se valida', () => {
    expect(claveDeFecha(DOMINGO)).toBe('dom');
    expect(claveDeFecha(LUNES)).toBe('lun');
    expect(() => validarHorarioSemanal({ dom: { entrada: '08:00', salida: '17:00' } })).not.toThrow();
    expect(() => validarHorarioSemanal({ dia: { entrada: '08:00', salida: '17:00' } })).toThrow(/no es un día válido/);
  });

  it('con domingo en el horario, es un día normal que se espera trabajar', () => {
    expect(horarioDelDia(tienda, DOMINGO)).toEqual({ entrada: '08:00', salida: '17:00' });
    expect(esperadoMinutos(DOMINGO, tienda, p)).toBe(480);
    expect(tipoDeDia(DOMINGO, new Map(), tienda.horarioSemanal)).toBe('ordinario');
  });

  it('sin domingo en el horario sigue siendo descanso: día especial y no se espera nada', () => {
    expect(horarioDelDia(fabrica, DOMINGO)).toBeNull();
    expect(esperadoMinutos(DOMINGO, fabrica, p)).toBe(0);
    expect(tipoDeDia(DOMINGO, new Map(), fabrica.horarioSemanal)).toBe('domingo');
    expect(tipoDeDia(DOMINGO, new Map())).toBe('domingo');
  });

  it('el domingo normal se clasifica con la jornada del empleado (almuerzo incluido) y sin pago especial', () => {
    const r = clasificarDia(['08:00', '17:00'], 'ordinario', p, undefined, esperadoMinutos(DOMINGO, tienda, p), opcionesEmpleado(tienda, p, DOMINGO));
    expect(r.estado).toBe(EstadoDia.OK);
    expect(r.minutosNetos).toBe(480);
    expect(r.minutosEspeciales).toBe(0);
    expect(r.minutosFaltantes).toBe(0);
  });

  it('el día libre (viernes) no se espera trabajar', () => {
    expect(esperadoMinutos('2026-10-09', tienda, p)).toBe(0);
  });

  it('faltar a un domingo que es parte de su semana es una ausencia que se descuenta (1/7 en comercio)', () => {
    const entrada = {
      empleado: { tipoSalario: TipoSalario.SEMANAL, montoSalario: 112000, frecuenciaPago: FrecuenciaPago.SEMANAL, sector: 'comercio' as const, tieneConyuge: false, cantidadHijos: 0 },
      desde: '2026-10-05', hasta: '2026-10-11', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
    };
    const dia = (tipoDia: 'ordinario' | 'domingo') => ({ fecha: DOMINGO, tipoDia, estado: EstadoDia.AUSENCIA, descuenta: true, minutosNetos: 0, minutosExtra: 0, minutosEspeciales: 0, feriadoPagoObligatorio: true });
    const conDomingo = calcularLinea({ ...entrada, dias: [dia('ordinario')] });
    expect(conDomingo.diasAusenciaDescontados).toBe(1);
    expect(conDomingo.descuentoAusencias).toBe(16000); // 112.000 ÷ 7
    // un domingo de descanso «ausente» no se descuenta (no se esperaba)
    expect(calcularLinea({ ...entrada, dias: [dia('domingo')] }).diasAusenciaDescontados).toBe(0);
  });

  it('sin horario por día el domingo sigue siendo descanso', () => {
    const simple = { horarioEntrada: '08:00', horarioSalida: '17:00', horarioSalidaSabado: '13:00' };
    expect(horarioDelDia(simple, DOMINGO)).toBeNull();
    expect(esperadoMinutos(DOMINGO, simple, p)).toBe(0);
    expect(esperadoMinutos(SABADO, simple, p)).toBe(300);
  });
});

describe('tope semanal de 48 horas ordinarias', () => {
  const entrada = (dias: ReturnType<typeof dia>[]) => ({
    empleado: { tipoSalario: TipoSalario.SEMANAL, montoSalario: 112000, frecuenciaPago: FrecuenciaPago.SEMANAL, sector: 'comercio' as const, tieneConyuge: false, cantidadHijos: 0 },
    dias, desde: '2026-10-05', hasta: '2026-10-11', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
  });
  const dia = (fecha: string, netos: number, extra = 0, estado: EstadoDia = EstadoDia.OK) => ({
    fecha, tipoDia: 'ordinario' as const, estado, descuenta: false, minutosNetos: netos, minutosExtra: extra, minutosEspeciales: 0, feriadoPagoObligatorio: true,
  });
  const fechas = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];

  it('seis días de 8 horas son 48: no hay extra', () => {
    expect(calcularLinea(entrada(fechas.slice(0, 6).map((f) => dia(f, 480)))).horasExtra).toBe(0);
  });

  it('siete días de 8 horas son 56: las 8 horas que pasan de 48 se pagan como extra, aunque ningún día pasó de 8', () => {
    const r = calcularLinea(entrada(fechas.map((f) => dia(f, 480))));
    expect(r.horasExtra).toBe(8);
    expect(r.montoExtra).toBe(8 * 2000 * 1.5); // hora de comercio: 112.000 ÷ 56
  });

  it('desde el primer minuto: 48 h y 1 min en la semana = 1 min de extra', () => {
    const dias = fechas.slice(0, 6).map((f) => dia(f, 480));
    dias.push(dia(fechas[6], 1));
    expect(calcularLinea(entrada(dias)).horasExtra).toBeCloseTo(1 / 60, 2);
  });

  it('no paga dos veces: la extra que ya salió por día no cuenta para el tope', () => {
    // lunes con 8 h 30 (30 min de extra diaria) y el resto de la semana en 8 h: ordinarias = 48 h, extra total = 30 min
    const dias = fechas.slice(0, 6).map((f, i) => (i === 0 ? dia(f, 510, 30) : dia(f, 480)));
    expect(calcularLinea(entrada(dias)).horasExtra).toBe(0.5);
  });

  it('un día con marca faltante (estimado) no suma al tope', () => {
    const dias = fechas.slice(0, 6).map((f) => dia(f, 480));
    dias.push(dia(fechas[6], 480, 0, EstadoDia.MARCA_FALTANTE));
    expect(calcularLinea(entrada(dias)).horasExtra).toBe(0);
  });

  it('cada semana se cuenta aparte', () => {
    // dos semanas incompletas (4 días de 8 h cada una) no se juntan
    const semana1 = fechas.slice(0, 4).map((f) => dia(f, 480));
    const semana2 = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((f) => dia(f, 480));
    expect(calcularLinea({ ...entrada([...semana1, ...semana2]), hasta: '2026-10-18' }).horasExtra).toBe(0);
  });
});
