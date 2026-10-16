const formateadorColones = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
});

export function formatearColones(monto) {
  return formateadorColones.format(Number(monto));
}

export function formatearFecha(fechaIso) {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function fechaHoyISO() {
  // Fecha local del navegador (toISOString daría la fecha en UTC: después
  // de las 6 p. m. en Costa Rica ya sería "mañana").
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Para timestamps completos (ej. creadoEn de un log) — a diferencia de
// formatearFecha, que espera solo "YYYY-MM-DD" y no un ISO con hora.
export function formatearFechaHora(fechaIso) {
  const fecha = new Date(fechaIso);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const hora = fecha.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  return `${dia}/${mes}/${fecha.getFullYear()} ${hora}`;
}

// pedido.cliente es null mientras el cliente está pendiente de registro
// (ver clientePendiente) — este helper centraliza el fallback para no
// repetir la misma lógica en cada pantalla que lista pedidos.
export function nombreClientePedido(pedido) {
  return pedido.cliente?.nombre ?? pedido.clientePendiente?.nombre ?? 'Cliente sin nombre';
}
