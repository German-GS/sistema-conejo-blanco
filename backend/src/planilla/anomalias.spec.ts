import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { detectarAnomaliasAlmuerzo } from './anomalias.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));

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
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:11', '17:00'], p, 60)[0]).toMatchObject({ tipo: 'almuerzo_largo', minutos: 71 });
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '13:10', '17:00'], p, 60)).toEqual([]);
  });

  it('solo se mide con las 4 marcas; sin ellas no se sabe cuánto duró', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '17:00'], p, 60)).toEqual([]);
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '17:00'], p, 60)).toEqual([]);
  });

  it('quien tiene un almuerzo propio (30 min) se mide contra el suyo', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:41', '17:00'], p, 30)[0]?.tipo).toBe('almuerzo_largo');
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:40', '17:00'], p, 30)).toEqual([]);
  });

  it('sin almuerzo esperado (0) no hay nada que medir', () => {
    expect(detectarAnomaliasAlmuerzo(['08:00', '12:00', '12:05', '17:00'], p, 0)).toEqual([]);
  });
});
