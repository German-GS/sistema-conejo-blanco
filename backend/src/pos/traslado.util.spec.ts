import { describe, expect, it } from 'vitest';
import { asientoTraslado } from './traslado.util.js';

const cuentas = { tiendas: '1305', bodega: '1300', merma: '5440', diferencia: '5460' };
const suma = (a: Array<{ debe?: number; haber?: number }>, lado: 'debe' | 'haber') => Math.round(a.reduce((s, l) => s + (l[lado] ?? 0), 0) * 100) / 100;

describe('asientoTraslado', () => {
  it('costo especial menor: la diferencia va al debe y el asiento cuadra', () => {
    const r = asientoTraslado([{ enviada: 12, recibida: 12, especial: 700, normal: 1000 }], cuentas);
    expect(r.asiento).toEqual([
      { codigoCuenta: '1305', debe: 8400 },
      { codigoCuenta: '5460', debe: 3600 },
      { codigoCuenta: '1300', haber: 12000 },
    ]);
    expect(suma(r.asiento, 'debe')).toBe(suma(r.asiento, 'haber'));
  });

  it('con faltantes: lo que no llegó es merma a costo normal', () => {
    const r = asientoTraslado([{ enviada: 12, recibida: 10, especial: 700, normal: 1000 }], cuentas);
    expect(r.asiento).toEqual([
      { codigoCuenta: '1305', debe: 7000 },
      { codigoCuenta: '5440', debe: 2000 },
      { codigoCuenta: '5460', debe: 3000 },
      { codigoCuenta: '1300', haber: 12000 },
    ]);
    expect(suma(r.asiento, 'debe')).toBe(suma(r.asiento, 'haber'));
  });

  it('costo especial mayor: la diferencia queda a favor (haber) y cuadra', () => {
    const r = asientoTraslado([{ enviada: 10, recibida: 10, especial: 1100, normal: 1000 }], cuentas);
    expect(r.asiento).toEqual([
      { codigoCuenta: '1305', debe: 11000 },
      { codigoCuenta: '5460', haber: 1000 },
      { codigoCuenta: '1300', haber: 10000 },
    ]);
    expect(suma(r.asiento, 'debe')).toBe(suma(r.asiento, 'haber'));
  });

  it('costos iguales: sin cuenta de diferencia', () => {
    const r = asientoTraslado([{ enviada: 5, recibida: 5, especial: 800, normal: 800 }], cuentas);
    expect(r.asiento.map((l) => l.codigoCuenta)).toEqual(['1305', '1300']);
  });

  it('nada enviado: vacío', () => {
    expect(asientoTraslado([{ enviada: 0, recibida: 0, especial: 0, normal: 0 }], cuentas).vacio).toBe(true);
  });
});
