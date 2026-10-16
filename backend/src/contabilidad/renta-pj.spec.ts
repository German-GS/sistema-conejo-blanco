import { describe, expect, it } from 'vitest';
import { calcularRentaPJ, type ParametrosRentaPJ } from './renta-pj.js';

// Valores del período fiscal 2026 (Decreto 45333-H).
const P: ParametrosRentaPJ = {
  topeIngresos: 119_174_000,
  limite1: 5_621_000,
  limite2: 8_433_000,
  limite3: 11_243_000,
  tarifa1: 5,
  tarifa2: 10,
  tarifa3: 15,
  tarifa4: 20,
  tarifaGeneral: 30,
};

describe('calcularRentaPJ', () => {
  it('sin utilidad o con pérdida no hay impuesto', () => {
    expect(calcularRentaPJ(0, 1_000_000, P).impuesto).toBe(0);
    expect(calcularRentaPJ(-500_000, 1_000_000, P).impuesto).toBe(0);
  });

  it('primer tramo: 5 % hasta ₡5 621 000', () => {
    expect(calcularRentaPJ(2_000_000, 50_000_000, P).impuesto).toBe(100_000);
    expect(calcularRentaPJ(5_621_000, 50_000_000, P).impuesto).toBe(281_050);
  });

  it('suma los tramos: ₡12 000 000 de renta neta', () => {
    // 5 621 000×5 % + 2 812 000×10 % + 2 810 000×15 % + 757 000×20 %
    const esperado = 281_050 + 281_200 + 421_500 + 151_400;
    const r = calcularRentaPJ(12_000_000, 80_000_000, P);
    expect(r.regimen).toBe('escala');
    expect(r.impuesto).toBe(esperado);
    expect(r.tramos.reduce((a, t) => a + t.base, 0)).toBe(12_000_000);
  });

  it('sobre el tope de ingresos brutos se aplica la tarifa general del 30 % a todo', () => {
    const r = calcularRentaPJ(12_000_000, 119_174_001, P);
    expect(r.regimen).toBe('general');
    expect(r.impuesto).toBe(3_600_000);
  });

  it('justo en el tope todavía es escala', () => {
    expect(calcularRentaPJ(1_000_000, 119_174_000, P).regimen).toBe('escala');
  });

  it('el impuesto crece de forma continua con la renta neta', () => {
    let previo = 0;
    for (let r = 0; r <= 20_000_000; r += 100_000) {
      const i = calcularRentaPJ(r, 50_000_000, P).impuesto;
      expect(i).toBeGreaterThanOrEqual(previo);
      expect(i - previo).toBeLessThanOrEqual(100_000 * 0.2 + 0.01);
      previo = i;
    }
  });
});
