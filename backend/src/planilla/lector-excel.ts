// Lee el Excel que exporta el reloj de huella. IMPORTANTE: todavía no se
// tiene el archivo real, así que esto se hizo a partir de la tarjeta de
// tiempo impresa y es deliberadamente flexible:
//  - detecta la fila de encabezados y propone qué columna es cada cosa;
//  - la persona puede corregir ese mapeo antes de importar;
//  - acepta dos formas: una fila por día (con columnas de Entrada/Comida/
//    Salida) o un registro de marcas (una fila por marca con fecha y hora).
// Cuando llegue el archivo real, lo que se ajusta es solo detectarMapeo().
import ExcelJS from 'exceljs';

export type Diseno = 'por_dia' | 'registro';

export interface Mapeo {
  diseno: Diseno;
  filaEncabezado: number; // 1-based
  numero: number; // columna (1-based) con el número del reloj
  nombre: number | null;
  fecha: number | null; // por_dia: fecha del día
  horas: number[]; // por_dia: columnas con marcas (Entrada, Comida, Salida…)
  fechaHora: number | null; // registro: columna con fecha y hora de la marca
  hora: number | null; // registro: si la hora viene en otra columna que la fecha
}

export interface Previsualizacion {
  hoja: string;
  columnas: Array<{ indice: number; encabezado: string }>;
  muestra: string[][];
  mapeoSugerido: Mapeo;
  totalFilas: number;
}

export interface MarcaLeida {
  numero: string;
  nombre: string | null;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
}

export interface Lectura {
  marcas: MarcaLeida[];
  // Empleados que aparecen en el archivo aunque no tengan marcas (la
  // tarjeta impresa los lista con "Inasistencia"): así se detectan las
  // ausencias de semana completa.
  presentes: Array<{ numero: string; nombre: string | null }>;
  fechas: string[];
  filasIgnoradas: number;
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    const v = valor as unknown as Record<string, unknown>;
    if ('result' in v) return celdaATexto(v.result as ExcelJS.CellValue);
    if ('richText' in v && Array.isArray(v.richText)) return (v.richText as Array<{ text: string }>).map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
  }
  return String(valor);
}

const HORA = /(\d{1,2}):(\d{2})/g;

// Todas las horas HH:mm que contenga la celda (la tarjeta impresa llega a
// meter dos marcas apiladas en la misma celda).
export function horasDeCelda(valor: ExcelJS.CellValue): string[] {
  if (valor instanceof Date) {
    return [`${String(valor.getUTCHours()).padStart(2, '0')}:${String(valor.getUTCMinutes()).padStart(2, '0')}`];
  }
  if (typeof valor === 'number' && valor > 0 && valor < 1) {
    const total = Math.round(valor * 24 * 60);
    return [`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`];
  }
  const texto = celdaATexto(valor);
  const resultado: string[] = [];
  for (const m of texto.matchAll(HORA)) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 24 && min < 60) resultado.push(`${String(h).padStart(2, '0')}:${m[2]}`);
  }
  return resultado;
}

