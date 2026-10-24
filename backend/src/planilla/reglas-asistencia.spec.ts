import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { aplicarResolucion, calcularLinea, clasificarDia, esperadoMinutos, opcionesEmpleado } from './calculo.js';
import { HORARIO_BASE_POR_DEFECTO } from './horario.js';
import { EstadoDia, FrecuenciaPago, TipoResolucionDia, TipoSalario } from './planilla.enums.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));
const emp = { horarioEntrada: '08:00', horarioSalida: '17:00', horarioSalidaSabado: '13:00', horarioSemanal: HORARIO_BASE_POR_DEFECTO };
// 2026-10-05 lunes (08:00–17:00, 480 min netos) · 2026-10-10 sábado (08:00–13:00)
const LUNES = '2026-10-05';
const dia = (marcas: string[], fecha = LUNES, pp = p) =>
  clasificarDia(marcas, 'ordinario', pp, undefined, esperadoMinutos(fecha, emp, pp), opcionesEmpleado(emp, pp, fecha));

describe('parámetros por defecto', () => {
  it('cada descripción cabe en la columna (200) y no hay nombres repetidos', () => {
    for (const x of PARAMETROS_POR_DEFECTO) expect(x.descripcion.length, x.nombre).toBeLessThanOrEqual(200);
    expect(new Set(PARAMETROS_POR_DEFECTO.map((x) => x.nombre)).size).toBe(PARAMETROS_POR_DEFECTO.length);
  });
});

describe('1. tolerancia neutral ±10 min en entrada y salida', () => {
  it('llegar 7 min tarde y salir 7 min antes: ni se rebaja ni se paga distinto', () => {
    const r = dia(['08:07', '16:53']);
    expect(r.minutosNetos).toBe(480);
    expect(r.minutosFaltantes).toBe(0);
    expect(r.minutosDescontar).toBe(0);
  });

  it('llegar 8 min antes y salir 9 min después: no genera extra', () => {
    const r = dia(['07:52', '17:09']);
    expect(r.minutosNetos).toBe(480);
    expect(r.minutosExtra).toBe(0);
  });

  it('el borde de 10 min está dentro; 11 min cuenta real', () => {
    expect(dia(['08:10', '17:00']).minutosFaltantes).toBe(0);
    const tarde = dia(['08:11', '17:00']);
    expect(tarde.minutosFaltantes).toBe(11);
    expect(tarde.minutosDescontar).toBe(11);
    expect(dia(['08:00', '17:11']).minutosExtra).toBe(11);
  });

  it('la tolerancia es configurable', () => {
    const r = dia(['08:15', '17:00'], LUNES, { ...p, TOLERANCIA_MARCA_MINUTOS: 15 });
    expect(r.minutosFaltantes).toBe(0);
  });
});

describe('2. almuerzo como bloque fijo', () => {
  it('con o sin marcas de almuerzo, siempre se descuentan 60 min', () => {
    for (const marcas of [['08:00', '17:00'], ['08:00', '12:30', '13:00', '17:00'], ['08:00', '12:00', '17:00']]) {
      const r = dia(marcas);
      expect(r.estado).toBe(EstadoDia.OK);
      expect(r.minutosAlmuerzo).toBe(60);
      expect(r.minutosNetos).toBe(480);
      expect(r.almuerzoEstimado).toBe(false);
    }
  });

  it('el bloque sale del empleado (30 min) y el sábado no lleva', () => {
    const e30 = { ...emp, almuerzoMinutos: 30 };
    const r = clasificarDia(['08:00', '17:00'], 'ordinario', p, undefined, 0, opcionesEmpleado(e30, p, LUNES));
    expect(r.minutosAlmuerzo).toBe(30);
    expect(dia(['08:00', '13:00'], '2026-10-10').minutosAlmuerzo).toBe(0);
  });
});

