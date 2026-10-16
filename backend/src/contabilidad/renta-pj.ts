import { redondear } from '../common/utils/dinero.util.js';

export interface ParametrosRentaPJ {
  // Ingresos brutos anuales hasta los cuales aplica la escala progresiva
  // (micro, pequeñas y medianas empresas). Por encima: tarifa general.
  topeIngresos: number;
  limite1: number;
  limite2: number;
  limite3: number;
  tarifa1: number;
  tarifa2: number;
  tarifa3: number;
  tarifa4: number;
  tarifaGeneral: number;
}

export interface DetalleTramo {
  desde: number;
  hasta: number | null;
  tarifa: number;
  base: number;
  impuesto: number;
}

export interface ResultadoRentaPJ {
  regimen: 'escala' | 'general';
  rentaNeta: number;
  impuesto: number;
  tramos: DetalleTramo[];
}

// Impuesto sobre la renta de una persona jurídica sobre la renta neta del año.
// Hasta el tope de ingresos brutos se aplica la escala por tramos; si lo supera, la
// tarifa general sobre toda la renta neta. Sin utilidad no hay impuesto.
export function calcularRentaPJ(rentaNeta: number, ingresosBrutos: number, p: ParametrosRentaPJ): ResultadoRentaPJ {
  const base = Math.max(0, rentaNeta);
  if (ingresosBrutos > p.topeIngresos) {
    return {
      regimen: 'general',
      rentaNeta: redondear(base),
      impuesto: redondear((base * p.tarifaGeneral) / 100),
      tramos: [{ desde: 0, hasta: null, tarifa: p.tarifaGeneral, base: redondear(base), impuesto: redondear((base * p.tarifaGeneral) / 100) }],
    };
  }
  const cortes: Array<{ desde: number; hasta: number | null; tarifa: number }> = [
    { desde: 0, hasta: p.limite1, tarifa: p.tarifa1 },
    { desde: p.limite1, hasta: p.limite2, tarifa: p.tarifa2 },
    { desde: p.limite2, hasta: p.limite3, tarifa: p.tarifa3 },
    { desde: p.limite3, hasta: null, tarifa: p.tarifa4 },
  ];
  const tramos: DetalleTramo[] = cortes.map((c) => {
    const dentro = Math.max(0, Math.min(base, c.hasta ?? base) - c.desde);
    return { ...c, base: redondear(dentro), impuesto: redondear((dentro * c.tarifa) / 100) };
  });
  return {
    regimen: 'escala',
    rentaNeta: redondear(base),
    impuesto: redondear(tramos.reduce((a, t) => a + t.impuesto, 0)),
    tramos,
  };
}
