// Horario por día de la semana (lunes a domingo). Define cuántas horas
// ordinarias tiene cada día — ej. lunes y viernes de 8 a 5, martes a jueves de
// 8 a 6 y sábado de 8 a 1 (jornada acumulativa que completa las 48 horas) — y
// por lo tanto desde cuántas horas empieza la hora extra de ese día.

// El domingo solo se llena en quien lo trabaja como un día normal de su semana (ej. comercio: 7 días, con un día libre pagado en
// otro día). Sin domingo en el horario, el domingo es el descanso y trabajarlo se paga como día especial.
export const CLAVES_DIA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
export type ClaveDia = (typeof CLAVES_DIA)[number];
export interface TramoHorario {
  entrada: string; // HH:mm
  salida: string; // HH:mm
}
// null o ausente = ese día no trabaja.
export type HorarioSemanal = Partial<Record<ClaveDia, TramoHorario | null>>;

// Horario de la fábrica por defecto: L y V de 8 a 5, M–J de 8 a 6, S de 8 a 1.
export const HORARIO_BASE_POR_DEFECTO: HorarioSemanal = {
  lun: { entrada: '08:00', salida: '17:00' },
  mar: { entrada: '08:00', salida: '18:00' },
  mie: { entrada: '08:00', salida: '18:00' },
  jue: { entrada: '08:00', salida: '18:00' },
  vie: { entrada: '08:00', salida: '17:00' },
  sab: { entrada: '08:00', salida: '13:00' },
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

// Devuelve el horario limpio o lanza un Error con el motivo.
export function validarHorarioSemanal(valor: unknown): HorarioSemanal {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error('El horario no es válido.');
  const limpio: HorarioSemanal = {};
  for (const [clave, tramo] of Object.entries(valor as Record<string, unknown>)) {
    if (!(CLAVES_DIA as readonly string[]).includes(clave)) throw new Error(`«${clave}» no es un día válido (de lunes a domingo).`);
    if (tramo === null || tramo === undefined) {
      limpio[clave as ClaveDia] = null;
      continue;
    }
    const t = tramo as Partial<TramoHorario>;
    if (typeof t.entrada !== 'string' || typeof t.salida !== 'string' || !HORA.test(t.entrada) || !HORA.test(t.salida)) {
      throw new Error('Las horas del horario deben ser HH:mm.');
    }
    if (aMin(t.salida) - aMin(t.entrada) < 60) throw new Error(`En ${clave} la salida debe ser al menos una hora después de la entrada.`);
    limpio[clave as ClaveDia] = { entrada: t.entrada, salida: t.salida };
  }
  if (!Object.values(limpio).some((t) => t)) throw new Error('El horario necesita al menos un día de trabajo.');
  return limpio;
}
