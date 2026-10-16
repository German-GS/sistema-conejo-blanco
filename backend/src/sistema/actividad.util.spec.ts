import { describe, expect, it } from 'vitest';
import { areaDeRuta, esLecturaSensible, resumirCuerpo } from './actividad.util.js';

describe('areaDeRuta', () => {
  it('clasifica las rutas por área', () => {
    expect(areaDeRuta('/auth/login')).toBe('accesos');
    expect(areaDeRuta('/usuarios/abc/restablecer-clave')).toBe('accesos');
    expect(areaDeRuta('/planilla/planillas/1/aprobar')).toBe('administrativa');
    expect(areaDeRuta('/contabilidad/mayor?desde=2026-01-01')).toBe('administrativa');
    expect(areaDeRuta('/pedidos')).toBe('ventas');
    expect(areaDeRuta('/traspasos')).toBe('inventario');
    expect(areaDeRuta('/sistema/actividad')).toBe('sistema');
    expect(areaDeRuta('/otra-cosa')).toBe('otros');
  });
});

describe('resumirCuerpo', () => {
  it('oculta claves, códigos y tokens a cualquier profundidad', () => {
    const r = resumirCuerpo({ email: 'a@b.cr', password: 'secreta1', nuevo: { passwordNueva: 'x', ticket: 't', codigo: '123456' } }) as Record<string, unknown>;
    expect(r.password).toBe('***');
    expect(JSON.stringify(r)).not.toContain('secreta1');
    expect((r.nuevo as Record<string, unknown>).passwordNueva).toBe('***');
    expect((r.nuevo as Record<string, unknown>).codigo).toBe('***');
    expect(r.email).toBe('a@b.cr');
  });

  it('recorta textos y arreglos largos', () => {
    const r = resumirCuerpo({ nota: 'x'.repeat(500), lineas: Array.from({ length: 20 }, (_, i) => ({ i })) }) as { nota: string; lineas: unknown[] };
    expect(r.nota.length).toBeLessThan(130);
    expect(r.lineas.length).toBe(6);
  });
});

describe('esLecturaSensible', () => {
  it('registra lecturas de planilla/contabilidad y descargas, no catálogos', () => {
    expect(esLecturaSensible('/planilla/empleados')).toBe(true);
    expect(esLecturaSensible('/pedidos/1/pdf')).toBe(true);
    expect(esLecturaSensible('/catalogo/productos')).toBe(false);
    expect(esLecturaSensible('/pedidos')).toBe(false);
  });
});
