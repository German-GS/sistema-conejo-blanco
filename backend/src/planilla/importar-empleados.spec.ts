import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ausentesDelArchivo, buscarExistente, leerEmpleadosExcel, planificarImportacion, type EmpleadoExistente, type FilaEmpleado } from './importar-empleados.js';

async function excel(filas: unknown[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Empleados');
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const ENC = ['Nombre', 'Cédula', 'Puesto', 'Fecha de ingreso', 'Tipo de salario', 'Monto', 'Se paga', 'Es de tienda', 'Puesto de confianza', 'Forma de pago', 'IBAN'];
const existente = (extra: Partial<EmpleadoExistente> = {}): EmpleadoExistente => ({
  id: 'e1', numeroReloj: '12', nombre: 'Mario Salas Vega', cedula: '1-1111-1111', puesto: null, fechaIngreso: null, tipoSalario: 'por_hora', montoSalario: '2200.00',
  frecuenciaPago: 'semanal', horasSemana: null, sector: 'industria', esDeTienda: false, esConfianza: false, marcaReloj: true, formaPago: 'banco_popular', iban: null, identificadorBp: null, ...extra,
});

describe('leerEmpleadosExcel', () => {
  it('lee encabezados con acentos y mayúsculas, números y sí/no', async () => {
    const filas = await leerEmpleadosExcel(
      await excel([['Planilla de ejemplo'], ENC, ['Salas V. Mario', '1-1111-1111', 'Oficina', '1995-02-07', 'Por hora', 2300, 'Semanal', 'no', 'SÍ', 'Banco Popular', 'CR05 0152 0200 1026 2840 66']]),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ nombre: 'Salas V. Mario', cedula: '111111111', tipoSalario: 'por_hora', monto: 2300, frecuenciaPago: 'semanal', esDeTienda: false, esConfianza: true, formaPago: 'banco_popular', fechaIngreso: '1995-02-07' });
    expect(filas[0].errores).toEqual([]);
  });

  it('reporta datos inválidos en la fila, no los inventa', async () => {
    const [f] = await leerEmpleadosExcel(await excel([ENC, ['Fulano', '', '', 'ayer', 'raro', 'abc', 'cada rato', '', '', '', 'CR12']]));
    expect(f.errores.join(' ')).toMatch(/tipo de salario/);
    expect(f.errores.join(' ')).toMatch(/monto/i);
    expect(f.errores.join(' ')).toMatch(/Se paga/);
    expect(f.errores.join(' ')).toMatch(/IBAN/);
    expect(f.errores.join(' ')).toMatch(/fecha/);
  });

  it('sin columna Nombre avisa con claridad', async () => {
    await expect(leerEmpleadosExcel(await excel([['A', 'B'], [1, 2]]))).rejects.toThrow(/Nombre/);
  });
});

describe('planificarImportacion', () => {
  const fila = (extra: Partial<FilaEmpleado> = {}): FilaEmpleado => ({
    fila: 2, nombre: 'Salas V. Mario', cedula: '111111111', numeroReloj: null, puesto: null, departamento: null, fechaIngreso: null, tipoSalario: 'por_hora', monto: 2300, frecuenciaPago: 'semanal',
    horasSemana: null, sector: null, esDeTienda: null, esConfianza: null, marcaReloj: null, formaPago: null, iban: null, identificadorBp: null, errores: [], ...extra,
  });

  it('reconoce al mismo empleado por cédula y dice qué cambia', () => {
    const [r] = planificarImportacion([fila()], [existente()]);
    expect(r.accion).toBe('actualizar');
    expect(r.cambios).toEqual([{ campo: 'monto', etiqueta: 'Monto', antes: '2200', despues: '2300' }]);
  });

  it('sin diferencias no toca nada', () => {
    const [r] = planificarImportacion([fila({ monto: 2200 })], [existente()]);
    expect(r.accion).toBe('sin_cambios');
  });

  it('un campo vacío en el Excel nunca borra lo que ya tiene el sistema', () => {
    const [r] = planificarImportacion([fila({ monto: 2200, cedula: null, nombre: 'Mario Salas Vega', iban: null })], [existente({ iban: 'CR05015202001026284066' })]);
    expect(r.accion).toBe('sin_cambios');
  });

  it('el mismo nombre en otro orden también se reconoce', () => {
    const { empleado } = buscarExistente(fila({ cedula: null, nombre: 'Mario Vega Salas' }), [existente()]);
    expect(empleado?.id).toBe('e1');
  });

  it('un empleado nuevo necesita tipo, monto y frecuencia; avisa si se parece a otro', () => {
    const [r] = planificarImportacion([fila({ nombre: 'Mario Rojas Salas', cedula: '111', tipoSalario: null, monto: null, frecuenciaPago: null })], [existente()]);
    expect(r.accion).toBe('error');
    expect(r.fila.errores).toEqual([]);
    const [ok] = planificarImportacion([fila({ nombre: 'Mario Rojas Salas', cedula: '111' })], [existente()]);
    expect(ok.accion).toBe('crear');
    expect(ok.avisos.join(' ')).toMatch(/se parece a: Mario Salas Vega/);
    expect(ok.avisos.join(' ')).toMatch(/provisional/);
  });

  it('detecta cédulas repetidas en el mismo archivo', () => {
    const r = planificarImportacion([fila({ cedula: '999', nombre: 'Uno Uno' }), fila({ fila: 3, cedula: '999', nombre: 'Dos Dos' })], []);
    expect(r[1].accion).toBe('error');
    expect(r[1].fila.errores).toEqual([]);
  });

  it('marca los permisos de tienda y confianza como cambios visibles', () => {
    const [r] = planificarImportacion([fila({ monto: 2200, esConfianza: true, esDeTienda: true })], [existente()]);
    expect(r.cambios.map((c) => c.campo)).toEqual(['esDeTienda', 'esConfianza']);
  });
});

describe('ausentesDelArchivo', () => {
  const base = (id: string, nombre: string, extra = {}) => ({ ...existente({ id, nombre, cedula: null }), activo: true, fechaCese: null, ...extra });
  const fila = (nombre: string): FilaEmpleado => ({
    fila: 2, nombre, cedula: null, numeroReloj: null, puesto: null, departamento: null, fechaIngreso: null, tipoSalario: 'por_hora', monto: 1, frecuenciaPago: 'semanal', horasSemana: null,
    sector: null, esDeTienda: null, esConfianza: null, marcaReloj: null, formaPago: null, iban: null, identificadorBp: null, errores: [],
  });

  it('lista solo a los activos que el archivo no reconoció, y no a los ya cesados', () => {
    const existentes = [base('a', 'Ana Lopez Mora'), base('b', 'Beto Rojas Vega'), base('c', 'Cesada Ya Antes', { activo: false, fechaCese: '2026-01-01' })];
    const plan = planificarImportacion([fila('Ana Lopez Mora')], existentes);
    const ausentes = ausentesDelArchivo(plan, existentes);
    expect(ausentes.map((a) => a.nombre)).toEqual(['Beto Rojas Vega']);
  });

  it('avisa si el ausente se parece a alguien nuevo del archivo (posible mismo empleado con otro nombre)', () => {
    const existentes = [base('b', 'Luis Pardo')];
    const plan = planificarImportacion([fila('Luis Pardo Mora')], existentes);
    expect(plan[0].accion).toBe('crear');
    expect(ausentesDelArchivo(plan, existentes)[0].parecidoA).toEqual(['Luis Pardo Mora']);
  });
});