// Acepta Date, "03/08/2026", "Lun 03/08/2026", "2026-08-03" y número serial
// de Excel. Las fechas con barra se leen día/mes/año (como en Costa Rica).
export function fechaDeCelda(valor: ExcelJS.CellValue): string | null {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    return new Date(Math.round((valor - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const texto = celdaATexto(valor);
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = texto.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dmy) {
    const anio = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${anio}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return null;
}

async function cargar(buffer: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  return hoja;
}

const PISTAS = {
  numero: ['numero', 'num', 'no.', 'id', 'codigo', 'carnet', 'tarjeta'],
  nombre: ['empleado', 'nombre', 'colaborador', 'trabajador'],
  fecha: ['fecha', 'dia'],
  fechaHora: ['fecha y hora', 'fecha/hora', 'fechahora', 'marca', 'timestamp'],
  hora: ['hora'],
  horas: ['entrada', 'salida', 'comida', 'almuerzo', 'ingreso', 'inicio', 'fin'],
};

export function detectarMapeo(filas: string[][]): Mapeo {
  const limite = Math.min(filas.length, 15);
  let mejor = { fila: 1, puntos: -1 };
  for (let i = 0; i < limite; i++) {
    const celdas = filas[i].map(sinAcentos);
    const puntos = celdas.filter((c) => c && Object.values(PISTAS).some((lista) => lista.some((p) => c.includes(p)))).length;
    if (puntos > mejor.puntos) mejor = { fila: i + 1, puntos };
  }
  const encabezados = (filas[mejor.fila - 1] ?? []).map(sinAcentos);
  const buscar = (lista: string[], excluir: number[] = []) => {
    const i = encabezados.findIndex((c, idx) => !excluir.includes(idx + 1) && c && lista.some((p) => c.includes(p)));
    return i === -1 ? null : i + 1;
  };

  const numero = buscar(PISTAS.numero) ?? 1;
  const nombre = buscar(PISTAS.nombre, [numero]);
  const fechaHora = buscar(PISTAS.fechaHora);
  const horas = encabezados
    .map((c, idx) => ({ c, col: idx + 1 }))
    .filter(({ c }) => c && PISTAS.horas.some((p) => c.includes(p)))
    .map(({ col }) => col);

  if (fechaHora && horas.length === 0) {
    return { diseno: 'registro', filaEncabezado: mejor.fila, numero, nombre, fecha: null, horas: [], fechaHora, hora: null };
  }
  const fecha = buscar(PISTAS.fecha, [numero]);
  const hora = fecha && horas.length === 0 ? buscar(PISTAS.hora, [fecha]) : null;
  if (hora) {
    return { diseno: 'registro', filaEncabezado: mejor.fila, numero, nombre, fecha, horas: [], fechaHora: null, hora };
  }
  return { diseno: 'por_dia', filaEncabezado: mejor.fila, numero, nombre, fecha, horas, fechaHora: null, hora: null };
}

export async function previsualizar(buffer: Buffer): Promise<Previsualizacion> {
  const hoja = await cargar(buffer);
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila) => {
    const celdas: string[] = [];
    for (let c = 1; c <= hoja.columnCount; c++) celdas.push(celdaATexto(fila.getCell(c).value).replace(/\s+/g, ' ').trim());
    filas.push(celdas);
  });
  const mapeoSugerido = detectarMapeo(filas);
  const encabezados = filas[mapeoSugerido.filaEncabezado - 1] ?? [];
  return {
    hoja: hoja.name,
    columnas: encabezados.map((e, i) => ({ indice: i + 1, encabezado: e || `Columna ${i + 1}` })),
    muestra: filas.slice(mapeoSugerido.filaEncabezado, mapeoSugerido.filaEncabezado + 12),
    mapeoSugerido,
    totalFilas: Math.max(0, filas.length - mapeoSugerido.filaEncabezado),
  };
}

export async function leerMarcas(buffer: Buffer, mapeo: Mapeo): Promise<Lectura> {
  const hoja = await cargar(buffer);
  const marcas: MarcaLeida[] = [];
  const presentes = new Map<string, string | null>();
  const fechas = new Set<string>();
  let ignoradas = 0;

  // En las tarjetas impresas el número y el nombre solo aparecen en el
  // encabezado de cada bloque — se arrastran hacia abajo hasta el siguiente.
  let numeroActual: string | null = null;
  let nombreActual: string | null = null;

  hoja.eachRow({ includeEmpty: false }, (fila, indice) => {
    if (indice <= mapeo.filaEncabezado) return;
    const numeroCelda = celdaATexto(fila.getCell(mapeo.numero).value).trim();
    if (numeroCelda) {
      numeroActual = numeroCelda;
      nombreActual = mapeo.nombre ? celdaATexto(fila.getCell(mapeo.nombre).value).trim() || nombreActual : nombreActual;
      presentes.set(numeroActual, nombreActual);
    }
    if (!numeroActual) {
      ignoradas++;
      return;
    }

    if (mapeo.diseno === 'por_dia') {
      const fecha = mapeo.fecha ? fechaDeCelda(fila.getCell(mapeo.fecha).value) : null;
      if (!fecha) {
        ignoradas++;
        return;
      }
      fechas.add(fecha);
      for (const col of mapeo.horas) {
        for (const hora of horasDeCelda(fila.getCell(col).value)) {
          marcas.push({ numero: numeroActual, nombre: nombreActual, fecha, hora });
        }
      }
      return;
    }

    // registro: una marca por fila
    let fecha: string | null = null;
    let horas: string[] = [];
    if (mapeo.fechaHora) {
      const valor = fila.getCell(mapeo.fechaHora).value;
      fecha = fechaDeCelda(valor);
      horas = horasDeCelda(valor instanceof Date ? valor : celdaATexto(valor));
    } else if (mapeo.fecha && mapeo.hora) {
      fecha = fechaDeCelda(fila.getCell(mapeo.fecha).value);
      horas = horasDeCelda(fila.getCell(mapeo.hora).value);
    }
    if (!fecha || horas.length === 0) {
      ignoradas++;
      return;
    }
    fechas.add(fecha);
    for (const hora of horas) marcas.push({ numero: numeroActual, nombre: nombreActual, fecha, hora });
  });

  return {
    marcas,
    presentes: [...presentes.entries()].map(([numero, nombre]) => ({ numero, nombre })),
    fechas: [...fechas].sort(),
    filasIgnoradas: ignoradas,
  };
}
