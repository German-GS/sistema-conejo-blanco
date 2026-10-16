// Agrupa las rutas del sistema en áreas para poder filtrar y descargar los registros por zona.
export type AreaActividad = 'accesos' | 'administrativa' | 'ventas' | 'inventario' | 'sistema' | 'otros';

export function areaDeRuta(ruta: string): AreaActividad {
  const p = ruta.split('?')[0].toLowerCase();
  if (p.startsWith('/auth') || p.startsWith('/usuarios')) return 'accesos';
  if (/^\/(planilla|contabilidad|configuracion|pagos|cuentas-bancarias|facturas|facturacion|notas-credito)/.test(p)) return 'administrativa';
  if (/^\/(pedidos|clientes|catalogo)/.test(p)) return 'ventas';
  if (/^\/(inventario|traspasos|ubicaciones)/.test(p)) return 'inventario';
  if (p.startsWith('/sistema')) return 'sistema';
  return 'otros';
}

const CLAVE_SENSIBLE = /pass|clave|token|secret|hash|ticket|codigo|otp|totp/i;

// Resumen seguro de lo que mandó el cliente: nunca guarda claves/códigos, recorta textos
// largos y limita el tamaño para que la bitácora no crezca sin control.
export function resumirCuerpo(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return valor.length > 120 ? `${valor.slice(0, 120)}…` : valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (Array.isArray(valor)) {
    return profundidad >= 2 ? `[${valor.length} elementos]` : valor.slice(0, 5).map((v) => resumirCuerpo(v, profundidad + 1)).concat(valor.length > 5 ? [`… y ${valor.length - 5} más`] : []);
  }
  if (typeof valor === 'object') {
    if (profundidad >= 3) return '{…}';
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>).slice(0, 30)) {
      salida[k] = CLAVE_SENSIBLE.test(k) ? '***' : resumirCuerpo(v, profundidad + 1);
    }
    return salida;
  }
  return String(valor);
}

// Qué lecturas (GET) vale la pena registrar: datos sensibles y descargas. El resto de
// lecturas se registra solo si fallaron.
export function esLecturaSensible(ruta: string): boolean {
  const p = ruta.split('?')[0].toLowerCase();
  return (
    /^\/(planilla|contabilidad|configuracion|usuarios|pagos|cuentas-bancarias|facturas|facturacion|notas-credito)/.test(p) ||
    /\/(excel|pdf|txt|libro|colillas|exportar|justificantes)/.test(p)
  );
}
