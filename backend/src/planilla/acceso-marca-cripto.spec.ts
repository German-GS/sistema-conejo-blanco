import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { crearReto, firmaValida, generarCodigoEnrolamiento, huellaCodigo, LARGO_CODIGO, normalizarCodigo, pinDebil, validarLlavePublica, validarReto } from './acceso-marca-cripto.js';

const SECRETO = 'secreto-de-prueba';

describe('código de enrolamiento', () => {
  it('tiene el largo esperado, sin caracteres confusos, y su huella no revela el código', () => {
    const c = generarCodigoEnrolamiento();
    expect(c).toHaveLength(LARGO_CODIGO);
    expect(c).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    expect(huellaCodigo(c)).not.toContain(c);
  });
  it('tolera minúsculas, espacios y guiones al escribirlo', () => {
    expect(normalizarCodigo(' abcd-23 ef ')).toBe('ABCD23EF');
    expect(huellaCodigo('abcd-2345')).toBe(huellaCodigo('ABCD2345'));
  });
});

describe('PIN', () => {
  it('rechaza PIN débiles o mal formados', () => {
    for (const pin of ['000000', '111111', '123456', '654321', '12345', '1234567', 'abcdef', '012345']) expect(pinDebil(pin), pin).toBe(true);
  });
  it('acepta uno que no es evidente', () => {
    expect(pinDebil('582049')).toBe(false);
  });
});

describe('reto de un solo uso', () => {
  it('es válido recién creado y devuelve su marca de tiempo', () => {
    const ahora = 1_800_000_000_000;
    expect(validarReto(SECRETO, crearReto(SECRETO, ahora), ahora + 1000)).toBe(ahora);
  });
  it('vence a los 60 segundos', () => {
    const ahora = 1_800_000_000_000;
    expect(validarReto(SECRETO, crearReto(SECRETO, ahora), ahora + 61_000)).toBeNull();
  });
  it('no sirve si se altera o se firmó con otro secreto', () => {
    const ahora = 1_800_000_000_000;
    const reto = crearReto(SECRETO, ahora);
    expect(validarReto('otro-secreto', reto, ahora)).toBeNull();
    expect(validarReto(SECRETO, reto.replace(String(ahora), String(ahora + 1)), ahora)).toBeNull();
    expect(validarReto(SECRETO, 'basura', ahora)).toBeNull();
  });
});

describe('llave del celular y firma', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const firmar = (mensaje: string, llave = privateKey) => sign('sha256', Buffer.from(mensaje), { key: llave, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  it('acepta una llave pública P-256 y descarta cualquier otra cosa', () => {
    const limpia = validarLlavePublica(jwk);
    expect(limpia).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(validarLlavePublica({ ...jwk, d: 'secreta' })).toBeNull();
    expect(validarLlavePublica({ ...jwk, crv: 'P-384' })).toBeNull();
    expect(validarLlavePublica({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' })).toBeNull();
    expect(validarLlavePublica(null)).toBeNull();
  });

  it('la firma vale solo para ese mensaje y esa llave', () => {
    const llave = validarLlavePublica(jwk)!;
    const mensaje = 'reto|{"punto":"fabrica"}';
    expect(firmaValida(llave, mensaje, firmar(mensaje))).toBe(true);
    expect(firmaValida(llave, mensaje + ' ', firmar(mensaje))).toBe(false);
    const otro = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(firmaValida(llave, mensaje, firmar(mensaje, otro.privateKey))).toBe(false);
    expect(firmaValida(llave, mensaje, 'no-es-una-firma')).toBe(false);
  });
});
