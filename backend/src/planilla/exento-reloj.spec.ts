import { describe, expect, it } from 'vitest';
import { exentoDeReloj } from './exento-reloj.js';

describe('exentoDeReloj', () => {
  it('un empleado normal que marca el reloj está sujeto al control', () => {
    expect(exentoDeReloj({ marcaReloj: true, esConfianza: false })).toBe(false);
  });
  it('quien no usa el reloj queda exento', () => {
    expect(exentoDeReloj({ marcaReloj: false, esConfianza: false })).toBe(true);
  });
  it('un cargo de confianza queda exento aunque tenga el reloj activado', () => {
    expect(exentoDeReloj({ marcaReloj: true, esConfianza: true })).toBe(true);
  });
  it('sin datos se trata como empleado normal', () => {
    expect(exentoDeReloj({})).toBe(false);
  });
});
