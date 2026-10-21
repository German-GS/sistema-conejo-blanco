// Exportar a CSV desde el navegador (sirve sin internet). Separador «;» y decimales con coma: así Excel en español lo abre en columnas.
const celda = (v) => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
  // Evita que Excel interprete texto como fórmula.
  if (typeof v === 'string' && /^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columnas: [['Encabezado', (fila) => valor], ...]
export function armarCsv(columnas, filas) {
  const lineas = [columnas.map((c) => celda(c[0])).join(';'), ...filas.map((f) => columnas.map((c) => celda(c[1](f))).join(';'))];
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

export function descargarCsv(nombre, columnas, filas) {
  const blob = new Blob([armarCsv(columnas, filas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.endsWith('.csv') ? nombre : `${nombre}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fechaArchivo = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
