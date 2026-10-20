import { describe, expect, it } from 'vitest';
import { describirDispositivo } from './conexiones.service.js';

describe('describirDispositivo', () => {
  it('resume el navegador y el sistema operativo', () => {
    expect(describirDispositivo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('Chrome en Mac');
    expect(describirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari en iPhone');
    expect(describirDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0')).toBe('Edge en Windows');
  });
  it('devuelve vacío si no hay dato', () => {
    expect(describirDispositivo(null)).toBe('');
  });
});
