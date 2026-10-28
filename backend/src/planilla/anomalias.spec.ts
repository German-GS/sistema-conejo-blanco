import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { detectarAnomaliasAlmuerzo, detectarAnomaliasDeDia, type DiaParaAnomalias } from './anomalias.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));
// Sin hora fija de almuerzo (0) solo se mide cuánto duró; con ella (por defecto 12:00) se mide contra el reloj.
const sinHoraFija = { ...p, ALMUERZO_HORA_INICIO: 0 };

describe('detectarAnomaliasAlmuerzo', () => {
  it('un almuerzo normal (de 30 a 70 min) no es anomalía', () => {
    for (const regreso of ['12:30', '13:00', '13:10']) expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', regreso, '17:00'], p, 60)).toEqual([]);
  });

  it('menos de 30 minutos es almuerzo corto', () => {
    const [a] = detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:15', '17:00'], p, 60);
    expect(a).toMatchObject({ tipo: 'almuerzo_corto', minutos: 15 });
    expect(a.detalle).toContain('12:00 a 12:15');
  });

  it('más de la hora más la tolerancia (10 min) es almuerzo largo; justo en 70 no', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:11', '17:00'], sinHoraFija, 60)[0]).toMatchObject({ tipo: 'almuerzo_largo', minutos: 71 });
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:10', '17:00'], sinHoraFija, 60)).toEqual([]);
  });

  it('solo se mide con las 4 marcas; sin ellas no se sabe cuánto duró', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '17:00'], p, 60)).toEqual([]);
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '17:00'], p, 60)).toEqual([]);
  });

  it('quien tiene un almuerzo propio (30 min) se mide contra el suyo', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:41', '17:00'], sinHoraFija, 30)[0]?.tipo).toBe('almuerzo_largo');
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:40', '17:00'], sinHoraFija, 30)).toEqual([]);
  });

  it('con hora fija (12:00) sale a almorzar antes de la hora: incidencia solo pasada la tolerancia', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '11:50', '12:50', '17:00'], p, 60)).toEqual([]);
    const [a] = detectarAnomaliasAlmuerzo(['08:00', '11:30', '12:30', '17:00'], p, 60);
    expect(a).toMatchObject({ tipo: 'almuerzo_salida_temprana', minutos: 30 });
    expect(a.detalle).toContain('11:30');
  });

  it('con hora fija regresar después de las 13:00 más la tolerancia es regreso tarde, con los minutos y la duración', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:10', '17:00'], p, 60)).toEqual([]);
    const [a] = detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:25', '17:00'], p, 60);
    expect(a).toMatchObject({ tipo: 'almuerzo_regreso_tarde', minutos: 25 });
    expect(a.detalle).toContain('13:25');
    expect(a.detalle).toContain('85 min');
  });

  it('las tolerancias del almuerzo son configurables', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:25', '17:00'], { ...p, TOLERANCIA_ALMUERZO_REGRESO_MINUTOS: 30 }, 60)).toEqual([]);
    expect(detectarAnomaliasAlmuerzo(['08:00', '11:30', '12:30', '17:00'], { ...p, TOLERANCIA_ALMUERZO_SALIDA_MINUTOS: 45 }, 60)).toEqual([]);
  });

  it('sin almuerzo esperado (0) no hay nada que medir', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:05', '17:00'], p, 0)).toEqual([]);
  });
});

