// Aritmética de fechas tipo "date" (sin hora) — siempre en UTC para que
// sumar/restar días no se corra por el huso horario del servidor.

export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// Cuántos días faltan de `desdeISO` a `fechaISO` (negativo si `fechaISO`
// ya pasó).
export function diferenciaEnDias(fechaISO: string, desdeISO: string): number {
  const a = new Date(`${fechaISO}T00:00:00Z`).getTime();
  const b = new Date(`${desdeISO}T00:00:00Z`).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// "Hoy" en hora de Costa Rica (UTC−6, sin horario de verano): el servidor
// corre en UTC, y después de las 6 p. m. en Costa Rica ya es "mañana" allá.
export function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