describe('3. marcas faltantes: estimado + «Resolver», sin rebajo automático', () => {
  it('caso real: entrada 08:57 (tardía) es una marca real y se rebaja lo tardado', () => {
    const r = dia(['08:57', '17:00']);
    expect(r.estado).toBe(EstadoDia.OK);
    expect(r.verificado).toBe(true);
    expect(r.minutosFaltantes).toBe(57);
    expect(r.minutosDescontar).toBe(57);
  });

  it('caso real: 11:12 y 17:00 → falta la entrada; se estima 08:00 y queda para resolver', () => {
    const r = dia(['11:12', '17:00']);
    expect(r.estado).toBe(EstadoDia.MARCA_FALTANTE);
    expect(r.estimacion).toEqual({ faltante: 'entrada', hora: '08:00', causa: 'marca_tardia' });
    expect(r.minutosNetos).toBe(480); // cifra estimada 08:00–17:00 menos almuerzo
    expect(r.minutosDescontar).toBe(0);
    expect(r.minutosExtra).toBe(0);
    expect(r.verificado).toBe(false);
  });

  it('caso real: marca única 06:4x → es la entrada; se estima la salida', () => {
    const r = dia(['06:43']);
    expect(r.estado).toBe(EstadoDia.MARCA_FALTANTE);
    expect(r.estimacion).toMatchObject({ faltante: 'salida', hora: '17:00', causa: 'marca_unica' });
    expect(r.minutosDescontar).toBe(0);
    expect(r.minutosExtra).toBe(0);
  });

  it('una marca única por la tarde es la salida: se estima la entrada', () => {
    const r = dia(['17:02']);
    expect(r.estimacion).toMatchObject({ faltante: 'entrada', hora: '08:00' });
  });

  it('salida muy temprana → falta la salida', () => {
    const r = dia(['08:00', '12:05']);
    expect(r.estado).toBe(EstadoDia.MARCA_FALTANTE);
    expect(r.estimacion).toMatchObject({ faltante: 'salida', hora: '17:00', causa: 'salida_temprana' });
  });

  it('el umbral es configurable (0 = apagado)', () => {
    const r = dia(['11:12', '17:00'], LUNES, { ...p, MARCA_SOSPECHOSA_MINUTOS: 0 });
    expect(r.estado).toBe(EstadoDia.OK);
    expect(r.minutosFaltantes).toBe(132); // 5 h 48 brutas: bajo el umbral, sin almuerzo
  });
});

describe('4 y 7. supervisor confirma; solo se rebaja tiempo verificado', () => {
  const resolver = (supervisor?: string) =>
    aplicarResolucion(TipoResolucionDia.HORA_MANUAL, { entrada: '10:00', salida: '17:00', supervisor }, LUNES, 'ordinario', emp, p);

  it('hora manual sin supervisor: se paga lo digitado pero NO se rebajan las horas faltantes', () => {
    const r = resolver();
    expect(r.estado).toBe(EstadoDia.OK);
    expect(r.verificado).toBe(false);
    expect(r.minutosFaltantes).toBe(120);
    expect(r.minutosDescontar).toBe(0);
  });

  it('hora manual confirmada por el supervisor: sí se rebaja', () => {
    const r = resolver('Jefe de planta');
    expect(r.verificado).toBe(true);
    expect(r.minutosDescontar).toBe(120);
  });

  it('una hora manual 11:12–17:00 no vuelve a caer en «marca faltante»', () => {
    const r = aplicarResolucion(TipoResolucionDia.HORA_MANUAL, { entrada: '11:12', salida: '17:00', supervisor: 'Jefe' }, LUNES, 'ordinario', emp, p);
    expect(r.estado).toBe(EstadoDia.OK);
  });

  it('la regla se puede apagar: sin verificación igual se rebaja', () => {
    const r = aplicarResolucion(TipoResolucionDia.HORA_MANUAL, { entrada: '10:00', salida: '17:00' }, LUNES, 'ordinario', emp, { ...p, REBAJO_SOLO_VERIFICADO: 0 });
    expect(r.minutosDescontar).toBe(120);
  });

  it('marcas reales siempre son verificadas', () => {
    expect(dia(['09:30', '17:00']).verificado).toBe(true);
  });
});

describe('5. marca faltante (técnico) ≠ horas no trabajadas (real)', () => {
  it('el rebajo en planilla solo sale de horas no trabajadas verificadas, no de marcas faltantes', () => {
    const faltante = dia(['11:12', '17:00']);
    const real = dia(['09:00', '17:00']);
    const linea = (d: ReturnType<typeof dia>) =>
      calcularLinea({
        empleado: { tipoSalario: TipoSalario.SEMANAL, montoSalario: 120000, frecuenciaPago: FrecuenciaPago.SEMANAL, tieneConyuge: false, cantidadHijos: 0 },
        dias: [{ fecha: LUNES, tipoDia: 'ordinario', estado: d.estado, descuenta: d.descuenta, minutosNetos: d.minutosNetos, minutosExtra: d.minutosExtra, minutosEspeciales: 0, minutosDescontar: d.minutosDescontar, feriadoPagoObligatorio: true }],
        desde: '2026-10-05', hasta: '2026-10-10', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
      });
    expect(linea(faltante).horasAusentes).toBe(0);
    expect(linea(real).horasAusentes).toBe(1); // 09:00 vs 08:00
  });
});
