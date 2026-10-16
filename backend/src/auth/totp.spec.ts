import { describe, expect, it } from 'vitest';
import { cifrarSecreto, codigoTotp, descifrarSecreto, generarSecretoTotp, verificarTotp } from './totp.js';

describe('TOTP (RFC 6238)', () => {
  // Vectores de prueba del RFC 6238, secreto "12345678901234567890" en base32.
  const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('coincide con los vectores del RFC (6 dígitos = últimos 6 del código de 8)', () => {
    expect(codigoTotp(SECRETO_RFC, 59_000)).toBe('287082');
    expect(codigoTotp(SECRETO_RFC, 1_111_111_109_000)).toBe('081804');
    expect(codigoTotp(SECRETO_RFC, 1_234_567_890_000)).toBe('005924');
  });

  it('verifica el código actual y tolera un paso de desfase, pero no más', () => {
    const s = generarSecretoTotp();
    const t = 1_700_000_000_000;
    expect(verificarTotp(s, codigoTotp(s, t), t)).toBe(true);
    expect(verificarTotp(s, codigoTotp(s, t - 30_000), t)).toBe(true);
    expect(verificarTotp(s, codigoTotp(s, t - 90_000), t)).toBe(false);
    expect(verificarTotp(s, '000000', t) === (codigoTotp(s, t) === '000000' || codigoTotp(s, t - 30_000) === '000000' || codigoTotp(s, t + 30_000) === '000000')).toBe(true);
    expect(verificarTotp(s, 'abc123', t)).toBe(false);
  });

  it('cifra y descifra el secreto, y falla con otra llave', () => {
    const s = generarSecretoTotp();
    const guardado = cifrarSecreto(s, 'llave-1');
    expect(guardado).not.toContain(s);
    expect(descifrarSecreto(guardado, 'llave-1')).toBe(s);
    expect(() => descifrarSecreto(guardado, 'llave-2')).toThrow();
  });
});
