import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FacturacionService } from '../facturacion/facturacion.service.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { Rol } from '../common/enums/rol.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

export interface Pendiente {
  clave: string;
  titulo: string;
  detalle: string;
  cantidad: number;
  gravedad: 'urgente' | 'atencion' | 'info';
  // Pantalla del panel donde se resuelve (nombre de ruta) y, si hace falta, la pestaña que debe quedar abierta.
  ruta: string;
  pestana?: { clave: string; valor: string };
}

const colones = (n: number): string => `₡${Math.round(n).toLocaleString('es-CR').replace(/,/g, ' ')}`;

// «Para hacer hoy»: lo que necesita acción de la persona, según los permisos de su perfil. Cada aviso trae a dónde ir para resolverlo.
// Solo se incluyen los que tienen algo pendiente. Una consulta que falla no tumba la bandeja: ese aviso simplemente no sale.
@Injectable()
export class PendientesService {
  private readonly logger = new Logger(PendientesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly facturacion: FacturacionService,
  ) {}

  async listar(usuario: UsuarioAutenticado): Promise<Pendiente[]> {
    const puede = (p: Permiso): boolean => usuario.rol === Rol.SISTEMA || usuario.permisos.has(p);
    const tareas: Array<Promise<Pendiente | Pendiente[] | null>> = [];
    const intentar = (clave: string, f: () => Promise<Pendiente | Pendiente[] | null>): void => {
      tareas.push(f().catch((err) => {
        this.logger.warn(`Pendiente «${clave}» no se pudo calcular: ${err instanceof Error ? err.message : err}`);
        return null;
      }));
    };

    if (puede(Permiso.PEDIDOS_VER) || puede(Permiso.POS_VER)) {
      intentar('tiendas', async () => {
        const [r] = await this.dataSource.query(
          `SELECT COUNT(*) FILTER (WHERE estado IN ('enviada','recibida'))::int AS por_revisar,
                  COUNT(*) FILTER (WHERE estado IN ('revisada','alistada'))::int AS por_enviar
           FROM pos_ordenes WHERE NOT es_prueba`,
        );
        const out: Pendiente[] = [];
        const pestana = { clave: 'cb-pedidos-pestana', valor: 'tiendas' };
        if (r.por_revisar > 0) out.push({ clave: 'tiendas-por-revisar', titulo: 'Pedidos de tiendas por revisar', detalle: 'Hay que recibirlos, revisarlos (aceptar o corregir) y fijar el costo especial.', cantidad: r.por_revisar, gravedad: 'urgente', ruta: 'admin-pedidos', pestana });
        if (r.por_enviar > 0) out.push({ clave: 'tiendas-por-enviar', titulo: 'Pedidos de tiendas por alistar y enviar', detalle: 'Ya están revisados: falta alistarlos en bodega y enviarlos a la tienda.', cantidad: r.por_enviar, gravedad: 'atencion', ruta: 'admin-pedidos', pestana });
        return out;
      });
    }

    if (puede(Permiso.FACTURACION_GESTIONAR)) {
      intentar('facturas', async () => {
        const pendientes = await this.facturacion.listarFacturas({ estado: 'pendiente' as never });
        const vencidas = pendientes.filter((f) => f.diasParaVencer !== null && f.diasParaVencer < 0);
        const proximas = pendientes.filter((f) => f.diasParaVencer !== null && f.diasParaVencer >= 0 && f.diasParaVencer <= 7);
        const out: Pendiente[] = [];
        if (vencidas.length) out.push({ clave: 'facturas-vencidas', titulo: 'Facturas vencidas por cobrar', detalle: `${colones(vencidas.reduce((a, f) => a + Number(f.saldo), 0))} sin cobrar.`, cantidad: vencidas.length, gravedad: 'urgente', ruta: 'admin-facturas' });
        if (proximas.length) out.push({ clave: 'facturas-por-vencer', titulo: 'Facturas que vencen en 7 días o menos', detalle: `${colones(proximas.reduce((a, f) => a + Number(f.saldo), 0))} por cobrar pronto.`, cantidad: proximas.length, gravedad: 'atencion', ruta: 'admin-facturas' });
        return out;
      });
      intentar('facturas-emision', async () => {
        const r = await this.facturacion.resumenEmision();
        const out: Pendiente[] = [];
        const rechazadas = r.cantidades.rechazada ?? 0;
        const sinEnviar = r.cantidades.pendiente_envio ?? 0;
        const enProceso = r.cantidades.enviada ?? 0;
        if (rechazadas) out.push({ clave: 'facturas-rechazadas', titulo: 'Facturas rechazadas por Hacienda', detalle: 'Hay que corregirlas y volver a emitirlas: no son válidas todavía.', cantidad: rechazadas, gravedad: 'urgente', ruta: 'admin-facturas' });
        // Mientras no haya conexión, todas quedan sin enviar: solo es informativo. Con conexión, es un atraso real.
        if (sinEnviar) out.push({ clave: 'facturas-sin-emitir', titulo: 'Facturas sin enviar a Hacienda', detalle: r.conexion.conectado ? 'Se generaron pero no se han enviado: revise el motivo.' : 'Hacienda todavía no está conectado: quedan listas para emitir cuando se conecte.', cantidad: sinEnviar, gravedad: r.conexion.conectado ? 'atencion' : 'info', ruta: 'admin-facturas' });
        if (enProceso) out.push({ clave: 'facturas-en-proceso', titulo: 'Facturas en proceso en Hacienda', detalle: 'Enviadas, esperando la aceptación de Hacienda.', cantidad: enProceso, gravedad: 'info', ruta: 'admin-facturas' });
        return out;
      });
      intentar('pedidos-sin-facturar', async () => {
        const [r] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM pedidos p WHERE p.estado = 'activo' AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.pedido_id = p.id)`);
        return r.n > 0 ? { clave: 'pedidos-sin-facturar', titulo: 'Pedidos de vendedores sin facturar', detalle: 'Pedidos activos que todavía no tienen su factura.', cantidad: r.n, gravedad: 'info', ruta: 'admin-pedidos' } : null;
      });
    }

    if (puede(Permiso.PLANILLA_VER)) {
      intentar('anomalias', async () => {
        const [r] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM planilla_anomalias WHERE estado = 'pendiente'`);
        return r.n > 0 ? { clave: 'anomalias-empleados', titulo: 'Anomalías de empleados por revisar', detalle: 'Almuerzos fuera de lo normal u otras anotaciones: decida si se emite carta de amonestación o se descartan.', cantidad: r.n, gravedad: 'info', ruta: 'planilla-empleados' } : null;
      });
      intentar('planilla', async () => {
        const [r] = await this.dataSource.query(
          `SELECT COUNT(*) FILTER (WHERE estado::text = 'borrador')::int AS borrador,
                  COUNT(*) FILTER (WHERE estado::text = 'aprobada' AND aprobada_en < now() - interval '3 days')::int AS sin_pagar
           FROM planilla_planillas`,
        );
        const out: Pendiente[] = [];
        if (r.sin_pagar > 0) out.push({ clave: 'planilla-sin-pagar', titulo: 'Planillas aprobadas sin marcar como pagadas', detalle: 'Aprobadas hace más de 3 días: pague o confirme el pago.', cantidad: r.sin_pagar, gravedad: 'urgente', ruta: 'planilla-planillas' });
        if (r.borrador > 0) out.push({ clave: 'planilla-borrador', titulo: 'Planillas en borrador por revisar y aprobar', detalle: 'Revise los días con problemas y apruebe.', cantidad: r.borrador, gravedad: 'atencion', ruta: 'planilla-planillas' });
        return out;
      });
    }

    if (puede(Permiso.INVENTARIO_VER)) {
      intentar('inventario-bajo', async () => {
        const [r] = await this.dataSource.query(
          `SELECT COUNT(*)::int AS n FROM stock_ubicaciones s JOIN variantes_producto v ON v.id = s.variante_id JOIN productos p ON p.id = v.producto_id
           WHERE s.stock_minimo > 0 AND s.cantidad <= s.stock_minimo AND v.activo AND NOT p.es_prueba`,
        );
        return r.n > 0 ? { clave: 'inventario-bajo', titulo: 'Productos con inventario bajo', detalle: 'Llegaron al mínimo o se agotaron en alguna ubicación.', cantidad: r.n, gravedad: 'atencion', ruta: 'admin-tienda', pestana: { clave: 'cb-tienda-pestana', valor: 'alertas' } } : null;
      });
    }

    if (puede(Permiso.POS_VER)) {
      intentar('sync-rechazada', async () => {
        const [r] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM pos_actividad WHERE tipo = 'sincronizacion_rechazada' AND fecha > now() - interval '7 days'`);
        return r.n > 0 ? { clave: 'sync-rechazada', titulo: 'Envíos de la caja que el servidor no aceptó', detalle: 'En los últimos 7 días: revise el motivo en Actividad.', cantidad: r.n, gravedad: 'urgente', ruta: 'admin-tienda', pestana: { clave: 'cb-tienda-pestana', valor: 'actividad' } } : null;
      });
    }

    if (puede(Permiso.CIERRES_GESTIONAR)) {
      intentar('meses-sin-cerrar', async () => {
        const filas = await this.dataSource.query(
          `SELECT to_char(a.fecha, 'YYYY-MM') AS mes FROM asientos_contables a
           WHERE COALESCE(a.origen_tipo, '') NOT LIKE 'cierre%' AND to_char(a.fecha, 'YYYY-MM') < to_char(now() AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM')
             AND to_char(a.fecha, 'YYYY-MM') NOT IN (SELECT periodo FROM periodos_contables_cerrados) GROUP BY 1 ORDER BY 1`,
        );
        return filas.length ? { clave: 'meses-sin-cerrar', titulo: 'Meses anteriores sin cerrar', detalle: `Cuando el contador los revise, ciérrelos (${filas.map((f: { mes: string }) => f.mes).slice(0, 3).join(', ')}${filas.length > 3 ? '…' : ''}).`, cantidad: filas.length, gravedad: 'info', ruta: 'contabilidad-cierre' } : null;
      });
    }

    const resultados = (await Promise.all(tareas)).flat().filter((x): x is Pendiente => Boolean(x));
    const orden = { urgente: 0, atencion: 1, info: 2 } as const;
    return resultados.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);
  }
}
