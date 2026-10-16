import { describe, expect, it } from 'vitest';
import { estimarLiquidacion } from './liquidacion.js';

const base = { tipoSalario: 'semanal' as const, montoSalario: 120000, horasSemana: 48, vacacionesTomadasDias: 0, tipoCese: 'renuncia' as const };

describe('estimación de liquidación', () => {
  it('aguinaldo proporcional: cese a mediados de junio con ingreso anterior al período', () => {
    const r = estimarLiquidacion({ ...base, fechaIngreso: '2024-01-15', fechaCese: '2026-06-30' });
    // 1 dic 2025 → 30 jun 2026 = 212 días ≈ 6,97 meses; salario mensual = 120.000×52/12
    expect(r.salarioMensual).toBeCloseTo(520000, 0);
    expect(r.aguinaldo.periodoDesde).toBe('2025-12-01');
    expect(r.aguinaldo.monto).toBeCloseTo((520000 * (212 / 30.4375)) / 12, 0);
  });

  it('si ingresó dentro del período de aguinaldo, cuenta desde su ingreso', () => {
    const r = estimarLiquidacion({ ...base, fechaIngreso: '2026-03-01', fechaCese: '2026-06-30' });
    expect(r.aguinaldo.periodoDesde).toBe('2026-03-01');
  });

  it('vacaciones: 2 semanas por cada 50 de servicio, menos lo ya disfrutado', () => {
    const r = estimarLiquidacion({ ...base, fechaIngreso: '2025-10-01', fechaCese: '2026-09-30' }); // 365 días = 52,14 semanas
    expect(r.vacaciones!.semanasPendientes).toBeCloseTo((52.14 / 50) * 2, 1);
    const tomo = estimarLiquidacion({ ...base, fechaIngreso: '2025-10-01', fechaCese: '2026-09-30', vacacionesTomadasDias: 14 });
    expect(tomo.vacaciones!.semanasPendientes).toBeCloseTo(0.08, 1);
  });

  it('sin fecha de ingreso no calcula vacaciones y lo avisa', () => {
    const r = estimarLiquidacion({ ...base, fechaIngreso: null, fechaCese: '2026-06-30' });
    expect(r.vacaciones).toBeNull();
    expect(r.notas.join(' ')).toContain('fecha de ingreso');
  });

  it('despido sin justa causa: avisa que falta preaviso y cesantía', () => {
    const r = estimarLiquidacion({ ...base, fechaIngreso: '2020-01-01', fechaCese: '2026-06-30', tipoCese: 'despido_con_responsabilidad' });
    expect(r.notas.join(' ')).toContain('CESANTÍA');
  });
});
