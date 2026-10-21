import { redondear } from '../common/utils/dinero.util.js';

export interface LineaTraslado {
  enviada: number; // pares que salieron de bodega
  recibida: number; // pares que la tienda verificó y aceptó
  especial: number; // costo especial por par con que entran a la tienda
  normal: number; // costo normal por par (el del producto)
}

export interface LineaAsientoTraslado {
  codigoCuenta: string;
  debe?: number;
  haber?: number;
}

// Asiento del traslado de bodega a tienda cuando la tienda acepta la mercadería:
//   Debe  Inventario de Tiendas      lo recibido a costo especial
//   Debe  Pérdida por mermas         lo que no llegó (enviado − recibido) a costo normal
//   Debe/Haber Diferencia de costo   (costo normal − costo especial) de lo recibido
//   Haber Inventario de Mercaderías  lo que salió de bodega, a costo normal
export function asientoTraslado(lineas: LineaTraslado[], cuentas: { tiendas: string; bodega: string; merma: string; diferencia: string }) {
  let tienda = 0;
  let bodegaRecibido = 0;
  let merma = 0;
  for (const l of lineas) {
    if (l.enviada <= 0) continue;
    tienda += redondear(l.recibida * l.especial);
    bodegaRecibido += redondear(l.recibida * l.normal);
    merma += redondear((l.enviada - l.recibida) * l.normal);
  }
  tienda = redondear(tienda);
  bodegaRecibido = redondear(bodegaRecibido);
  merma = redondear(merma);
  const diferencia = redondear(bodegaRecibido - tienda); // > 0: el costo especial es menor que el normal
  const asiento: LineaAsientoTraslado[] = [
    { codigoCuenta: cuentas.tiendas, debe: tienda },
    ...(merma > 0 ? [{ codigoCuenta: cuentas.merma, debe: merma }] : []),
    ...(diferencia > 0 ? [{ codigoCuenta: cuentas.diferencia, debe: diferencia }] : diferencia < 0 ? [{ codigoCuenta: cuentas.diferencia, haber: -diferencia }] : []),
    { codigoCuenta: cuentas.bodega, haber: redondear(bodegaRecibido + merma) },
  ].filter((l) => !('debe' in l) || (l.debe ?? 0) > 0);
  return { tienda, bodegaRecibido, merma, diferencia, asiento, vacio: tienda <= 0 && bodegaRecibido <= 0 && merma <= 0 };
}
