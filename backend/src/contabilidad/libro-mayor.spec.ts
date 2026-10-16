import { describe, expect, it } from 'vitest';
import { construirCuentaMayor } from './libro-mayor.js';

const mov = (fecha: string, debe: number, haber: number, numero = 1) => ({
  fecha,
  numero,
  asientoId: `a${numero}`,
  descripcion: 'x',
  origenTipo: null,
  debe,
  haber,
});

describe('construirCuentaMayor', () => {
  it('cuenta deudora: el saldo sube con débitos y baja con créditos', () => {
    const c = construirCuentaMayor({ codigo: '1100', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora' }, { debe: 1000, haber: 400 }, [
      mov('2026-10-01', 500, 0, 1),
      mov('2026-10-02', 0, 200, 2),
    ]);
    expect(c.saldoInicial).toBe(600);
    expect(c.movimientos.map((m) => m.saldo)).toEqual([1100, 900]);
    expect(c.saldoFinal).toBe(900);
    expect(c.totalDebe).toBe(500);
    expect(c.totalHaber).toBe(200);
  });

  it('cuenta acreedora: el saldo sube con créditos (un pasivo normal sale positivo)', () => {
    const c = construirCuentaMayor({ codigo: '2100', nombre: 'Salarios', tipo: 'pasivo', naturaleza: 'acreedora' }, { debe: 0, haber: 0 }, [
      mov('2026-10-11', 0, 1497708.69, 1),
      mov('2026-10-15', 497708.69, 0, 2),
    ]);
    expect(c.movimientos.map((m) => m.saldo)).toEqual([1497708.69, 1000000]);
    expect(c.saldoFinal).toBe(1000000);
  });

  it('no arrastra error de punto flotante en saldos corridos de muchos movimientos', () => {
    const lineas = Array.from({ length: 5000 }, (_, i) => mov('2026-10-01', 0.1, 0, i + 1));
    const c = construirCuentaMayor({ codigo: '1100', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora' }, { debe: 0, haber: 0 }, lineas);
    expect(c.saldoFinal).toBe(500);
    expect(c.totalDebe).toBe(500);
  });

  it('saldo inicial + débitos − créditos = saldo final', () => {
    const c = construirCuentaMayor({ codigo: '1200', nombre: 'CxC', tipo: 'activo', naturaleza: 'deudora' }, { debe: 12345.67, haber: 345.01 }, [
      mov('2026-10-03', 1000.33, 0, 1),
      mov('2026-10-04', 0, 2000.5, 2),
      mov('2026-10-05', 0.05, 0, 3),
    ]);
    expect(c.saldoFinal).toBe(Math.round((c.saldoInicial + c.totalDebe - c.totalHaber) * 100) / 100);
  });
});
