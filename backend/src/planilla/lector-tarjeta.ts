// Lee la «Tarjeta de Tiempo» que exporta el reloj de huella (PLANILLA.xls):
// un bloque por empleado — «Número:», «Empleado:», el período — y una fila
// por día con la fecha («Lun 05/10/2026») y, en una sola celda, todas las
// marcas del día separadas por espacios (o «Inasistencia»). Los totales que
// calcula el reloj se ignoran: todo se recalcula con las marcas.
import { esXls, leerCeldasXls, type CeldaXls } from './lector-xls.js';
import type { Lectura } from './lector-excel.js';

const FECHA_DIA = /^\s*\p{L}{3}\.?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/u;
const HORAS = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

export interface EmpleadoReloj {
  numero: string;
  nombre: string;
}

export interface TarjetaLeida extends Lectura {
  empleados: EmpleadoReloj[];
  // Marcas y días por empleado, para mostrar un resumen antes de importar.
  resumen: Array<{ numero: string; dias: number; ausencias: number; marcas: number }>;
}

const pad = (n: string) => n.padStart(2, '0');

export function interpretarTarjeta(celdas: CeldaXls[]): TarjetaLeida {
  const porFila = new Map<number, CeldaXls[]>();
  for (const c of celdas) {
    if (!porFila.has(c.fila)) porFila.set(c.fila, []);
    porFila.get(c.fila)!.push(c);
  }
  for (const fila of porFila.values()) fila.sort((a, b) => a.col - b.col);
  const filas = [...porFila.keys()].sort((a, b) => a - b);

  const inicios = filas.filter((f) => porFila.get(f)!.some((c) => c.texto.trim() === 'Número:'));
  if (inicios.length === 0) {
    throw new Error('No parece una Tarjeta de Tiempo del reloj: no se encontraron bloques «Número:».');
  }

  const valorDespuesDe = (fila: CeldaXls[], etiqueta: string): string => {
    const i = fila.findIndex((c) => c.texto.trim() === etiqueta);
    return i >= 0 ? (fila[i + 1]?.texto.trim() ?? '') : '';
  };

  const marcas: Lectura['marcas'] = [];
  const presentes: Lectura['presentes'] = [];
  const fechas = new Set<string>();
  const empleados: EmpleadoReloj[] = [];
  const resumen: TarjetaLeida['resumen'] = [];

  inicios.forEach((inicio, k) => {
    const fin = inicios[k + 1] ?? Infinity;
    const bloque = filas.filter((f) => f >= inicio && f < fin);

    const numeroCrudo = valorDespuesDe(porFila.get(inicio)!, 'Número:');
    const numero = numeroCrudo.replace(/^0+(?=\d)/, '');
    const filaNombre = bloque.find((f) => porFila.get(f)!.some((c) => c.texto.trim() === 'Empleado:'));
    const nombre = filaNombre !== undefined ? valorDespuesDe(porFila.get(filaNombre)!, 'Empleado:').replace(/\s+/g, ' ') : '';
    if (!numero) return;

    // Las marcas están a la izquierda de los totales del reloj.
    const colTotales = (() => {
      for (const f of bloque) {
        const c = porFila.get(f)!.find((x) => x.texto.includes('Totales'));
        if (c) return c.col;
      }
      return 36;
    })();

    empleados.push({ numero, nombre });
    presentes.push({ numero, nombre });
    const r = { numero, dias: 0, ausencias: 0, marcas: 0 };
    for (const f of bloque) {
      const fila = porFila.get(f)!;
      const celdaFecha = fila.find((c) => FECHA_DIA.test(c.texto));
      if (!celdaFecha) continue;
      const [, d, m, a] = FECHA_DIA.exec(celdaFecha.texto)!;
      const fecha = `${a}-${pad(m)}-${pad(d)}`;
      fechas.add(fecha);
      r.dias++;
      let hubo = 0;
      for (const c of fila) {
        if (c.col <= celdaFecha.col || c.col >= colTotales - 1) continue;
        for (const h of c.texto.matchAll(HORAS)) {
          marcas.push({ numero, nombre, fecha, hora: `${pad(h[1])}:${h[2]}` });
          hubo++;
        }
      }
      r.marcas += hubo;
      if (hubo === 0) r.ausencias++;
    }
    resumen.push(r);
  });

  return { marcas, presentes, fechas: [...fechas].sort(), filasIgnoradas: 0, empleados, resumen };
}

export function leerTarjetaXls(buffer: Buffer): TarjetaLeida {
  if (!esXls(buffer)) throw new Error('El archivo no es un .xls del reloj.');
  return interpretarTarjeta(leerCeldasXls(buffer));
}
