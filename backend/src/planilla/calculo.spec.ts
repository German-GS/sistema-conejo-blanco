import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { aplicarResolucion, calcularLinea, clasificarDia, esperadoMinutos, horarioDelDia, impuestoRenta, opcionesEmpleado, normalizarNumeroReloj } from './calculo.js';
import { HORARIO_BASE_POR_DEFECTO, validarHorarioSemanal } from './horario.js';
import { EstadoDia, FrecuenciaPago, TipoResolucionDia, TipoSalario } from './planilla.enums.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));
// Reglas anteriores: almuerzo según las marcas, sin bloque fijo.
const pLegado = { ...p, ALMUERZO_BLOQUE_FIJO: 0 };
const horario = { horarioEntrada: '08:00', horarioSalida: '17:00', horarioSalidaSabado: '13:00' };

describe('normalizarNumeroReloj', () => {
  it('trata 000000001, 1 y 01 como la misma persona', () => {
    expect(normalizarNumeroReloj('000000001')).toBe('1');
    expect(normalizarNumeroReloj(1)).toBe('1');
    expect(normalizarNumeroReloj('01')).toBe('1');
  });
});

describe('clasificarDia — casos reales de la tarjeta de tiempo', () => {
  it('día normal con almuerzo marcado (martes)', () => {
    const r = clasificarDia(['08:02', '12:02', '13:02', '17:06'], 'ordinario', p);
    expect(r.estado).toBe(EstadoDia.OK);
    expect(r.minutosAlmuerzo).toBe(60);
    expect(r.minutosNetos).toBe(8 * 60 + 4);
    // El reloj decía 1:04 de extra: descontando el almuerzo son solo 4 minutos.
    expect(r.minutosExtra).toBe(4);
  });

  it('semana sin marcas = ausencia que descuenta (Ronald)', () => {
    const r = clasificarDia([], 'ordinario', p);
    expect(r.estado).toBe(EstadoDia.AUSENCIA);
    expect(r.descuenta).toBe(true);
  });

  it('una sola marca = marca faltante (Santiago, miércoles)', () => {
    const r = clasificarDia(['17:32'], 'ordinario', p);
    expect(r.estado).toBe(EstadoDia.MARCA_FALTANTE);
    expect(r.descuenta).toBe(false);
  });

  it('tres marcas = ambiguas con las marcas de almuerzo en uso (lunes)', () => {
    const r = clasificarDia(['08:11', '17:01', '13:00'], 'ordinario', pLegado);
    expect(r.estado).toBe(EstadoDia.MARCAS_AMBIGUAS);
  });

  it('con almuerzo fijo, las marcas de almuerzo se ignoran: 3 o 5 marcas ya no son ambiguas', () => {
    const tres = clasificarDia(['08:11', '13:00', '17:01'], 'ordinario', p);
    expect(tres.estado).toBe(EstadoDia.OK);
    expect(tres.minutosAlmuerzo).toBe(60);
    // almuerzo largo marcado (90 min): igual se descuenta el bloque fijo
    const largo = clasificarDia(['08:00', '12:00', '13:30', '17:00'], 'ordinario', p);
    expect(largo.minutosAlmuerzo).toBe(60);
    expect(largo.minutosNetos).toBe(480);
    expect(clasificarDia(['08:00', '10:00', '12:00', '13:00', '17:00'], 'ordinario', p).estado).toBe(EstadoDia.OK);
  });

  it('sin marcas de almuerzo y jornada larga: se descuenta la hora de almuerzo (Santiago, lunes)', () => {
    const r = clasificarDia(['07:53', '17:21'], 'ordinario', pLegado);
    expect(r.almuerzoEstimado).toBe(true);
    expect(r.minutosNetos).toBe(9 * 60 + 28 - 60);
    expect(r.minutosExtra).toBe(28);
  });

  it('sábado corto no descuenta almuerzo', () => {
    const r = clasificarDia(['07:51', '13:00'], 'ordinario', p);
    expect(r.minutosAlmuerzo).toBe(0);
    expect(r.minutosNetos).toBe(5 * 60 + 9);
    expect(r.minutosExtra).toBe(0);
  });

  it('doble marca del dedo cuenta una sola vez', () => {
    const r = clasificarDia(['08:00', '08:01', '17:00'], 'ordinario', p);
    expect(r.marcas).toEqual(['08:00', '17:00']);
    expect(r.estado).toBe(EstadoDia.OK);
  });

  it('domingo trabajado va a minutos especiales, no a extra', () => {
    const r = clasificarDia(['08:00', '12:00'], 'domingo', p);
    expect(r.minutosEspeciales).toBe(240);
    expect(r.minutosExtra).toBe(0);
  });
});

