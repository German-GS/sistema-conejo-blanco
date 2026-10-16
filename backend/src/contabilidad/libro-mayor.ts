import { redondear } from '../common/utils/dinero.util.js';

export interface MovimientoMayor {
  fecha: string;
  numero: number | null;
  asientoId: string;
  descripcion: string;
  origenTipo: string | null;
  debe: number;
  haber: number;
  // Saldo corrido según la naturaleza de la cuenta (deudora: sube con débitos;
  // acreedora: sube con créditos).
  saldo: number;
}

export interface CuentaMayor {
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: 'deudora' | 'acreedora';
  saldoInicial: number;
  movimientos: MovimientoMayor[];
  totalDebe: number;
  totalHaber: number;
  saldoFinal: number;
}

const aCentavos = (n: number) => Math.round(n * 100);
const deCentavos = (c: number) => redondear(c / 100);

// Arma el mayor de UNA cuenta: arranca del saldo anterior al período y va
// acumulando movimiento por movimiento. Todo en centavos enteros para que ni
// el saldo corrido ni los totales arrastren error de punto flotante.
export function construirCuentaMayor(
  cuenta: Pick<CuentaMayor, 'codigo' | 'nombre' | 'tipo' | 'naturaleza'>,
  previo: { debe: number; haber: number },
  lineas: Array<Omit<MovimientoMayor, 'saldo'>>,
): CuentaMayor {
  const signo = cuenta.naturaleza === 'deudora' ? 1 : -1;
  const saldoInicialC = signo * (aCentavos(previo.debe) - aCentavos(previo.haber));
  let saldoC = saldoInicialC;
  let totalDebeC = 0;
  let totalHaberC = 0;
  const movimientos = lineas.map((l) => {
    const d = aCentavos(l.debe);
    const h = aCentavos(l.haber);
    totalDebeC += d;
    totalHaberC += h;
    saldoC += signo * (d - h);
    return { ...l, debe: deCentavos(d), haber: deCentavos(h), saldo: deCentavos(saldoC) };
  });
  return {
    ...cuenta,
    saldoInicial: deCentavos(saldoInicialC),
    movimientos,
    totalDebe: deCentavos(totalDebeC),
    totalHaber: deCentavos(totalHaberC),
    saldoFinal: deCentavos(saldoC),
  };
}
