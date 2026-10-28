import { describe, expect, it } from 'vitest';
import { codigoQr, codigoQrValido, fechaHoraCostaRica, QR_SEGUNDOS, resumenDeDia, segundosRestantes, unirMarcas, ventanaDe } from './marca-punto.js';

const S = 'secreto-del-punto';
const P = 'punto-1';
const T0 = 1_800_000_010_000; // dentro de una ventana

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

describe('historial del empleado (resumen de un día)', () => {
  const tramo = { entrada: '08:00', salida: '17:00' };
  const base = { tramo, tipoDia: 'ordinario', esHoy: false, toleranciaEntrada: 10, toleranciaSalida: 10, puntualidad: true };
  it('primera marca = entrada y última = salida; dentro de la tolerancia es a tiempo', () => {
    expect(resumenDeDia(['07:55', '12:00', '13:00', '17:05'], base)).toMatchObject({ entrada: '07:55', salida: '17:05', entradaEstado: 'a_tiempo', salidaEstado: 'a_tiempo', nota: null });
    expect(resumenDeDia(['08:10', '17:00'], base)).toMatchObject({ entradaEstado: 'a_tiempo', entradaMinutos: 10 });
  });
  it('fuera de la tolerancia dice cuántos minutos tarde llegó o antes salió', () => {
    expect(resumenDeDia(['08:25', '16:30'], base)).toMatchObject({ entradaEstado: 'tarde', entradaMinutos: 25, salidaEstado: 'antes', salidaMinutos: 30 });
  });
  it('con la tolerancia más amplia la misma marca ya es a tiempo (es configurable)', () => {
    expect(resumenDeDia(['08:25', '17:00'], { ...base, toleranciaEntrada: 30 })).toMatchObject({ entradaEstado: 'a_tiempo' });
  });
  it('sin puntualidad solo se muestran las horas', () => {
    expect(resumenDeDia(['08:25', '16:30'], { ...base, puntualidad: false })).toMatchObject({ entrada: '08:25', salida: '16:30', entradaEstado: null, salidaEstado: null });
  });
  it('una sola marca: de la mitad temprana es entrada, de la tarde es salida', () => {
    expect(resumenDeDia(['08:02'], { ...base, esHoy: true })).toMatchObject({ entrada: '08:02', salida: null, nota: 'En el trabajo' });
    expect(resumenDeDia(['08:02'], base)).toMatchObject({ nota: 'Falta la marca de salida' });
    expect(resumenDeDia(['17:01'], base)).toMatchObject({ entrada: null, salida: '17:01', nota: 'Falta la marca de entrada' });
  });
  it('hoy, dentro del horario, las marcas del medio no se toman como salida', () => {
    expect(resumenDeDia(['08:00', '12:00', '13:00'], { ...base, esHoy: true, ahora: '14:30' })).toMatchObject({ entrada: '08:00', salida: null, salidaEstado: null, nota: 'En el trabajo' });
    expect(resumenDeDia(['08:00', '12:00', '13:00', '17:02'], { ...base, esHoy: true, ahora: '17:30' })).toMatchObject({ salida: '17:02', salidaEstado: 'a_tiempo' });
  });
  it('días sin marcas', () => {
    expect(resumenDeDia([], base).nota).toBe('Sin marcas');
    expect(resumenDeDia([], { ...base, esHoy: true }).nota).toBe('Todavía sin marcas');
    expect(resumenDeDia([], { ...base, tipoDia: 'feriado' }).nota).toBe('Feriado');
    expect(resumenDeDia([], { ...base, tipoDia: 'domingo', tramo: null }).nota).toBe('Día libre');
  });
  it('en domingo o feriado trabajado no se juzga la puntualidad', () => {
    expect(resumenDeDia(['09:00', '12:00'], { ...base, tipoDia: 'feriado' })).toMatchObject({ entrada: '09:00', entradaEstado: null });
  });
});