describe('aplicarResolucion', () => {
  it('horario estándar completa el día con lo pactado', () => {
    const r = aplicarResolucion(TipoResolucionDia.HORARIO_ESTANDAR, {}, '2026-08-05', 'ordinario', horario, p);
    expect(r.minutosNetos).toBe(480);
    expect(r.minutosExtra).toBe(0);
  });
  it('hora manual usa lo digitado', () => {
    const r = aplicarResolucion(
      TipoResolucionDia.HORA_MANUAL,
      { entrada: '07:50', salida: '17:32', almuerzoMinutos: 60 },
      '2026-08-05',
      'ordinario',
      horario,
      p,
    );
    expect(r.minutosNetos).toBe(9 * 60 + 42 - 60);
    expect(r.minutosExtra).toBe(42);
  });
  it('ausencia justificada no descuenta; injustificada sí', () => {
    expect(aplicarResolucion(TipoResolucionDia.AUSENCIA_JUSTIFICADA, {}, '2026-08-05', 'ordinario', horario, p).descuenta).toBe(false);
    expect(aplicarResolucion(TipoResolucionDia.AUSENCIA_INJUSTIFICADA, {}, '2026-08-05', 'ordinario', horario, p).descuenta).toBe(true);
  });
});

describe('impuestoRenta (tramos 2026, Decreto 45333-H)', () => {
  it('exento bajo el primer tramo', () => expect(impuestoRenta(900000, p)).toBe(0));
  it('₡2.000.000 de salario → base 1.806.600', () => {
    const base = 2_000_000 * (1 - 0.0967);
    expect(impuestoRenta(base, p)).toBeCloseTo((1347000 - 918000) * 0.1 + (base - 1347000) * 0.15, 2);
  });
});

const empleadoMensual = {
  tipoSalario: TipoSalario.MENSUAL,
  montoSalario: 600000,
  frecuenciaPago: FrecuenciaPago.MENSUAL,
  tieneConyuge: false,
  cantidadHijos: 0,
};
const base = { desde: '2026-08-01', hasta: '2026-08-31', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [], dias: [] };

