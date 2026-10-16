import { describe, expect, it } from 'vitest';
import { interpretarTarjeta } from './lector-tarjeta.js';

// Celdas inventadas con la forma de la Tarjeta de Tiempo del reloj.
const c = (fila: number, col: number, texto: string) => ({ fila, col, texto });
const celdas = [
  c(10, 7, 'Número:'), c(10, 21, '000000003'),
  c(12, 7, 'Empleado:'), c(12, 22, 'PEREZ GOMEZ ANA'),
  c(19, 36, ' Totales   Detalle'),
  c(23, 9, 'Lun 05/10/2026'), c(23, 19, ' 07:46                   16:30  '), c(23, 35, ' 08:44  00:00    00:44      08:00  '),
  c(25, 9, 'Mar 06/10/2026'), c(25, 19, ' Inasistencia'),
  c(27, 9, 'Mié 07/10/2026'), c(27, 19, ' 07:50   12:00   13:00   17:00 '),
  c(29, 9, 'Jue 08/10/2026'), c(29, 19, ' 17:34                          '),
  c(45, 7, 'Número:'), c(45, 21, '000000010'),
  c(47, 7, 'Empleado:'), c(47, 22, 'LOPEZ SOTO LUIS'),
  c(58, 9, 'Lun 05/10/2026'), c(58, 19, ' Inasistencia'),
];

describe('Tarjeta de Tiempo del reloj', () => {
  const t = interpretarTarjeta(celdas);

  it('encuentra a los empleados por bloque, sin ceros a la izquierda', () => {
    expect(t.empleados).toEqual([
      { numero: '3', nombre: 'PEREZ GOMEZ ANA' },
      { numero: '10', nombre: 'LOPEZ SOTO LUIS' },
    ]);
  });

  it('lee las marcas de cada día y deja fuera los totales del reloj', () => {
    const del = (fecha: string) => t.marcas.filter((m) => m.numero === '3' && m.fecha === fecha).map((m) => m.hora);
    expect(del('2026-10-05')).toEqual(['07:46', '16:30']); // los «08:44»/«00:44» de totales no cuentan
    expect(del('2026-10-07')).toEqual(['07:50', '12:00', '13:00', '17:00']);
    expect(del('2026-10-08')).toEqual(['17:34']);
  });

  it('«Inasistencia» es un día sin marcas', () => {
    expect(t.marcas.some((m) => m.fecha === '2026-10-06')).toBe(false);
    expect(t.resumen[0]).toEqual({ numero: '3', dias: 4, ausencias: 1, marcas: 7 });
    expect(t.resumen[1]).toEqual({ numero: '10', dias: 1, ausencias: 1, marcas: 0 });
  });

  it('todos aparecen como presentes aunque no tengan marcas, y las fechas van ordenadas', () => {
    expect(t.presentes.map((p) => p.numero)).toEqual(['3', '10']);
    expect(t.fechas).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  });
});
