// Importar empleados desde un Excel: lee las filas, las compara con los empleados que ya
// existen (por cédula o por nombre) y dice qué se crearía, qué cambiaría y qué está mal,
// ANTES de tocar nada. Lógica pura (sin base de datos); se prueba en importar-empleados.spec.ts.
import ExcelJS from 'exceljs';

export interface FilaEmpleado {
  fila: number;
  nombre: string;
  cedula: string | null;
  numeroReloj: string | null;
  puesto: string | null;
  departamento: string | null;
  fechaIngreso: string | null;
  tipoSalario: 'mensual' | 'semanal' | 'por_hora' | null;
  monto: number | null;
  frecuenciaPago: 'semanal' | 'quincenal' | 'mensual' | null;
  horasSemana: number | null;
  sector: 'industria' | 'comercio' | null;
  esDeTienda: boolean | null;
  esConfianza: boolean | null;
  marcaReloj: boolean | null;
  formaPago: 'banco_popular' | 'efectivo' | null;
  iban: string | null;
  identificadorBp: string | null;
  errores: string[];
}

export const sinAcentos = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const soloDigitos = (t: unknown): string => String(t ?? '').replace(/\D/g, '');

// Encabezados que se reconocen (sin acentos ni mayúsculas) → campo.
const ALIAS: Record<string, string> = {
  nombre: 'nombre', empleado: 'nombre',
  cedula: 'cedula', identificacion: 'cedula',
  'numero de reloj': 'numeroReloj', 'n reloj': 'numeroReloj', reloj: 'numeroReloj',
  puesto: 'puesto',
  departamento: 'departamento', 'lugar de trabajo': 'departamento', area: 'departamento',
  'fecha de ingreso': 'fechaIngreso', ingreso: 'fechaIngreso',
  'tipo de salario': 'tipoSalario', 'tipo salario': 'tipoSalario',
  monto: 'monto', 'monto del salario': 'monto', salario: 'monto', 'salario por hora': 'monto', tarifa: 'monto',
  'se paga': 'frecuenciaPago', frecuencia: 'frecuenciaPago', 'frecuencia de pago': 'frecuenciaPago',
  'horas por semana': 'horasSemana', 'horas semana': 'horasSemana',
  sector: 'sector',
  'es de tienda': 'esDeTienda', tienda: 'esDeTienda',
  'puesto de confianza': 'esConfianza', confianza: 'esConfianza',
  'marca en reloj': 'marcaReloj', 'marca reloj': 'marcaReloj',
  'forma de pago': 'formaPago',
  iban: 'iban', cuenta: 'iban',
  'identificador banco popular': 'identificadorBp', 'identificador bp': 'identificadorBp', 'identificador unico cliente': 'identificadorBp',
};

const SI = ['si', 'sí', 's', 'x', 'true', '1', 'yes'];
const NO = ['no', 'n', 'false', '0'];
const bool = (v: unknown): boolean | null => {
  const t = sinAcentos(String(v ?? ''));
  if (!t) return null;
  if (SI.map(sinAcentos).includes(t)) return true;
  if (NO.includes(t)) return false;
  return null;
};

const valorCelda = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as { result: unknown }).result;
    if ('text' in v) return (v as { text: unknown }).text;
    if ('richText' in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join('');
  }
  return v;
};