describe('calcularLinea', () => {
  it('mensual sin novedades: bruto = salario, CCSS 10.83%, sin renta', () => {
    const r = calcularLinea({ ...base, empleado: empleadoMensual });
    expect(r.bruto).toBe(600000);
    expect(r.sem).toBe(33000);
    expect(r.ivm).toBe(25980);
    expect(r.bancoPopular).toBe(6000);
    expect(r.renta).toBe(0);
    expect(r.neto).toBe(535020);
    expect(r.cargasPatronales).toBeCloseTo(600000 * 0.2683, 0);
  });

  it('un día de ausencia injustificada descuenta 1/30 del salario', () => {
    const dia = { fecha: '2026-08-05', tipoDia: 'ordinario' as const, estado: EstadoDia.AUSENCIA, descuenta: true, minutosNetos: 0, minutosExtra: 0, minutosEspeciales: 0, feriadoPagoObligatorio: true };
    const r = calcularLinea({ ...base, empleado: empleadoMensual, dias: [dia] });
    expect(r.descuentoAusencias).toBe(20000);
    expect(r.bruto).toBe(580000);
  });

  it('extras a tiempo y medio', () => {
    const dia = { fecha: '2026-08-05', tipoDia: 'ordinario' as const, estado: EstadoDia.OK, descuenta: false, minutosNetos: 540, minutosExtra: 60, minutosEspeciales: 0, feriadoPagoObligatorio: true };
    const r = calcularLinea({ ...base, empleado: empleadoMensual, dias: [dia] });
    // tarifa = 600000/30/8 = 2500 → 1 h × 2500 × 1.5
    expect(r.montoExtra).toBe(3750);
  });

  it('por hora semanal: 6 días × 8 h', () => {
    const r = calcularLinea({
      ...base,
      desde: '2026-08-03',
      hasta: '2026-08-09',
      empleado: { ...empleadoMensual, tipoSalario: TipoSalario.POR_HORA, montoSalario: 2000, frecuenciaPago: FrecuenciaPago.SEMANAL },
    });
    expect(r.salarioBase).toBe(2000 * 8 * 6);
  });

  it('renta acumulada del mes: la segunda semana solo retiene la diferencia', () => {
    const emp = { ...empleadoMensual, montoSalario: 2_000_000, frecuenciaPago: FrecuenciaPago.QUINCENAL };
    const q1 = calcularLinea({ ...base, desde: '2026-08-01', hasta: '2026-08-15', empleado: emp });
    const q2 = calcularLinea({ ...base, desde: '2026-08-16', hasta: '2026-08-31', empleado: emp, brutoPrevioMes: q1.bruto, rentaPrevioMes: q1.renta });
    const mes = calcularLinea({ ...base, empleado: { ...emp, frecuenciaPago: FrecuenciaPago.MENSUAL } });
    expect(q1.renta + q2.renta).toBeCloseTo(mes.renta, 1);
  });

  it('deudas: se descuenta la cuota pero nunca más que el saldo', () => {
    const r = calcularLinea({ ...base, empleado: empleadoMensual, deudas: [{ id: 'd1', descripcion: 'Adelanto', cuota: 50000, saldo: 30000 }] });
    expect(r.deudasDescontadas).toBe(30000);
    expect(r.neto).toBe(535020 - 30000);
  });
});

describe('ausencias parciales (horas faltantes)', () => {
  const esperado = esperadoMinutos('2026-09-29', horario, p); // martes: 480
  const marcasTarde = ['10:00', '12:00', '13:00', '17:00']; // trabajó 6 h

  it('el sábado se espera solo hasta la salida de sábado', () => {
    expect(esperadoMinutos('2026-10-03', horario, p)).toBe(300);
  });

  it('llegar 2 horas tarde: faltan y se descuentan 120 min', () => {
    const r = clasificarDia(marcasTarde, 'ordinario', p, undefined, esperado);
    expect(r.minutosFaltantes).toBe(120);
    expect(r.minutosDescontar).toBe(120);
  });

  it('un atraso dentro de la tolerancia no se descuenta', () => {
    const r = clasificarDia(['08:08', '12:00', '13:00', '17:00'], 'ordinario', p, undefined, esperado);
    expect(r.minutosFaltantes).toBe(8);
    expect(r.minutosDescontar).toBe(0);
  });

  it('el administrador puede justificar las horas, o confirmarlas', () => {
    const just = aplicarResolucion(TipoResolucionDia.HORAS_JUSTIFICADAS, { marcas: marcasTarde }, '2026-09-29', 'ordinario', horario, p);
    expect(just.minutosFaltantes).toBe(120);
    expect(just.minutosDescontar).toBe(0);
    const injust = aplicarResolucion(TipoResolucionDia.HORAS_INJUSTIFICADAS, { marcas: marcasTarde }, '2026-09-29', 'ordinario', horario, p);
    expect(injust.minutosDescontar).toBe(120);
  });

  it('descontar horas baja el bruto: 2 h a ₡2.500/h = ₡5.000', () => {
    const dia = clasificarDia(marcasTarde, 'ordinario', p, undefined, esperado);
    const r = calcularLinea({
      empleado: { tipoSalario: TipoSalario.SEMANAL, montoSalario: 120000, frecuenciaPago: FrecuenciaPago.SEMANAL, tieneConyuge: false, cantidadHijos: 0 },
      dias: [{ fecha: '2026-09-29', tipoDia: 'ordinario', estado: dia.estado, descuenta: dia.descuenta, minutosNetos: dia.minutosNetos, minutosExtra: dia.minutosExtra, minutosEspeciales: 0, minutosDescontar: dia.minutosDescontar, feriadoPagoObligatorio: true }],
      desde: '2026-09-28', hasta: '2026-10-03', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
    });
    expect(r.horasAusentes).toBe(2);
    expect(r.descuentoHoras).toBe(5000);
    expect(r.bruto).toBe(115000);
  });
});

