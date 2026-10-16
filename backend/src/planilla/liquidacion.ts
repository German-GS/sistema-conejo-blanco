// Estimación de lo que se le debe a un empleado al cesar la relación laboral.
// Es una ESTIMACIÓN para revisar con la contadora: usa el salario actual (no
// el promedio real de los últimos meses) y no incluye preaviso ni cesantía,
// que dependen de la causa del cese y de la antigüedad (ver las notas).
import { redondear } from '../common/utils/dinero.util.js';

export type TipoCese = 'renuncia' | 'despido_con_responsabilidad' | 'despido_sin_responsabilidad' | 'mutuo_acuerdo' | 'fin_contrato';

export const ETIQUETAS_CESE: Record<TipoCese, string> = {
  renuncia: 'Renuncia',
  despido_con_responsabilidad: 'Despido con responsabilidad patronal (sin justa causa)',
  despido_sin_responsabilidad: 'Despido sin responsabilidad patronal (con justa causa)',
  mutuo_acuerdo: 'Mutuo acuerdo',
  fin_contrato: 'Fin de contrato',
};

export interface EntradaLiquidacion {
  tipoSalario: 'mensual' | 'semanal' | 'por_hora';
  montoSalario: number;
  horasSemana: number;
  fechaIngreso: string | null;
  fechaCese: string;
  tipoCese: TipoCese;
  // Días de vacaciones (calendario) que ya disfrutó o le pagaron.
  vacacionesTomadasDias: number;
}

const DIA_MS = 86_400_000;
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

export function estimarLiquidacion(e: EntradaLiquidacion) {
  const salarioSemanal =
    e.tipoSalario === 'semanal' ? e.montoSalario : e.tipoSalario === 'mensual' ? (e.montoSalario * 12) / 52 : e.montoSalario * e.horasSemana;
  const salarioMensual = (salarioSemanal * 52) / 12;

  // Aguinaldo: del 1 de diciembre al 30 de noviembre; se paga lo
  // proporcional al tiempo trabajado en ese período (salarios ÷ 12).
  const [anio, mes] = e.fechaCese.split('-').map(Number);
  const inicioPeriodo = mes === 12 ? `${anio}-12-01` : `${anio - 1}-12-01`;
  const inicioAguinaldo = e.fechaIngreso && e.fechaIngreso > inicioPeriodo ? e.fechaIngreso : inicioPeriodo;
  const diasAguinaldo = Math.max(0, diasEntre(inicioAguinaldo, e.fechaCese) + 1);
  const mesesAguinaldo = diasAguinaldo / 30.4375;
  const aguinaldo = redondear((salarioMensual * mesesAguinaldo) / 12);

  // Vacaciones: 2 semanas por cada 50 semanas de servicio (art. 153 del
  // Código de Trabajo); se paga lo devengado y no disfrutado.
  let vacaciones: number | null = null;
  let semanasServicio: number | null = null;
  let semanasPendientes: number | null = null;
  if (e.fechaIngreso) {
    semanasServicio = (diasEntre(e.fechaIngreso, e.fechaCese) + 1) / 7;
    const devengadas = (semanasServicio / 50) * 2;
    semanasPendientes = Math.max(0, devengadas - e.vacacionesTomadasDias / 7);
    vacaciones = redondear(semanasPendientes * salarioSemanal);
  }

  const notas: string[] = [];
  if (!e.fechaIngreso) {
    notas.push('Falta la fecha de ingreso del empleado: sin ella no se puede calcular las vacaciones (ni la antigüedad). Agregala en Editar.');
  }
  notas.push('El salario de la última semana o quincena trabajada se paga aparte, en la planilla normal.');
  if (e.tipoCese === 'despido_con_responsabilidad') {
    notas.push('Por despido sin justa causa le corresponden además PREAVISO y CESANTÍA, que dependen de su antigüedad (arts. 28 y 29 del Código de Trabajo). Calculalos con la contadora o el abogado: no están incluidos en este total.');
  } else if (e.tipoCese === 'renuncia') {
    notas.push('Por renuncia el empleado debe dar preaviso (si no lo da, consultá con el abogado cómo se maneja). La cesantía normalmente no aplica; el ahorro del FCL y del ROP se retira directamente en la operadora.');
  } else if (e.tipoCese === 'despido_sin_responsabilidad') {
    notas.push('Con justa causa no hay preaviso ni cesantía, pero la causa debe estar bien documentada: confirmala con el abogado antes de liquidar.');
  } else {
    notas.push('Revisá con la contadora si en este caso corresponde preaviso o cesantía.');
  }
  notas.push('Se debe entregar el finiquito firmado y reportar la baja a la CCSS (SICERE/INS) y entregar la carta o constancia de trabajo.');

  return {
    salarioSemanal: redondear(salarioSemanal),
    salarioMensual: redondear(salarioMensual),
    aguinaldo: { periodoDesde: inicioAguinaldo, meses: redondear(mesesAguinaldo), monto: aguinaldo },
    vacaciones: vacaciones === null ? null : { semanasServicio: redondear(semanasServicio!), semanasPendientes: redondear(semanasPendientes!), monto: vacaciones },
    total: redondear(aguinaldo + (vacaciones ?? 0)),
    notas,
  };
}
