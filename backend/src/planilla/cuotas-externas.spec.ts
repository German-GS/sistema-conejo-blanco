import { describe, expect, it } from 'vitest';
import { cuotaExternaDelPeriodo, cuotaSemanalPorSabados, sabadoDelPeriodo, sabadosDelMes } from './cuotas-externas.js';
import { FrecuenciaPago } from './planilla.enums.js';

describe('sábados del mes', () => {
  it('octubre de 2026 tiene 4 sábados y noviembre de 2026 también; agosto de 2026 tiene 5', () => {
    expect(sabadosDelMes(2026, 10)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
    expect(sabadosDelMes(2026, 11)).toHaveLength(4);
    expect(sabadosDelMes(2026, 8)).toHaveLength(5);
  });
  it('el sábado de una semana de lunes a domingo', () => {
    expect(sabadoDelPeriodo('2026-10-19', '2026-10-25')).toBe('2026-10-24');
    expect(sabadoDelPeriodo('2026-10-26', '2026-11-01')).toBe('2026-10-31'); // la semana que cruza de mes cuenta para octubre
  });
});

describe('cuota semanal = cuota mensual ÷ sábados del mes', () => {
  it('mes de 4 sábados: ₡100 000 → 4 de ₡25 000', () => {
    const cuotas = sabadosDelMes(2026, 11).map((s) => cuotaSemanalPorSabados(100000, s));
    expect(cuotas).toEqual([25000, 25000, 25000, 25000]);
  });
  it('mes de 5 sábados: ₡100 000 → 5 de ₡20 000', () => {
    expect(sabadosDelMes(2026, 10).map((s) => cuotaSemanalPorSabados(100000, s))).toEqual([20000, 20000, 20000, 20000, 20000]);
  });
  it('lo que no divide exacto se ajusta en el último sábado y el mes suma exactamente la cuota', () => {
    for (const [anio, mes] of [[2026, 10], [2026, 11], [2026, 8]]) {
      const total = sabadosDelMes(anio, mes).map((s) => cuotaSemanalPorSabados(100001, s)).reduce((a, b) => Math.round((a + b) * 100) / 100, 0);
      expect(total).toBe(100001);
    }
    expect(sabadosDelMes(2026, 11).map((s) => cuotaSemanalPorSabados(100001, s))).toEqual([25000.25, 25000.25, 25000.25, 25000.25]);
    expect(sabadosDelMes(2026, 10).map((s) => cuotaSemanalPorSabados(100000.5, s)).at(-1)).toBe(20000.1);
  });
});

describe('según cada cuánto se paga', () => {
  it('semanal usa el sábado de la semana', () => {
    expect(cuotaExternaDelPeriodo(100000, FrecuenciaPago.SEMANAL, '2026-10-19', '2026-10-25')).toBe(20000);
    expect(cuotaExternaDelPeriodo(100000, FrecuenciaPago.SEMANAL, '2026-11-09', '2026-11-15')).toBe(25000);
  });
  it('quincenal en dos mitades y mensual completa', () => {
    expect(cuotaExternaDelPeriodo(100001, FrecuenciaPago.QUINCENAL, '2026-11-01', '2026-11-15')).toBe(50000.5);
    expect(cuotaExternaDelPeriodo(100001, FrecuenciaPago.QUINCENAL, '2026-11-16', '2026-11-30')).toBe(50000.5);
    expect(cuotaExternaDelPeriodo(100000, FrecuenciaPago.MENSUAL, '2026-11-01', '2026-11-30')).toBe(100000);
  });
});