describe('jornada y almuerzo por empleado', () => {
  const dias6 = (h: number) => h; // legibilidad
  void dias6;

  it('almuerzo de 30 min en un día con solo entrada y salida (decidido a mano)', () => {
    const r = aplicarResolucion(TipoResolucionDia.ALMUERZO_MANUAL, { marcas: ['07:00', '16:30'], almuerzoMinutos: 30 }, '2026-10-06', 'ordinario', horario, p);
    expect(r.minutosAlmuerzo).toBe(30);
    expect(r.almuerzoEstimado).toBe(false);
    expect(r.minutosNetos).toBe(9 * 60); // 9,5 h − 30 min
    expect(r.minutosExtra).toBe(60);
  });

  it('el almuerzo manual no aplica si el día ya trae marcas de almuerzo', () => {
    expect(() =>
      aplicarResolucion(TipoResolucionDia.ALMUERZO_MANUAL, { marcas: ['07:00', '12:00', '13:00', '17:00'], almuerzoMinutos: 30 }, '2026-10-06', 'ordinario', horario, p),
    ).toThrow();
  });

  it('quien no marca almuerzo (anda en ruta): se descuenta el fijo, sin avisar de «estimado»', () => {
    const op = opcionesEmpleado({ almuerzoMarca: false, almuerzoMinutos: 60 }, p);
    const r = clasificarDia(['07:30', '17:30'], 'ordinario', p, undefined, 0, op);
    expect(r.minutosAlmuerzo).toBe(60);
    expect(r.almuerzoEstimado).toBe(false);
    // los que sí marcan, sí lo ven como estimado
    expect(clasificarDia(['07:30', '17:30'], 'ordinario', pLegado, undefined, 0, opcionesEmpleado({}, p)).almuerzoEstimado).toBe(true);
  });

  it('almuerzo de 0 min: no se descuenta nada', () => {
    const op = opcionesEmpleado({ almuerzoMarca: false, almuerzoMinutos: 0 }, p);
    expect(clasificarDia(['07:30', '17:30'], 'ordinario', p, undefined, 0, op).minutosNetos).toBe(600);
  });

  it('50 horas por semana: el día ordinario es de 8 h 20 min y lo demás es extra', () => {
    const op = opcionesEmpleado({ horasSemana: '50.00' }, p);
    expect(op.horasDiaMin).toBe(500);
    const r = clasificarDia(['07:00', '12:00', '13:00', '17:00'], 'ordinario', p, undefined, 0, op); // 9 h netas
    expect(r.minutosNetos).toBe(540);
    expect(r.minutosExtra).toBe(40);
  });

  it('56 horas por semana: valor por hora = salario semanal ÷ 56 y ausencia = 1/6 del salario', () => {
    const base = { tipoSalario: TipoSalario.SEMANAL, montoSalario: 112000, frecuenciaPago: FrecuenciaPago.SEMANAL, tieneConyuge: false, cantidadHijos: 0 };
    const dia = (fecha: string, descuenta: boolean) => ({
      fecha, tipoDia: 'ordinario' as const, estado: descuenta ? EstadoDia.AUSENCIA : EstadoDia.OK, descuenta,
      minutosNetos: 0, minutosExtra: 0, minutosEspeciales: 0, feriadoPagoObligatorio: true,
    });
    const r = calcularLinea({
      empleado: { ...base, horasSemana: 56 },
      dias: [dia('2026-10-06', true)],
      desde: '2026-10-05', hasta: '2026-10-10', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
    });
    expect(r.tarifaHora).toBe(2000);
    expect(r.diasAusenciaDescontados).toBe(1);
    expect(r.descuentoAusencias).toBeCloseTo(112000 / 6, 1);
    // sin override se usa el estándar de 48 h
    const r48 = calcularLinea({ empleado: { ...base, montoSalario: 96000 }, dias: [], desde: '2026-10-05', hasta: '2026-10-10', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [] });
    expect(r48.tarifaHora).toBe(2000);
  });
});

