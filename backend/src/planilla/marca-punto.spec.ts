import { describe, expect, it } from 'vitest';
import { codigoQr, codigoQrValido, distanciaMetros, evaluarUbicacion, fechaHoraCostaRica, QR_SEGUNDOS, segundosRestantes, unirMarcas, ventanaDe } from './marca-punto.js';

const S = 'secreto-del-punto';
const P = 'punto-1';
const T0 = 1_800_000_010_000; // dentro de una ventana
const punto = { latitud: 9.9341, longitud: -84.0877, radioMetros: 100 };

describe('QR que cambia', () => {
  it('el código cambia con la ventana y depende del secreto y del punto', () => {
    const v = ventanaDe(T0);
    expect(codigoQr(S, P, v)).not.toBe(codigoQr(S, P, v + 1));
    expect(codigoQr(S, P, v)).not.toBe(codigoQr('otro', P, v));
    expect(codigoQr(S, P, v)).not.toBe(codigoQr(S, 'punto-2', v));
    expect(codigoQr(S, P, v)).toHaveLength(12);
  });
  it('vale el vigente y el anterior, no el de hace dos ventanas ni uno inventado', () => {
    const v = ventanaDe(T0);
    expect(codigoQrValido(S, P, codigoQr(S, P, v), T0)).toBe(true);
    expect(codigoQrValido(S, P, codigoQr(S, P, v - 1), T0)).toBe(true);
    expect(codigoQrValido(S, P, codigoQr(S, P, v - 2), T0)).toBe(false);
    expect(codigoQrValido(S, P, codigoQr(S, P, v + 1), T0)).toBe(false);
    expect(codigoQrValido(S, P, 'inventado', T0)).toBe(false);
    expect(codigoQrValido(S, 'punto-2', codigoQr(S, P, v), T0)).toBe(false);
  });
  it('una foto del QR deja de servir entre 30 y 60 s después', () => {
    const codigo = codigoQr(S, P, ventanaDe(T0));
    expect(codigoQrValido(S, P, codigo, T0 + (QR_SEGUNDOS * 2 + 1) * 1000)).toBe(false);
  });
  it('los segundos restantes bajan de 30 a 1', () => {
    const inicio = ventanaDe(T0) * QR_SEGUNDOS * 1000;
    expect(segundosRestantes(inicio)).toBe(30);
    expect(segundosRestantes(inicio + 29_500)).toBe(1);
  });
});

describe('ubicación', () => {
  it('distancia conocida: ~111 m por cada 0.001° de latitud', () => {
    expect(distanciaMetros(9.9341, -84.0877, 9.9351, -84.0877)).toBeGreaterThan(105);
    expect(distanciaMetros(9.9341, -84.0877, 9.9351, -84.0877)).toBeLessThan(117);
    expect(distanciaMetros(9.9341, -84.0877, 9.9341, -84.0877)).toBe(0);
  });
  it('dentro del radio y con buena precisión queda verificada', () => {
    const r = evaluarUbicacion(punto, { latitud: 9.9342, longitud: -84.0877, precision: 20 });
    expect(r).toMatchObject({ verificada: true, motivo: null });
  });
  it('fuera del radio, sin ubicación o muy imprecisa queda por revisar con el motivo', () => {
    expect(evaluarUbicacion(punto, { latitud: 9.95, longitud: -84.0877, precision: 20 })).toMatchObject({ verificada: false, motivo: expect.stringContaining('Fuera del punto') });
    expect(evaluarUbicacion(punto, {})).toMatchObject({ verificada: false, distanciaM: null, motivo: expect.stringContaining('Sin ubicación') });
    expect(evaluarUbicacion(punto, { latitud: 9.9341, longitud: -84.0877, precision: 900 })).toMatchObject({ verificada: false, motivo: expect.stringContaining('poco precisa') });
    expect(evaluarUbicacion({ ...punto, latitud: null }, { latitud: 9.9, longitud: -84 })).toMatchObject({ verificada: false });
  });
});

describe('hora de Costa Rica', () => {
  it('convierte de UTC a UTC−6 y cambia de día después de las 6 p. m.', () => {
    expect(fechaHoraCostaRica(new Date('2026-10-27T14:05:00Z'))).toEqual({ fecha: '2026-10-27', hora: '08:05' });
    expect(fechaHoraCostaRica(new Date('2026-10-28T00:30:00Z'))).toEqual({ fecha: '2026-10-27', hora: '18:30' });
    expect(fechaHoraCostaRica(new Date('2026-10-27T06:00:00Z'))).toEqual({ fecha: '2026-10-27', hora: '00:00' });
  });
});

describe('unir marcas del día', () => {
  it('ordena y no duplica el doble toque', () => {
    expect(unirMarcas(['08:00', '17:00'], ['12:00'])).toEqual(['08:00', '12:00', '17:00']);
    expect(unirMarcas(['08:00'], ['08:01'])).toEqual(['08:00']);
    expect(unirMarcas([], ['07:58'])).toEqual(['07:58']);
  });
  it('dos marcas a 2 minutos o más sí cuentan', () => {
    expect(unirMarcas(['12:00'], ['12:02'])).toEqual(['12:00', '12:02']);
  });
});