function fechaISO(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const t = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

export async function leerEmpleadosExcel(buffer: Buffer): Promise<FilaEmpleado[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as never);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  // La fila de encabezados es la primera que trae «nombre» (o «empleado»).
  let filaEnc = 0;
  const columnas: Record<number, string> = {};
  for (let r = 1; r <= Math.min(hoja.rowCount, 15) && !filaEnc; r++) {
    const tmp: Record<number, string> = {};
    hoja.getRow(r).eachCell((celda, c) => {
      const campo = ALIAS[sinAcentos(String(valorCelda(celda.value) ?? ''))];
      if (campo) tmp[c] = campo;
    });
    if (Object.values(tmp).includes('nombre')) {
      filaEnc = r;
      Object.assign(columnas, tmp);
    }
  }
  if (!filaEnc) throw new Error('No se encontró la fila de encabezados: debe haber una columna «Nombre».');

  const filas: FilaEmpleado[] = [];
  for (let r = filaEnc + 1; r <= hoja.rowCount; r++) {
    const crudo: Record<string, unknown> = {};
    hoja.getRow(r).eachCell((celda, c) => {
      if (columnas[c]) crudo[columnas[c]] = valorCelda(celda.value);
    });
    const nombre = String(crudo.nombre ?? '').replace(/\s+/g, ' ').trim();
    if (!nombre) continue;
    const errores: string[] = [];
    const tipoTxt = sinAcentos(String(crudo.tipoSalario ?? ''));
    const tipoSalario = tipoTxt.startsWith('hora') || tipoTxt === 'por hora' ? 'por_hora' : tipoTxt.startsWith('sem') ? 'semanal' : tipoTxt.startsWith('mens') ? 'mensual' : null;
    if (crudo.tipoSalario && !tipoSalario) errores.push('El tipo de salario debe ser por hora, semanal o mensual.');
    const frecTxt = sinAcentos(String(crudo.frecuenciaPago ?? ''));
    const frecuenciaPago = frecTxt.startsWith('sem') ? 'semanal' : frecTxt.startsWith('quin') ? 'quincenal' : frecTxt.startsWith('mens') ? 'mensual' : null;
    if (crudo.frecuenciaPago && !frecuenciaPago) errores.push('«Se paga» debe ser semanal, quincenal o mensual.');
    const montoTxt = crudo.monto === undefined ? '' : String(crudo.monto).replace(/[^\d.-]/g, '');
    const monto = crudo.monto === undefined || String(crudo.monto).trim() === '' ? null : montoTxt === '' ? Number.NaN : Number(montoTxt);
    if (monto !== null && (!Number.isFinite(monto) || monto < 0)) errores.push('El monto no es válido.');
    const horas = crudo.horasSemana === undefined || crudo.horasSemana === '' ? null : Number(crudo.horasSemana);
    if (horas !== null && (!Number.isFinite(horas) || horas <= 0 || horas > 84)) errores.push('Las horas por semana no son válidas.');
    const sectorTxt = sinAcentos(String(crudo.sector ?? ''));
    const sector = sectorTxt === 'comercio' ? 'comercio' : sectorTxt === 'industria' ? 'industria' : null;
    const formaTxt = sinAcentos(String(crudo.formaPago ?? ''));
    const formaPago = formaTxt.startsWith('efec') ? 'efectivo' : formaTxt.startsWith('banco') ? 'banco_popular' : null;
    const iban = String(crudo.iban ?? '').replace(/\s+/g, '').toUpperCase() || null;
    if (iban && !/^CR\d{20}$/.test(iban)) errores.push('El IBAN debe ser CR más 20 dígitos.');
    const ingreso = fechaISO(crudo.fechaIngreso);
    if (crudo.fechaIngreso && !ingreso) errores.push('La fecha de ingreso no se entiende (use AAAA-MM-DD o DD/MM/AAAA).');
    filas.push({
      fila: r,
      nombre,
      cedula: soloDigitos(crudo.cedula) || null,
      numeroReloj: String(crudo.numeroReloj ?? '').trim() || null,
      puesto: String(crudo.puesto ?? '').trim() || null,
      departamento: String(crudo.departamento ?? '').trim() || null,
      fechaIngreso: ingreso,
      tipoSalario,
      monto,
      frecuenciaPago,
      horasSemana: horas,
      sector,
      esDeTienda: bool(crudo.esDeTienda),
      esConfianza: bool(crudo.esConfianza),
      marcaReloj: bool(crudo.marcaReloj),
      formaPago,
      iban,
      identificadorBp: soloDigitos(crudo.identificadorBp) || null,
      errores,
    });
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Comparación con los empleados que ya existen
// ---------------------------------------------------------------------------

export interface EmpleadoExistente {
  id: string;
  numeroReloj: string;
  nombre: string;
  cedula: string | null;
  puesto: string | null;
  departamento?: string | null;
  fechaIngreso: string | null;
  tipoSalario: string;
  montoSalario: string;
  frecuenciaPago: string;
  horasSemana: string | null;
  sector: string;
  esDeTienda: boolean;
  esConfianza: boolean;
  marcaReloj: boolean;
  formaPago: string;
  iban: string | null;
  identificadorBp: string | null;
}

export interface Cambio {
  campo: string;
  etiqueta: string;
  antes: string;
  despues: string;
}

export interface ResultadoFila {
  fila: FilaEmpleado;
  accion: 'crear' | 'actualizar' | 'sin_cambios' | 'error';
  existente: { id: string; nombre: string } | null;
  cambios: Cambio[];
  avisos: string[];
}

const palabras = (n: string): string[] => sinAcentos(n).split(' ').filter(Boolean);
// Mismo nombre aunque cambie el orden (APELLIDOS NOMBRE o NOMBRE APELLIDOS).
const claveNombre = (n: string): string => palabras(n).sort().join(' ');

export function buscarExistente(f: FilaEmpleado, existentes: EmpleadoExistente[]): { empleado: EmpleadoExistente | null; parecidos: EmpleadoExistente[] } {
  if (f.cedula) {
    const porCedula = existentes.find((e) => e.cedula && soloDigitos(e.cedula) === f.cedula);
    if (porCedula) return { empleado: porCedula, parecidos: [] };
  }
  if (f.numeroReloj) {
    const porReloj = existentes.find((e) => e.numeroReloj === f.numeroReloj);
    if (porReloj) return { empleado: porReloj, parecidos: [] };
  }
  const clave = claveNombre(f.nombre);
  const igual = existentes.filter((e) => claveNombre(e.nombre) === clave);
  if (igual.length === 1) return { empleado: igual[0], parecidos: [] };
  // Sin coincidencia clara: se avisa de quién se parece (comparten 2 o más palabras) para que alguien lo revise.
  const mias = new Set(palabras(f.nombre));
  const parecidos = existentes.filter((e) => palabras(e.nombre).filter((p) => mias.has(p)).length >= 2);
  return { empleado: null, parecidos: igual.length > 1 ? igual : parecidos };
}

const ETIQUETAS: Record<string, string> = {
  cedula: 'Cédula', numeroReloj: 'N.º de reloj', puesto: 'Puesto', departamento: 'Departamento', fechaIngreso: 'Fecha de ingreso', tipoSalario: 'Tipo de salario',
  monto: 'Monto', frecuenciaPago: 'Se paga', horasSemana: 'Horas por semana', sector: 'Sector', esDeTienda: 'De tienda',
  esConfianza: 'Puesto de confianza', marcaReloj: 'Marca en reloj', formaPago: 'Forma de pago', iban: 'IBAN', identificadorBp: 'Identificador B. Popular',
};
const sino = (b: boolean) => (b ? 'Sí' : 'No');

export function compararFila(f: FilaEmpleado, e: EmpleadoExistente): Cambio[] {
  const c: Cambio[] = [];
  const poner = (campo: string, antes: string, despues: string | null) => {
    if (despues !== null && despues !== '' && despues !== antes) c.push({ campo, etiqueta: ETIQUETAS[campo], antes: antes || '—', despues });
  };
  poner('cedula', soloDigitos(e.cedula), f.cedula);
  poner('numeroReloj', e.numeroReloj, f.numeroReloj);
  poner('puesto', e.puesto ?? '', f.puesto);
  poner('departamento', e.departamento ?? '', f.departamento);
  poner('fechaIngreso', e.fechaIngreso ?? '', f.fechaIngreso);
  poner('tipoSalario', e.tipoSalario, f.tipoSalario);
  if (f.monto !== null && Number(e.montoSalario) !== f.monto) c.push({ campo: 'monto', etiqueta: ETIQUETAS.monto, antes: String(Number(e.montoSalario)), despues: String(f.monto) });
  poner('frecuenciaPago', e.frecuenciaPago, f.frecuenciaPago);
  if (f.horasSemana !== null && Number(e.horasSemana ?? 0) !== f.horasSemana) c.push({ campo: 'horasSemana', etiqueta: ETIQUETAS.horasSemana, antes: e.horasSemana ? String(Number(e.horasSemana)) : '—', despues: String(f.horasSemana) });
  poner('sector', e.sector, f.sector);
  for (const k of ['esDeTienda', 'esConfianza', 'marcaReloj'] as const) {
    if (f[k] !== null && f[k] !== e[k]) c.push({ campo: k, etiqueta: ETIQUETAS[k], antes: sino(e[k]), despues: sino(f[k] as boolean) });
  }
  poner('formaPago', e.formaPago, f.formaPago);
  poner('iban', e.iban ?? '', f.iban);
  poner('identificadorBp', e.identificadorBp ?? '', f.identificadorBp);
  return c;
}

export function planificarImportacion(filas: FilaEmpleado[], existentes: EmpleadoExistente[]): ResultadoFila[] {
  const usadosCedula = new Map<string, number>();
  const usadosReloj = new Map<string, number>();
  return filas.map((f) => {
    const errores = [...f.errores];
    const avisos: string[] = [];
    if (f.cedula) {
      if (usadosCedula.has(f.cedula)) errores.push(`La cédula está repetida en la fila ${usadosCedula.get(f.cedula)}.`);
      usadosCedula.set(f.cedula, f.fila);
    }
    if (f.numeroReloj) {
      if (usadosReloj.has(f.numeroReloj)) errores.push(`El número de reloj está repetido en la fila ${usadosReloj.get(f.numeroReloj)}.`);
      usadosReloj.set(f.numeroReloj, f.fila);
    }
    const { empleado, parecidos } = buscarExistente(f, existentes);
    if (!empleado) {
      if (f.tipoSalario === null) errores.push('Falta el tipo de salario (por hora, semanal o mensual).');
      if (f.monto === null) errores.push('Falta el monto.');
      if (f.frecuenciaPago === null) errores.push('Falta cómo se paga (semanal, quincenal o mensual).');
      if (f.tipoSalario === 'semanal' && f.frecuenciaPago && f.frecuenciaPago !== 'semanal') errores.push('Un salario semanal solo se puede pagar por semana.');
      if (f.numeroReloj && existentes.some((e) => e.numeroReloj === f.numeroReloj)) errores.push('Ese número de reloj ya lo tiene otro empleado.');
      if (parecidos.length) avisos.push(`Se creará como NUEVO, pero se parece a: ${parecidos.map((p) => p.nombre).join(', ')}. Si es la misma persona, ponga su cédula en la ficha existente y vuelva a revisar.`);
      if (!f.numeroReloj) avisos.push('Sin número de reloj: se le pone uno provisional que se reemplaza al importar el archivo del reloj y vincularlo.');
      return { fila: f, accion: errores.length ? 'error' : 'crear', existente: null, cambios: [], avisos };
    }
    const cambios = compararFila(f, empleado);
    if (f.numeroReloj && f.numeroReloj !== empleado.numeroReloj && existentes.some((e) => e.id !== empleado.id && e.numeroReloj === f.numeroReloj)) {
      errores.push('Ese número de reloj ya lo tiene otro empleado.');
    }
    return { fila: f, accion: errores.length ? 'error' : cambios.length ? 'actualizar' : 'sin_cambios', existente: { id: empleado.id, nombre: empleado.nombre }, cambios, avisos };
  });
}

// ---------------------------------------------------------------------------
// Quién está en el sistema pero NO en el archivo
// ---------------------------------------------------------------------------

export interface Ausente {
  id: string;
  nombre: string;
  cedula: string | null;
  puesto: string | null;
  // A quién del archivo se parece (comparten 2 o más palabras del nombre): puede ser la misma persona con otro nombre.
  parecidoA: string[];
}

// Empleados activos que ninguna fila del archivo reconoció.
export function ausentesDelArchivo(plan: ResultadoFila[], existentes: Array<EmpleadoExistente & { activo: boolean; fechaCese: string | null }>): Ausente[] {
  const vistos = new Set(plan.filter((x) => x.existente).map((x) => x.existente!.id));
  return existentes
    .filter((e) => e.activo && !e.fechaCese && !vistos.has(e.id))
    .map((e) => {
      const suyas = new Set(palabras(e.nombre));
      const parecidoA = plan
        .filter((x) => !x.existente && palabras(x.fila.nombre).filter((p) => suyas.has(p)).length >= 2)
        .map((x) => x.fila.nombre);
      return { id: e.id, nombre: e.nombre, cedula: e.cedula, puesto: e.puesto, parecidoA };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
