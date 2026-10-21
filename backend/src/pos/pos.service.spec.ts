import { describe, expect, it } from 'vitest';
import { numeroTexto } from './pos.service.js';

describe('numeroTexto', () => {
  it('arma el número del tiquete con el código de la tienda y 6 dígitos', () => {
    expect(numeroTexto('T01', 1)).toBe('T01-000001');
    expect(numeroTexto('T02', 123456)).toBe('T02-123456');
  });
});
