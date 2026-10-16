import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ResultadoVerificacion {
  codigo: string;
  titulo: string;
  ok: boolean;
  cantidadProblemas: number;
  // Hasta 20 filas de ejemplo de lo que no cuadra.
  ejemplos: Record<string, unknown>[];
}

interface Verificacion {
  codigo: string;
  titulo: string;
  // Devuelve una fila por cada registro que NO cumple la regla.
  sql: string;
}

// Reglas que SIEMPRE deben cumplirse entre los datos guardados. Cada consulta
// devuelve las filas que las violan: vacío = todo cuadra. Es de solo lectura.
const VERIFICACIONES: Verificacion[] = [
  {
    codigo: 'asientos-cuadrados',
    titulo: 'Cada asiento contable tiene debe = haber',
    sql: `select a.id, a.descripcion, sum(l.debe::numeric) as debe, sum(l.haber::numeric) as haber
          from asientos_contables a join lineas_asiento l on l.asiento_id = a.id
          group by a.id having sum(l.debe::numeric) <> sum(l.haber::numeric)`,
  },
  {
    codigo: 'asientos-con-lineas',
    titulo: 'Ningún asiento está vacío',
    sql: `select a.id, a.descripcion from asientos_contables a
          where not exists (select 1 from lineas_asiento l where l.asiento_id = a.id)`,
  },
  {
    codigo: 'lineas-asiento-validas',
    titulo: 'Las líneas de asiento tienen un solo lado (debe o haber), sin negativos ni ceros',
    sql: `select id, asiento_id, debe, haber from lineas_asiento
          where debe::numeric < 0 or haber::numeric < 0
             or (debe::numeric > 0 and haber::numeric > 0)
             or (debe::numeric = 0 and haber::numeric = 0)`,
  },
  {
    codigo: 'balance-comprobacion',
    titulo: 'Balance de comprobación: total debe = total haber',
    sql: `select sum(debe::numeric) as debe, sum(haber::numeric) as haber from lineas_asiento
          having sum(debe::numeric) <> sum(haber::numeric)`,
  },
  {
    codigo: 'pedido-lineas',
    titulo: 'Pedidos: monto de línea = pares × precio con descuento; pares = docenas × 12',
    sql: `select id, pedido_id, pares, docenas, precio_por_par, descuento_porcentaje, monto_linea from pedido_lineas
          where monto_linea::numeric <> round(pares * round(precio_por_par::numeric * (1 - descuento_porcentaje::numeric / 100), 2), 2)
             or pares <> round(docenas::numeric * 12)`,
  },
  {
    codigo: 'pedido-totales',
    titulo: 'Pedidos: subtotal = suma de líneas; IVA = subtotal × %; total = subtotal + IVA',
    sql: `select p.id, p.numero_orden, p.subtotal, p.iva_monto, p.total from pedidos p
          where p.subtotal::numeric <> coalesce((select sum(monto_linea::numeric) from pedido_lineas where pedido_id = p.id), 0)
             or p.iva_monto::numeric <> round(p.subtotal::numeric * p.iva_porcentaje::numeric / 100, 2)
             or p.total::numeric <> p.subtotal::numeric + p.iva_monto::numeric`,
  },
  {
    codigo: 'factura-lineas',
    titulo: 'Facturas: subtotal de línea = cantidad × precio − descuento',
    sql: `select id, factura_id, subtotal from factura_lineas
          where subtotal::numeric <> round(round(cantidad::numeric * precio_unitario::numeric, 2)
                - round(round(cantidad::numeric * precio_unitario::numeric, 2) * descuento_porcentaje::numeric / 100, 2), 2)`,
  },
  {
    codigo: 'factura-manual-totales',
    titulo: 'Facturas manuales: subtotal e IVA = suma de líneas; total = subtotal + IVA',
    sql: `select f.id, f.consecutivo, f.subtotal, f.iva_monto, f.total from facturas f
          where f.origen = 'manual'
            and (f.subtotal::numeric <> coalesce((select sum(subtotal::numeric) from factura_lineas where factura_id = f.id), 0)
              or f.iva_monto::numeric <> coalesce((select sum(impuesto_monto::numeric) from factura_lineas where factura_id = f.id), 0)
              or f.total::numeric <> f.subtotal::numeric + f.iva_monto::numeric)`,
  },
  {
    codigo: 'factura-igual-pedido',
    titulo: 'Facturas de pedido: montos iguales a los del pedido',
    sql: `select f.id, f.consecutivo from facturas f join pedidos p on p.id = f.pedido_id
          where f.subtotal <> p.subtotal or f.iva_monto <> p.iva_monto or f.total <> p.total`,
  },
  {
    codigo: 'factura-nota-credito',
    titulo: 'Toda factura con nota de crédito quedó anulada (factura manual: marcada; de pedido: pedido anulado)',
    sql: `select f.id, f.consecutivo from facturas f left join pedidos p on p.id = f.pedido_id
          where exists (select 1 from notas_credito n where n.factura_id = f.id)
            and ((f.origen = 'manual' and not f.anulada) or (f.origen <> 'manual' and p.estado::text <> 'anulado'))`,
  },
  {
    codigo: 'pago-aplicaciones',
    titulo: 'Recibos de caja: total = suma de lo aplicado a facturas',
    sql: `select p.id, p.numero, p.total from pagos_recibidos p
          where p.tipo = 'factura'
            and p.total::numeric <> coalesce((select sum(monto::numeric) from pago_aplicaciones where pago_id = p.id), 0)`,
  },
  {
    codigo: 'sobrepago',
    titulo: 'Ninguna factura tiene más cobrado que su total',
    sql: `select f.id, f.consecutivo, f.total, sum(a.monto::numeric) as cobrado
          from facturas f
          join pago_aplicaciones a on a.factura_id = f.id
          join pagos_recibidos p on p.id = a.pago_id and p.estado = 'vigente'
          group by f.id having sum(a.monto::numeric) > f.total::numeric`,
  },
  {
    codigo: 'cxc-libro-vs-facturas',
    titulo: 'Cuentas por cobrar (1200) en el libro = saldo pendiente de facturas a crédito',
    sql: `with libro as (
            select coalesce(sum(l.debe::numeric - l.haber::numeric), 0) as saldo
            from lineas_asiento l join cuentas_contables c on c.id = l.cuenta_id where c.codigo = '1200'),
          facturas_credito as (
            select f.id, f.total::numeric as total from facturas f left join pedidos p on p.id = f.pedido_id
            where not f.anulada
              and not exists (select 1 from notas_credito n where n.factura_id = f.id)
              and coalesce(f.tipo_pago::text, p.tipo_pago::text) = 'credito'),
          cobrado as (
            select coalesce(sum(a.monto::numeric), 0) as monto
            from pago_aplicaciones a join pagos_recibidos pr on pr.id = a.pago_id and pr.estado = 'vigente'
            where a.factura_id in (select id from facturas_credito))
          select libro.saldo as libro, (select coalesce(sum(total), 0) from facturas_credito) - cobrado.monto as facturas
          from libro, cobrado
          where libro.saldo <> (select coalesce(sum(total), 0) from facturas_credito) - cobrado.monto`,
  },
  {
    codigo: 'inventario-stock-vs-movimientos',
    titulo: 'Inventario: existencia por bodega = suma de sus movimientos',
    sql: `select s.ubicacion_id, s.variante_id, s.cantidad,
                 coalesce((select sum(cantidad) from movimientos_inventario m where m.ubicacion_id = s.ubicacion_id and m.variante_id = s.variante_id), 0) as movimientos
          from stock_ubicaciones s
          where s.cantidad <> coalesce((select sum(cantidad) from movimientos_inventario m where m.ubicacion_id = s.ubicacion_id and m.variante_id = s.variante_id), 0)`,
  },
  {
    codigo: 'inventario-sin-negativos',
    titulo: 'Inventario: ninguna existencia negativa',
    sql: `select ubicacion_id, variante_id, cantidad from stock_ubicaciones where cantidad < 0`,
  },
  {
    codigo: 'planilla-lineas',
    titulo: 'Planilla: deducciones = CCSS + Banco Popular + renta + deudas; neto = bruto − deducciones',
    sql: `select id, empleado_nombre, bruto, total_deducciones, neto from planilla_lineas
          where total_deducciones::numeric <> sem::numeric + ivm::numeric + banco_popular::numeric + renta::numeric + deudas_descontadas::numeric
             or neto::numeric <> bruto::numeric - total_deducciones::numeric`,
  },
  {
    codigo: 'planilla-totales',
    titulo: 'Planilla: totales de la planilla = suma de sus líneas',
    sql: `select p.id, p.fecha_desde, p.total_bruto, p.total_neto from planilla_planillas p
          where p.estado <> 'borrador'
            and (p.total_bruto::numeric <> coalesce((select sum(bruto::numeric) from planilla_lineas where planilla_id = p.id), 0)
              or p.total_deducciones::numeric <> coalesce((select sum(total_deducciones::numeric) from planilla_lineas where planilla_id = p.id), 0)
              or p.total_neto::numeric <> coalesce((select sum(neto::numeric) from planilla_lineas where planilla_id = p.id), 0))`,
  },
  {
    codigo: 'asientos-numerados',
    titulo: 'Todos los asientos tienen número de asiento único',
    sql: `select numero, count(*)::int as cantidad from asientos_contables group by numero
          having numero is null or count(*) > 1`,
  },
  {
    codigo: 'periodos-cerrados',
    titulo: 'Ningún asiento se registró en un mes después de cerrarlo',
    sql: `select a.id, a.numero, a.fecha, a.descripcion from asientos_contables a
          join periodos_contables_cerrados p on to_char(a.fecha, 'YYYY-MM') = p.periodo
          where a.creado_en > p.cerrado_en and a.origen_tipo not in ('cierre_fiscal', 'cierre_fiscal_impuesto')
            and not (a.origen_tipo = 'reversa' and a.origen_id in (select id from asientos_contables where origen_tipo in ('cierre_fiscal', 'cierre_fiscal_impuesto')))`,
  },
  {
    codigo: 'cierre-fiscal-resultados-en-cero',
    titulo: 'Años con cierre fiscal: ingresos y gastos acumulados quedan en cero al 31 de diciembre',
    sql: `select cf.anio, c.codigo, c.nombre, sum(l.debe::numeric - l.haber::numeric) as saldo
          from cierres_fiscales cf
          join asientos_contables a on a.fecha <= make_date(cf.anio, 12, 31)
          join lineas_asiento l on l.asiento_id = a.id
          join cuentas_contables c on c.id = l.cuenta_id and c.tipo in ('ingreso', 'gasto')
          group by cf.anio, c.codigo, c.nombre having sum(l.debe::numeric - l.haber::numeric) <> 0`,
  },
  {
    codigo: 'planilla-asiento-aprobacion',
    titulo: 'Planilla aprobada: su asiento coincide con los totales (sueldos, cargas patronales, provisiones, salarios por pagar)',
    sql: `with ap as (
            select a.origen_id as pid, c.codigo, sum(l.debe::numeric) as debe, sum(l.haber::numeric) as haber
            from asientos_contables a
            join lineas_asiento l on l.asiento_id = a.id
            join cuentas_contables c on c.id = l.cuenta_id
            where a.origen_tipo = 'planilla' and a.descripcion not like 'Pago de planilla%'
            group by a.origen_id, c.codigo)
          select p.id, p.fecha_desde, p.fecha_hasta, p.total_bruto, p.total_neto from planilla_planillas p
          where p.estado in ('aprobada', 'pagada')
            and (coalesce((select debe from ap where pid = p.id and codigo = '5200'), 0) <> p.total_bruto::numeric
              or coalesce((select debe from ap where pid = p.id and codigo = '5210'), 0) <> p.total_cargas_patronales::numeric
              or coalesce((select debe from ap where pid = p.id and codigo = '5220'), 0) <> p.total_provisiones::numeric
              or coalesce((select haber from ap where pid = p.id and codigo = '2100'), 0) <> p.total_neto::numeric)`,
  },
  {
    codigo: 'planilla-cargas-ins',
    titulo: 'Planilla aprobada: cargas sociales por pagar (2110) + póliza INS (2140) = deducciones obreras + cargas patronales',
    sql: `with ap as (
            select a.origen_id as pid, sum(l.haber::numeric) filter (where c.codigo in ('2110', '2140')) as pasivo
            from asientos_contables a
            join lineas_asiento l on l.asiento_id = a.id
            join cuentas_contables c on c.id = l.cuenta_id
            where a.origen_tipo = 'planilla' and a.descripcion not like 'Pago de planilla%'
            group by a.origen_id)
          select p.id, p.fecha_desde, p.fecha_hasta from planilla_planillas p
          where p.estado in ('aprobada', 'pagada')
            and coalesce((select pasivo from ap where pid = p.id), 0) <>
                (select coalesce(sum(l.sem::numeric + l.ivm::numeric + l.banco_popular::numeric + l.cargas_patronales::numeric), 0)
                 from planilla_lineas l where l.planilla_id = p.id)`,
  },
  {
    codigo: 'planilla-asiento-pago',
    titulo: 'Planilla pagada: el asiento de pago (vigente) es igual al neto de la planilla',
    sql: `select p.id, p.fecha_desde, p.fecha_hasta, p.total_neto from planilla_planillas p
          where p.estado = 'pagada'
            and p.total_neto::numeric <> coalesce((
              select sum(l.debe::numeric) from asientos_contables a
              join lineas_asiento l on l.asiento_id = a.id
              join cuentas_contables c on c.id = l.cuenta_id and c.codigo = '2100'
              where a.origen_id = p.id
                and (a.origen_tipo = 'planilla_pago' or (a.origen_tipo = 'planilla' and a.descripcion like 'Pago de planilla%'))
                and not exists (select 1 from asientos_contables r where r.origen_tipo = 'reversa' and r.origen_id = a.id)), 0)`,
  },
  {
    codigo: 'planilla-anulada-reversada',
    titulo: 'Planilla anulada: todos sus asientos están reversados',
    sql: `select p.id, p.fecha_desde, p.fecha_hasta from planilla_planillas p
          where p.estado = 'anulada'
            and exists (select 1 from asientos_contables a
                        where a.origen_id = p.id and a.origen_tipo in ('planilla', 'planilla_pago')
                          and not exists (select 1 from asientos_contables r where r.origen_tipo = 'reversa' and r.origen_id = a.id))`,
  },
  {
    codigo: 'cxc-empleados',
    titulo: 'Cuentas por cobrar a empleados (1250) en el libro = saldo de las deudas de empleados',
    sql: `with libro as (
            select coalesce(sum(l.debe::numeric - l.haber::numeric), 0) as saldo
            from lineas_asiento l join cuentas_contables c on c.id = l.cuenta_id where c.codigo = '1250')
          select libro.saldo as libro, (select coalesce(sum(saldo::numeric), 0) from planilla_deudas) as deudas
          from libro where libro.saldo <> (select coalesce(sum(saldo::numeric), 0) from planilla_deudas)`,
  },
  {
    codigo: 'planilla-pasivos-sin-negativos',
    titulo: 'Pasivos de planilla (salarios, cargas, renta, provisiones) sin saldo negativo',
    sql: `select c.codigo, c.nombre, sum(l.haber::numeric - l.debe::numeric) as saldo
          from lineas_asiento l join cuentas_contables c on c.id = l.cuenta_id
          where c.codigo in ('2100', '2110', '2120', '2130', '2140')
          group by c.codigo, c.nombre having sum(l.haber::numeric - l.debe::numeric) < 0`,
  },
];

@Injectable()
export class IntegridadService {
  constructor(private readonly dataSource: DataSource) {}

  async verificar(): Promise<{ ok: boolean; verificadoEn: string; resultados: ResultadoVerificacion[] }> {
    const resultados: ResultadoVerificacion[] = [];
    for (const v of VERIFICACIONES) {
      const filas: Record<string, unknown>[] = await this.dataSource.query(v.sql);
      resultados.push({
        codigo: v.codigo,
        titulo: v.titulo,
        ok: filas.length === 0,
        cantidadProblemas: filas.length,
        ejemplos: filas.slice(0, 20),
      });
    }
    return { ok: resultados.every((r) => r.ok), verificadoEn: new Date().toISOString(), resultados };
  }
}
