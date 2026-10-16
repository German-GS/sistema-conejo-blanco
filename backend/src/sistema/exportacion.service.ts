import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';

// Columnas que nunca salen en una exportación (claves y secretos).
const OCULTAS = new Set(['password_hash', 'totp_secreto']);
// Tablas que no se exportan: registros técnicos que tienen su propia descarga.
const EXCLUIDAS = new Set(['registro_actividad', 'configuracion_sistema']);

@Injectable()
export class ExportacionService {
  constructor(private readonly dataSource: DataSource) {}

  // Copia legible de todos los datos del negocio: una hoja por tabla.
  async exportarTodo(): Promise<Buffer> {
    const tablas: Array<{ table_name: string }> = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const resumen = libro.addWorksheet('Resumen');
    resumen.addRow([`Exportación de datos — ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`]).font = { bold: true, size: 13 };
    resumen.addRow([]);
    resumen.addRow(['Tabla', 'Filas']).font = { bold: true };
    for (const { table_name } of tablas) {
      if (EXCLUIDAS.has(table_name)) continue;
      const columnas: Array<{ column_name: string }> = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table_name],
      );
      const visibles = columnas.map((c) => c.column_name).filter((c) => !OCULTAS.has(c));
      if (visibles.length === 0) continue;
      const filas: Array<Record<string, unknown>> = await this.dataSource.query(`SELECT ${visibles.map((c) => `"${c}"`).join(', ')} FROM "${table_name}"`);
      resumen.addRow([table_name, filas.length]);
      const hoja = libro.addWorksheet(table_name.slice(0, 31));
      hoja.addRow(visibles).font = { bold: true };
      for (const fila of filas) {
        hoja.addRow(
          visibles.map((c) => {
            const v = fila[c];
            if (v instanceof Date) return v.toISOString();
            if (v !== null && typeof v === 'object') return JSON.stringify(v);
            return v ?? '';
          }),
        );
      }
      hoja.views = [{ state: 'frozen', ySplit: 1 }];
    }
    resumen.getColumn(1).width = 40;
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