describe('anomalías de un día frente al horario', () => {
  const tramo = { entrada: '08:00', salida: '17:00' };
  const dia = (marcas: string[], extra: Partial<DiaParaAnomalias> = {}): DiaParaAnomalias => ({ tipoDia: 'ordinario', estado: 'ok', descuenta: false, marcas, resolucionTipo: null, minutosDescontar: 0, ...extra });
  const detectar = (d: DiaParaAnomalias) => detectarAnomaliasDeDia(d, tramo, 480, p);

  it('llegada tarde: pasada la tolerancia de 10 minutos', () => {
    expect(detectar(dia(['08:10', '12:00', '13:00', '17:00']))).toEqual([]);
    const r = detectar(dia(['08:25', '12:00', '13:00', '17:00'], { minutosDescontar: 25 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'tardanza', minutos: 25 });
    expect(r[0].detalle).toContain('08:25');
  });

  it('salida antes de la hora (se fue a mediodía)', () => {
    const r = detectar(dia(['08:00', '12:00'], { minutosDescontar: 240 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'salida_temprana', minutos: 300 });
  });

  it('llegó tarde y se fue antes: dos anomalías', () => {
    expect(detectar(dia(['09:00', '16:00'], { minutosDescontar: 120 })).map((x) => x.tipo)).toEqual(['tardanza', 'salida_temprana']);
  });

  it('ausencia injustificada (sin marcas y sin decisión, o decidida como injustificada)', () => {
    expect(detectar(dia([], { estado: 'ausencia', descuenta: true }))[0]).toMatchObject({ tipo: 'ausencia', minutos: 480 });
    expect(detectar(dia([], { estado: 'ausencia', descuenta: true, resolucionTipo: 'ausencia_injustificada' }))).toHaveLength(1);
  });

  it('entrar y salir más temprano cumpliendo todas las horas no es salir antes de la hora', () => {
    expect(detectar(dia(['07:00', '12:00', '13:00', '16:00']))).toEqual([]); // 9 h de 8 a 17: horario corrido una hora
    expect(detectar(dia(['07:00', '12:00', '13:00', '15:30'], { minutosDescontar: 30 })).map((x) => x.tipo)).toEqual(['salida_temprana']); // faltó tiempo de verdad
  });

  it('lo justificado no se amonesta: ausencia justificada, incapacidad, día libre', () => {
    expect(detectar(dia([], { estado: 'ausencia', descuenta: false, resolucionTipo: 'ausencia_justificada' }))).toEqual([]);
    expect(detectar(dia([], { estado: 'ausencia', descuenta: false, resolucionTipo: 'incapacidad' }))).toEqual([]);
    expect(detectar(dia(['08:00', '12:00'], { resolucionTipo: 'horas_justificadas' }))).toEqual([]);
  });

  it('no cuenta: marcas por confirmar, feriados, domingos y días sin horario', () => {
    expect(detectar(dia(['08:00', '12:00'], { estado: 'marca_faltante' }))).toEqual([]);
    expect(detectar(dia(['10:00', '12:00'], { tipoDia: 'feriado' }))).toEqual([]);
    expect(detectar(dia([], { estado: 'ausencia', descuenta: true, tipoDia: 'domingo' }))).toEqual([]);
    expect(detectarAnomaliasDeDia(dia(['10:00', '12:00']), null, 0, p)).toEqual([]);
  });
});

describe('solo se anota lo que tuvo consecuencia (rebajo o ausencia injustificada)', () => {
  const tramo = { entrada: '08:00', salida: '17:00' };
  const dia = (marcas: string[], extra: Partial<DiaParaAnomalias> = {}): DiaParaAnomalias => ({ tipoDia: 'ordinario', estado: 'ok', descuenta: false, marcas, resolucionTipo: null, minutosDescontar: 0, ...extra });

  it('una llegada tarde sin rebajo (compensada, justificada o dentro de lo permitido) no se anota', () => {
    expect(detectarAnomaliasDeDia(dia(['08:25', '12:00', '13:00', '17:00']), tramo, 480, p)).toEqual([]);
  });
  it('la misma llegada tarde con rebajo sí se anota', () => {
    expect(detectarAnomaliasDeDia(dia(['08:25', '12:00', '13:00', '17:00'], { minutosDescontar: 25 }), tramo, 480, p).map((x) => x.tipo)).toEqual(['tardanza']);
  });
  it('una salida antes de la hora sin rebajo no se anota', () => {
    expect(detectarAnomaliasDeDia(dia(['08:00', '12:00']), tramo, 480, p)).toEqual([]);
  });
  it('la ausencia injustificada se anota aunque no tenga minutos de rebajo (se descuenta el día)', () => {
    expect(detectarAnomaliasDeDia(dia([], { estado: 'ausencia', descuenta: true }), tramo, 480, p)).toHaveLength(1);
  });
});
