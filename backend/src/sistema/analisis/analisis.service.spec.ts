import { describe, expect, it } from 'vitest';
import { AnalisisService } from './analisis.service.js';
import { DATASETS } from './analisis.datasets.js';

const servicio = new AnalisisService(null as never, null as never);

describe('AnalisisService.csv', () => {
  it('escapa comas, comillas y saltos de línea, y agrega BOM para Excel', () => {
    const buf = servicio.csv(['a', 'b'], [{ a: 'uno, dos', b: 'dice "hola"\nchau' }]);
    expect(buf.toString('utf8')).toBe('﻿a,b\r\n"uno, dos","dice ""hola""\nchau"\r\n');
  });

  it('neutraliza fórmulas pero deja pasar números negativos', () => {
    const buf = servicio.csv(['x'], [{ x: '=CMD()' }, { x: -15.5 }, { x: null }]);
    expect(buf.toString('utf8')).toBe("﻿x\r\n'=CMD()\r\n-15.5\r\n\r\n");
  });
});

describe('catálogo de datasets', () => {
  it('no expone claves ni datos de contacto de clientes', () => {
    const sql = DATASETS.map((d) => d.sql(true)).join('\n').toLowerCase();
    for (const prohibido of ['password', 'totp', 'c.cedula', 'c.telefono', 'c.email', 'iban']) expect(sql).not.toContain(prohibido);
  });

  it('la planilla es dato personal y solo muestra nombre y cédula si se pide completa', () => {
    const planilla = DATASETS.find((d) => d.id === 'planilla')!;
    expect(planilla.personal).toBe(true);
    expect(planilla.sql(true)).not.toContain('empleado_nombre');
    expect(planilla.sql(false)).toContain('empleado_nombre');
  });
});
