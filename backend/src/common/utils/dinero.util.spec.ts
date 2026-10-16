import { describe, expect, it } from 'vitest';
import { redondear } from './dinero.util.js';

describe('redondear', () => {
  it('redondea medios centavos hacia arriba aunque el binario los deje por debajo', () => {
    expect(redondear(2.135)).toBe(2.14);
    expect(redondear(1.005)).toBe(1.01);
    expect(redondear(4.015)).toBe(4.02);
    expect(redondear(130.065)).toBe(130.07);
  });

  it('para todo medio centavo exacto (0.005 … 20 000.005) da el centavo de arriba', () => {
    let fallos = 0;
    for (let c = 0; c < 2_000_000; c++) {
      const milesimas = c * 10 + 5;
      const esperado = (Math.floor(milesimas / 10) + 1) / 100;
      if (redondear(milesimas / 1000) !== esperado) fallos++;
    }
    expect(fallos).toBe(0);
  });

  it('deja intactos los montos que ya tienen 2 decimales', () => {
    let fallos = 0;
    for (let c = 0; c < 200_000; c++) {
      if (redondear(c / 100) !== c / 100) fallos++;
    }
    expect(fallos).toBe(0);
  });

  it('es simétrico con negativos y no devuelve -0', () => {
    expect(redondear(-2.135)).toBe(-2.14);
    expect(redondear(-0.001)).toBe(0);
    expect(Object.is(redondear(-0.001), -0)).toBe(false);
  });

  it('IVA del 13%: subtotal × 13 / 100 nunca queda un centavo corto', () => {
    let fallos = 0;
    for (let c = 1; c <= 200_000; c++) {
      const subtotal = c / 100;
      const exactoEnCentavosX100 = c * 13; // IVA en unidades de 0.0001
      const esperado = Math.floor((exactoEnCentavosX100 + 50) / 100) / 100;
      if (redondear(subtotal * 0.13) !== esperado) fallos++;
    }
    expect(fallos).toBe(0);
  });
});
