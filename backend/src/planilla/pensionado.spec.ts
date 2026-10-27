import { describe, expect, it } from 'vitest';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import { calcularLinea } from './calculo.js';
import { EstadoDia, FrecuenciaPago, TipoSalario } from './planilla.enums.js';

const p = Object.fromEntries(PARAMETROS_POR_DEFECTO.map((x) => [x.nombre, x.valor]));
const dia = (fecha: string) => ({ fecha, tipoDia: 'ordinario' as const, estado: EstadoDia.OK, descuenta: false, minutosNetos: 480, minutosExtra: 0, minutosEspeciales: 0, feriadoPagoObligatorio: true });
const base = (cotizaIvm?: boolean) =>
  calcularLinea({
    empleado: { tipoSalario: TipoSalario.SEMANAL, montoSalario: 230400, frecuenciaPago: FrecuenciaPago.SEMANAL, tieneConyuge: false, cantidadHijos: 0, cotizaIvm },
    dias: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'].map(dia),
    desde: '2026-10-12', hasta: '2026-10-18', p, brutoPrevioMes: 0, rentaPrevioMes: 0, deudas: [],
  });

describe('pensionado que sigue trabajando (no cotiza IVM)', () => {
  it('quien cotiza normal paga SEM 5,5 + IVM 4,33 + Banco Popular 1 = 10,83 %', () => {
    const r = base();
    expect(r.bruto).toBe(230400);
    expect(r.sem + r.ivm + r.bancoPopular).toBeCloseTo(230400 * 0.1083, 1);
  });

  it('el pensionado paga solo SEM y Banco Popular: 6,5 % (₡14.976 sobre ₡230.400)', () => {
    const r = base(false);
    expect(r.ivm).toBe(0);
    expect(r.sem + r.bancoPopular).toBe(14976);
    expect(r.totalDeducciones).toBeLessThan(base().totalDeducciones);
    expect(r.neto).toBe(230400 - 14976);
  });
});