describe('puestos de confianza (sin jornada fija)', () => {
  const op = opcionesEmpleado({ esConfianza: true }, p);

  it('no hay horas extra ni horas faltantes, sin importar cuánto marque', () => {
    const largo = clasificarDia(['06:00', '19:00'], 'ordinario', p, undefined, 480, op);
    expect(largo.estado).toBe(EstadoDia.OK);
    expect(largo.minutosExtra).toBe(0);
    const corto = clasificarDia(['10:00', '12:00'], 'ordinario', p, undefined, 480, op);
    expect(corto.minutosFaltantes).toBe(0);
    expect(corto.minutosDescontar).toBe(0);
  });

  it('una marca suelta o marcas de más no piden decisión', () => {
    expect(clasificarDia(['08:00'], 'ordinario', p, undefined, 480, op).estado).toBe(EstadoDia.OK);
    expect(clasificarDia(['08:00', '12:00', '13:00'], 'ordinario', p, undefined, 480, op).estado).toBe(EstadoDia.OK);
    // un empleado normal con una sola marca sí queda por resolver
    expect(clasificarDia(['08:00'], 'ordinario', p, undefined, 480, opcionesEmpleado({}, p)).estado).toBe(EstadoDia.MARCA_FALTANTE);
  });

  it('un día sin marcas sigue siendo una ausencia que hay que decidir', () => {
    expect(clasificarDia([], 'ordinario', p, undefined, 480, op).estado).toBe(EstadoDia.AUSENCIA);
  });
});

describe('hora manual', () => {
  it('rechaza una salida anterior a la entrada (no la «ordena» sola)', () => {
    expect(() => aplicarResolucion(TipoResolucionDia.HORA_MANUAL, { entrada: '17:00', salida: '08:00' }, '2026-10-06', 'ordinario', horario, p)).toThrow('después de la entrada');
  });
});

describe('descanso semanal según el sector (comercio / industria)', () => {
  const base = { tipoSalario: TipoSalario.SEMANAL, montoSalario: 112000, frecuenciaPago: FrecuenciaPago.SEMANAL, tieneConyuge: false, cantidadHijos: 0 };
  const domingo = {
    fecha: '2026-10-11', tipoDia: 'domingo' as const, estado: EstadoDia.OK, descuenta: false,
    minutosNetos: 480, minutosExtra: 0, minutosEspeciales: 480, feriadoPagoObligatorio: true,
  };
  const calcular = (sector: 'industria' | 'comercio', monto = 112000, dias: Parameters<typeof calcularLinea>[0]['dias'] = [domingo]) =>
    calcularLinea({ empleado: { ...base, montoSalario: monto, sector }, dias, desde: '2026-10-05', hasta: '2026-10-11', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [] });

  it('comercio semanal: el descanso viene incluido, la hora vale semanal ÷ 56', () => {
    expect(calcular('comercio').tarifaHora).toBe(2000); // 112.000 ÷ 56
  });

  it('industria semanal: la hora vale semanal ÷ 48', () => {
    expect(calcular('industria', 96000).tarifaHora).toBe(2000);
  });

  it('trabajar el domingo: comercio suma solo el adicional (×1); industria paga el doble (×2)', () => {
    const comercio = calcular('comercio');
    const industria = calcular('industria', 112000);
    // 8 horas a ₡2.000 (comercio) = 16.000 adicional; industria: tarifa 112.000/48 = 2.333,33 × 8 × 2
    expect(comercio.montoEspeciales).toBeCloseTo(8 * 2000 * 1, 1);
    expect(industria.montoEspeciales).toBeCloseTo(8 * (112000 / 48) * 2, 1);
  });

  it('una ausencia descuenta un día: 1/7 del semanal en comercio, 1/6 en industria', () => {
    const ausencia = { fecha: '2026-10-06', tipoDia: 'ordinario' as const, estado: EstadoDia.AUSENCIA, descuenta: true, minutosNetos: 0, minutosExtra: 0, minutosEspeciales: 0, feriadoPagoObligatorio: true };
    expect(calcular('comercio', 112000, [ausencia]).descuentoAusencias).toBeCloseTo(112000 / 7, 1);
    expect(calcular('industria', 112000, [ausencia]).descuentoAusencias).toBeCloseTo(112000 / 6, 1);
  });
});

