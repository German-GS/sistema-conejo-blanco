import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { impuestoRenta } from './calculo.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor])) as never;
const valor = (n: string) => PARAMETROS_POR_DEFECTO.find((x) => x.nombre === n)!.valor;

describe('porcentajes de cargas sociales 2026', () => {
  it('trabajador: SEM 5,50 + IVM 4,33 + Banco Popular 1,00 = 10,83 %', () => {
    const total = valor('DEDUCCION_OBRERO_SEM') + valor('DEDUCCION_OBRERO_IVM') + valor('DEDUCCION_BANCO_POPULAR');
    expect(Math.round(total * 100) / 100).toBe(10.83);
  });

  it('patrono: suma de cargas patronales = 26,83 %', () => {
    const total = PARAMETROS_POR_DEFECTO.filter((x) => x.nombre.startsWith('APORTE_PATRONAL_')).reduce((a, x) => a + x.valor, 0);
    expect(Math.round(total * 100) / 100).toBe(26.83);
  });
});

describe('impuestoRenta (tramos 2026)', () => {
  it('no cobra nada hasta el tramo exento', () => {
    expect(impuestoRenta(0, p)).toBe(0);
    expect(impuestoRenta(918_000, p)).toBe(0);
  });

  it('calcula por tramos: ₡2 000 000 = 10 % del tramo 2 + 15 % del excedente', () => {
    // (1 347 000 − 918 000) × 10 % + (2 000 000 − 1 347 000) × 15 %
    expect(impuestoRenta(2_000_000, p)).toBeCloseTo(42_900 + 97_950, 6);
  });

  it('pasa por los 5 tramos hasta el 25 %', () => {
    const esperado = 42_900 + (2_364_000 - 1_347_000) * 0.15 + (4_727_000 - 2_364_000) * 0.2 + (6_000_000 - 4_727_000) * 0.25;
    expect(impuestoRenta(6_000_000, p)).toBeCloseTo(esperado, 6);
  });

  it('es continuo y nunca decrece al subir el salario', () => {
    let previo = 0;
    for (let base = 0; base <= 8_000_000; base += 1_000) {
      const r = impuestoRenta(base, p);
      expect(r).toBeGreaterThanOrEqual(previo);
      expect(r - previo).toBeLessThanOrEqual(1_000 * 0.25 + 1e-6); // sin saltos mayores a la tasa máxima
      previo = r;
    }
  });
});