describe('horario por día de la semana', () => {
  const emp = { ...horario, horarioSemanal: HORARIO_BASE_POR_DEFECTO };
  // 2026-10-05 lunes · 06 martes · 10 sábado
  it('cada día tiene sus horas ordinarias: L y V 8 h, M a J 9 h, sábado 5 h (suman 48)', () => {
    expect(esperadoMinutos('2026-10-05', emp, p)).toBe(480);
    expect(esperadoMinutos('2026-10-06', emp, p)).toBe(540);
    expect(esperadoMinutos('2026-10-10', emp, p)).toBe(300);
    const semana = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].reduce((a, f) => a + esperadoMinutos(f, emp, p), 0);
    expect(semana).toBe(48 * 60);
  });

  it('el martes la hora extra empieza a las 9 h netas, no a las 8', () => {
    const op = opcionesEmpleado(emp, p, '2026-10-06');
    expect(op.horasDiaMin).toBe(540);
    const r = clasificarDia(['07:55', '18:25'], 'ordinario', p, undefined, esperadoMinutos('2026-10-06', emp, p), op); // 08:00 (tolerancia) a 18:25 − 60 almuerzo = 9 h 25
    expect(r.minutosNetos).toBe(565);
    expect(r.minutosExtra).toBe(25);
    // el lunes esas mismas 9 h 25 netas serían 85 minutos de extra
    const lunes = clasificarDia(['07:55', '18:25'], 'ordinario', p, undefined, 480, opcionesEmpleado(emp, p, '2026-10-05'));
    expect(lunes.minutosExtra).toBe(85);
  });

  it('salir a las 5 un martes es una falta de 1 hora respecto de su horario', () => {
    const op = opcionesEmpleado(emp, p, '2026-10-06');
    const r = clasificarDia(['08:00', '12:00', '13:00', '17:00'], 'ordinario', p, undefined, esperadoMinutos('2026-10-06', emp, p), op);
    expect(r.minutosFaltantes).toBe(60);
  });

  it('«pagar con el horario estándar» usa el horario de ese día', () => {
    const martes = aplicarResolucion(TipoResolucionDia.HORARIO_ESTANDAR, {}, '2026-10-06', 'ordinario', emp, p);
    expect(martes.marcas).toEqual(['08:00', '18:00']);
    expect(horarioDelDia(emp, '2026-10-10')).toEqual({ entrada: '08:00', salida: '13:00' });
  });

  it('un día sin horario (libre) no se espera nada', () => {
    const conLibre = { ...emp, horarioSemanal: { ...HORARIO_BASE_POR_DEFECTO, vie: null } };
    expect(esperadoMinutos('2026-10-09', conLibre, p)).toBe(0);
    expect(() => aplicarResolucion(TipoResolucionDia.HORARIO_ESTANDAR, {}, '2026-10-09', 'ordinario', conLibre, p)).toThrow('no tiene horario');
  });

  it('valida el horario: formato, salida después de la entrada y al menos un día', () => {
    expect(() => validarHorarioSemanal({ lun: { entrada: '8:00', salida: '17:00' } })).toThrow();
    expect(() => validarHorarioSemanal({ lun: { entrada: '17:00', salida: '08:00' } })).toThrow();
    expect(() => validarHorarioSemanal({ xyz: { entrada: '08:00', salida: '12:00' } })).toThrow();
    expect(() => validarHorarioSemanal({ lun: null })).toThrow();
    expect(validarHorarioSemanal({ lun: { entrada: '08:00', salida: '17:00' }, mar: null }).mar).toBeNull();
  });
});
