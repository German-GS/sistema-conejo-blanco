import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ESTADO_ORDEN_TIENDA as E, OrdenTienda } from './orden-tienda.entity.js';
import { OrdenTiendaLinea } from './orden-tienda-linea.entity.js';
import { OrdenTiendaEvento } from './orden-tienda-evento.entity.js';
import type { EstadoOrdenDto, PosOrdenDto, RecibirTiendaDto, RevisarOrdenDto } from './dto/pos.dto.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { StockUbicacion } from '../inventario/stock-ubicacion.entity.js';
import { Rol } from '../common/enums/rol.enum.js';
import { TraspasosService } from '../traspasos/traspasos.service.js';
import { CUENTA, ContabilidadService } from '../contabilidad/contabilidad.service.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import { asientoTraslado, type LineaTraslado } from './traslado.util.js';

const ZONA = 'America/Costa_Rica';
const REFERENCIA = 'pos_orden';
export const numeroOrdenTexto = (codigoTienda: string, numero: number): string => `OR-${codigoTienda}-${String(numero).padStart(4, '0')}`;

export const ETIQUETA_ESTADO: Record<string, string> = {
  enviada: 'Enviado',
  recibida: 'Recibido por la administración',
  revisada: 'Revisado',
  alistada: 'Alistado en bodega',
  en_camino: 'Enviado a la tienda',
  entregada: 'Recibido y aceptado por la tienda',
  rechazada: 'Rechazado',
  cancelada: 'Cancelado',
};

export interface ResultadoOrdenSync {
  id: string;
  estado: 'ok' | 'duplicada' | 'error';
  numero?: number;
  mensaje?: string;
}

@Injectable()
export class OrdenesTiendaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly traspasos: TraspasosService,
    private readonly contabilidad: ContabilidadService,
  ) {}

  // ------------------------------------------------------------------ Seguimiento

  private async nombreUsuario(manager: EntityManager, usuarioId: string): Promise<string> {
    const u = await manager.findOne(Usuario, { where: { id: usuarioId }, select: { id: true, nombre: true } });
    return u?.nombre ?? '';
  }

  private async evento(manager: EntityManager, ordenId: string, estado: string, usuarioId: string | null, nota?: string | null): Promise<void> {
    await manager.save(OrdenTiendaEvento, manager.create(OrdenTiendaEvento, { ordenId, estado, nota: nota?.trim() || null, usuarioId, usuarioNombre: usuarioId ? await this.nombreUsuario(manager, usuarioId) : null }));
  }

  private async cargar(manager: EntityManager, id: string): Promise<OrdenTienda> {
    const o = await manager.findOne(OrdenTienda, { where: { id }, relations: { lineas: true, ubicacion: true } });
    if (!o) throw new NotFoundException('El pedido no existe.');
    return o;
  }

  // ------------------------------------------------------------------ Desde la terminal

  async guardar(tienda: Ubicacion, usuarioId: string, o: PosOrdenDto): Promise<ResultadoOrdenSync> {
    return this.dataSource.transaction(async (manager) => {
      const ya = await manager.findOne(OrdenTienda, { where: { id: o.id } });
      if (ya) return { id: o.id, estado: 'duplicada' as const, numero: ya.numero };
      const variantes = await manager.find(VarianteProducto, { where: { id: In(o.lineas.map((l) => l.varianteId)) }, relations: { producto: true } });
      const porId = new Map(variantes.map((v) => [v.id, v]));
      for (const l of o.lineas) if (!porId.has(l.varianteId)) throw new BadRequestException('Un producto del pedido ya no existe en el catálogo.');
      const pruebas = variantes.filter((v) => v.producto.esPrueba).length;
      if (pruebas > 0 && pruebas < variantes.length) throw new BadRequestException('No se pueden mezclar productos de prueba con productos reales en el mismo pedido.');
      let numero = o.numero;
      if (await manager.exists(OrdenTienda, { where: { ubicacionId: tienda.id, numero } })) {
        const [{ n }] = await manager.query('SELECT COALESCE(MAX(numero), 0)::int + 1 AS n FROM pos_ordenes WHERE ubicacion_id = $1', [tienda.id]);
        numero = n;
      }
      await manager.save(
        OrdenTienda,
        manager.create(OrdenTienda, {
          id: o.id,
          ubicacionId: tienda.id,
          numero,
          solicitanteId: usuarioId,
          fecha: new Date(o.fecha),
          urgente: Boolean(o.urgente),
          notas: o.notas?.trim() || null,
          estado: E.ENVIADA,
          esPrueba: pruebas > 0,
          creadaSinConexion: Boolean(o.sinConexion),
          lineas: o.lineas.map((l) => {
            const v = porId.get(l.varianteId)!;
            return manager.create(OrdenTiendaLinea, { varianteId: v.id, codigo: v.producto.codigo, descripcion: v.producto.nombre.slice(0, 200), color: v.color, cantidad: l.cantidad, stockTienda: l.stockTienda, minimo: l.minimo, sugerida: l.sugerida });
          }),
        }),
      );
      await manager.save(OrdenTiendaEvento, manager.create(OrdenTiendaEvento, { ordenId: o.id, estado: E.ENVIADA, usuarioId, usuarioNombre: await this.nombreUsuario(manager, usuarioId), nota: o.notas?.trim() || null, fecha: new Date(o.fecha) }));
      return { id: o.id, estado: 'ok' as const, numero };
    });
  }

  // Los pedidos recientes de la tienda con su seguimiento, para que la terminal los muestre (también sin internet).
  // Lo que se le va a enviar sale de lo revisado; el costo especial nunca se manda a la tienda.
  async recientes(ubicacionId: string) {
    await this.sincronizarEstados();
    const ordenes = await this.dataSource.getRepository(OrdenTienda).find({ where: { ubicacionId }, relations: { lineas: true, eventos: true }, order: { fecha: 'DESC' }, take: 20 });
    const fmt = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'short' }).format(d);
    return ordenes.map((o) => ({
      id: o.id,
      numero: o.numero,
      fecha: fmt(o.fecha),
      estado: o.estado,
      etiqueta: ETIQUETA_ESTADO[o.estado] ?? o.estado,
      urgente: o.urgente,
      prueba: o.esPrueba,
      resolucion: o.resolucion,
      respuesta: o.respuesta,
      pares: o.lineas.reduce((a, l) => a + l.cantidad, 0),
      productos: o.lineas.length,
      puedeRecibir: o.estado === E.EN_CAMINO,
      lineas: o.lineas
        .map((l) => ({ varianteId: l.varianteId, codigo: l.codigo, color: l.color, pedido: l.cantidad, aprobada: l.cantidadAprobada, recibida: l.cantidadRecibida }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.color.localeCompare(b.color)),
      eventos: [...o.eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()).map((e) => ({ estado: e.estado, etiqueta: ETIQUETA_ESTADO[e.estado] ?? e.estado, fecha: fmt(e.fecha), usuario: e.usuarioNombre, nota: e.nota })),
    }));
  }

  // ------------------------------------------------------------------ Administración

  // Un traspaso despachado desde Bodega (sin pasar por el botón del pedido) también pone el pedido "en camino".
  private async sincronizarEstados(): Promise<void> {
    const ordenes: Array<{ id: string }> = await this.dataSource.query(
      `SELECT o.id FROM pos_ordenes o JOIN traspasos t ON t.id = o.traspaso_id WHERE o.estado IN ('revisada', 'alistada') AND t.estado::text = 'en_transito'`,
    );
    for (const o of ordenes) {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(OrdenTienda, o.id, { estado: E.EN_CAMINO });
        await this.evento(manager, o.id, E.EN_CAMINO, null, 'Despachado desde Bodega');
      });
    }
  }

  async resumen() {
    await this.sincronizarEstados();
    const [r] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE estado IN ('enviada', 'recibida'))::int AS por_revisar,
              COUNT(*) FILTER (WHERE estado IN ('enviada', 'recibida') AND urgente)::int AS urgentes,
              COUNT(*) FILTER (WHERE estado IN ('revisada', 'alistada'))::int AS en_proceso,
              COUNT(*) FILTER (WHERE estado = 'en_camino')::int AS en_camino FROM pos_ordenes WHERE NOT es_prueba`,
    );
    return { pendientes: r.por_revisar, urgentes: r.urgentes, enProceso: r.en_proceso, enCamino: r.en_camino };
  }

  async listar(f: { estado?: string; ubicacionId?: string }) {
    await this.sincronizarEstados();
    const grupo = f.estado === 'abiertos' ? ['enviada', 'recibida', 'revisada', 'alistada', 'en_camino'] : f.estado ? [f.estado] : null;
    const filas: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT o.id, o.numero, u.codigo AS "tiendaCodigo", u.nombre AS tienda, to_char(o.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD HH24:MI') AS fecha,
              us.nombre AS solicitante, o.estado, o.resolucion, o.urgente, o.notas, o.respuesta, o.creada_sin_conexion AS "sinConexion", o.es_prueba AS prueba,
              (SELECT COALESCE(SUM(l.cantidad), 0)::int FROM pos_orden_lineas l WHERE l.orden_id = o.id) AS pares,
              (SELECT COUNT(*)::int FROM pos_orden_lineas l WHERE l.orden_id = o.id) AS productos,
              t.numero_traspaso AS "numeroTraspaso"
       FROM pos_ordenes o JOIN ubicaciones u ON u.id = o.ubicacion_id JOIN usuarios us ON us.id = o.solicitante_id LEFT JOIN traspasos t ON t.id = o.traspaso_id
       WHERE ($1::text[] IS NULL OR o.estado = ANY($1::text[])) AND ($2::uuid IS NULL OR o.ubicacion_id = $2::uuid)
       ORDER BY (o.estado IN ('enviada', 'recibida')) DESC, o.urgente DESC, o.fecha DESC LIMIT 300`,
      [grupo, f.ubicacionId || null],
    );
    return filas.map((x) => ({ ...x, numeroTexto: numeroOrdenTexto(String(x.tiendaCodigo), Number(x.numero)), etiqueta: ETIQUETA_ESTADO[String(x.estado)] ?? x.estado }));
  }

  // Detalle con la existencia ACTUAL de tienda y bodega y el costo que se usó la última vez, para revisar con datos.
  async detalle(id: string) {
    await this.sincronizarEstados();
    const orden = await this.dataSource.getRepository(OrdenTienda).findOne({ where: { id }, relations: { lineas: true, ubicacion: true, solicitante: true, eventos: true } });
    if (!orden) throw new NotFoundException('El pedido no existe.');
    const ids = orden.lineas.map((l) => l.varianteId);
    const datos: Array<{ varianteId: string; tienda: number; bodega: number; costoNormal: string | null; costoTienda: string | null; ultimoCosto: string | null }> = await this.dataSource.query(
      `SELECT v.id AS "varianteId",
              COALESCE((SELECT SUM(s.cantidad) FROM stock_ubicaciones s WHERE s.variante_id = v.id AND s.ubicacion_id = $2), 0)::int AS tienda,
              COALESCE((SELECT SUM(s.cantidad) FROM stock_ubicaciones s JOIN ubicaciones ub ON ub.id = s.ubicacion_id WHERE s.variante_id = v.id AND ub.tipo = 'bodega_distribucion' AND ub.activa), 0)::int AS bodega,
              v.costo AS "costoNormal",
              (SELECT s.costo_promedio FROM stock_ubicaciones s WHERE s.variante_id = v.id AND s.ubicacion_id = $2) AS "costoTienda",
              (SELECT l.costo_tienda FROM pos_orden_lineas l JOIN pos_ordenes o2 ON o2.id = l.orden_id
               WHERE l.variante_id = v.id AND o2.ubicacion_id = $2 AND l.costo_tienda IS NOT NULL AND o2.id <> $3 ORDER BY o2.fecha DESC LIMIT 1) AS "ultimoCosto"
       FROM variantes_producto v WHERE v.id = ANY($1::uuid[])`,
      [ids, orden.ubicacionId, orden.id],
    );
    const porId = new Map(datos.map((s) => [s.varianteId, s]));
    const [traspaso] = orden.traspasoId ? await this.dataSource.query('SELECT numero_traspaso AS numero, estado::text AS estado FROM traspasos WHERE id = $1', [orden.traspasoId]) : [null];
    const [asiento] = await this.dataSource.query(`SELECT numero FROM asientos_contables WHERE origen_tipo = $1 AND origen_id = $2 ORDER BY numero LIMIT 1`, [REFERENCIA, orden.id]);
    const bodegas: Array<{ id: string; nombre: string }> = await this.dataSource.query(`SELECT id, nombre FROM ubicaciones WHERE tipo = 'bodega_distribucion' AND activa ORDER BY nombre`);
    const fmt = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'short' }).format(d);
    return {
      id: orden.id,
      numeroTexto: numeroOrdenTexto(orden.ubicacion.codigo, orden.numero),
      tiendaId: orden.ubicacionId,
      tienda: orden.ubicacion.nombre,
      solicitante: orden.solicitante.nombre,
      fecha: orden.fecha,
      estado: orden.estado,
      etiqueta: ETIQUETA_ESTADO[orden.estado] ?? orden.estado,
      resolucion: orden.resolucion,
      urgente: orden.urgente,
      notas: orden.notas,
      respuesta: orden.respuesta,
      prueba: orden.esPrueba,
      sinConexion: orden.creadaSinConexion,
      traspaso: traspaso ?? null,
      asiento: asiento?.numero ?? null,
      bodegas,
      eventos: [...orden.eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()).map((e) => ({ estado: e.estado, etiqueta: ETIQUETA_ESTADO[e.estado] ?? e.estado, fecha: fmt(e.fecha), usuario: e.usuarioNombre, nota: e.nota })),
      lineas: orden.lineas
        .map((l) => {
          const d = porId.get(l.varianteId);
          return {
            varianteId: l.varianteId, codigo: l.codigo, descripcion: l.descripcion, color: l.color, cantidad: l.cantidad, stockPedido: l.stockTienda, minimo: l.minimo, sugerida: l.sugerida,
            cantidadAprobada: l.cantidadAprobada, cantidadRecibida: l.cantidadRecibida, costoTienda: l.costoTienda,
            stockTiendaAhora: d?.tienda ?? 0, stockBodega: d?.bodega ?? 0, costoNormal: d?.costoNormal ?? null,
            // Para precargar el costo especial: el de la tienda hoy o el del último envío.
            costoSugerido: d?.costoTienda ?? d?.ultimoCosto ?? null,
          };
        })
        .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.color.localeCompare(b.color)),
    };
  }

  // 1) La administración confirma que vio el pedido.
  async recibir(id: string, nota: string | undefined, usuarioId: string) {
    await this.dataSource.transaction(async (manager) => {
      const o = await this.cargar(manager, id);
      if (o.estado !== E.ENVIADA) throw new BadRequestException('Ese pedido ya fue recibido.');
      await manager.update(OrdenTienda, id, { estado: E.RECIBIDA });
      await this.evento(manager, id, E.RECIBIDA, usuarioId, nota);
    });
    return { ok: true };
  }

  // 2) Se revisa: aceptado tal cual o corregido (lo que hay en bodega), con la anotación y el costo especial de cada producto.
  // Deja armado el traspaso bodega → tienda (solicitado) con lo que se va a enviar.
  async revisar(id: string, dto: RevisarOrdenDto, usuarioId: string) {
    return this.dataSource.transaction(async (manager) => {
      const orden = await this.cargar(manager, id);
      if (orden.estado !== E.ENVIADA && orden.estado !== E.RECIBIDA) throw new BadRequestException('Ese pedido ya fue revisado o está cerrado.');
      const validas = new Set(orden.lineas.map((l) => l.varianteId));
      for (const l of dto.lineas) if (!validas.has(l.varianteId)) throw new BadRequestException('Hay un producto que no es parte del pedido.');
      const porVariante = new Map(dto.lineas.map((l) => [l.varianteId, l]));
      const aEnviar = orden.lineas.map((l) => ({ linea: l, cantidad: porVariante.get(l.varianteId)?.cantidad ?? 0, costo: porVariante.get(l.varianteId)?.costoTienda }));
      const conCantidad = aEnviar.filter((x) => x.cantidad > 0);
      if (!conCantidad.length) throw new BadRequestException('Indique al menos un producto con cantidad a enviar.');
      for (const x of conCantidad) if (!(x.costo && x.costo > 0)) throw new BadRequestException(`Falta el costo especial de ${x.linea.codigo} ${x.linea.color}.`);
      const igual = aEnviar.every((x) => x.cantidad === x.linea.cantidad);
      if (dto.resolucion === 'aceptada' && !igual) throw new BadRequestException('Cambió cantidades: márquelo como «corregido» y anote el motivo.');
      if (dto.resolucion === 'corregida' && igual) throw new BadRequestException('No cambió ninguna cantidad: márquelo como «aceptado».');
      if (dto.resolucion === 'corregida' && !dto.nota?.trim()) throw new BadRequestException('Anote por qué se corrigió el pedido (por ejemplo, lo que hay en bodega).');

      const traspaso = await this.traspasos.crear({ origenId: dto.origenId, destinoId: orden.ubicacionId, lineas: conCantidad.map((x) => ({ varianteId: x.linea.varianteId, cantidadEnviada: x.cantidad })) }, usuarioId);
      for (const x of aEnviar) await manager.update(OrdenTiendaLinea, x.linea.id, { cantidadAprobada: x.cantidad, costoTienda: x.cantidad > 0 && x.costo ? redondear(x.costo).toFixed(2) : null });
      if (orden.estado === E.ENVIADA) await this.evento(manager, id, E.RECIBIDA, usuarioId, 'Recibido y revisado');
      await manager.update(OrdenTienda, id, { estado: E.REVISADA, resolucion: dto.resolucion, respuesta: dto.nota?.trim() || null, traspasoId: traspaso.id });
      await this.evento(manager, id, E.REVISADA, usuarioId, `${dto.resolucion === 'aceptada' ? 'Aceptado' : 'Corregido'}${dto.nota?.trim() ? `: ${dto.nota.trim()}` : ''}`);
      return { ok: true, traspasoId: traspaso.id, numeroTraspaso: traspaso.numeroTraspaso };
    });
  }

  // 3) Bodega lo prepara.
  async alistar(id: string, nota: string | undefined, usuarioId: string) {
    await this.dataSource.transaction(async (manager) => {
      const o = await this.cargar(manager, id);
      if (o.estado !== E.REVISADA) throw new BadRequestException('Solo se puede alistar un pedido ya revisado.');
      await manager.update(OrdenTienda, id, { estado: E.ALISTADA });
      await this.evento(manager, id, E.ALISTADA, usuarioId, nota);
    });
    return { ok: true };
  }

  // 4) Sale de bodega: despacha el traspaso (descuenta de bodega) y el pedido queda "enviado a la tienda".
  async enviar(id: string, usuarioId: string) {
    const o = await this.cargar(this.dataSource.manager, id);
    if (o.estado !== E.REVISADA && o.estado !== E.ALISTADA) throw new BadRequestException('Primero hay que revisar el pedido.');
    if (!o.traspasoId) throw new BadRequestException('El pedido no tiene traspaso.');
    await this.traspasos.despachar(o.traspasoId, usuarioId);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(OrdenTienda, id, { estado: E.EN_CAMINO });
      await this.evento(manager, id, E.EN_CAMINO, usuarioId, 'Despachado desde bodega');
    });
    return { ok: true };
  }

  // Rechazar o cancelar solo mientras no se haya revisado (después ya hay un traspaso armado).
  async cerrarSinEnviar(id: string, dto: EstadoOrdenDto, usuarioId: string) {
    await this.dataSource.transaction(async (manager) => {
      const o = await this.cargar(manager, id);
      if (o.estado !== E.ENVIADA && o.estado !== E.RECIBIDA) throw new BadRequestException('Después de revisado no se puede rechazar ni cancelar; el traspaso ya está armado.');
      if (dto.estado === E.RECHAZADA && !dto.respuesta?.trim()) throw new BadRequestException('Indique el motivo del rechazo para que la tienda lo sepa.');
      await manager.update(OrdenTienda, id, { estado: dto.estado, respuesta: dto.respuesta?.trim() || o.respuesta });
      await this.evento(manager, id, dto.estado, usuarioId, dto.respuesta);
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ La tienda recibe y acepta

  // Verifica lo recibido contra lo enviado, entra al inventario de la tienda, actualiza su costo promedio y genera el asiento
  // (inventario de tiendas a costo especial contra inventario de bodega a costo normal; la diferencia a su cuenta propia).
  async recibirEnTienda(usuario: { id: string; rol: string }, id: string, dto: RecibirTiendaDto) {
    const orden = await this.cargar(this.dataSource.manager, id);
    if (usuario.rol === Rol.ENCARGADO_TIENDA) {
      const u = await this.dataSource.getRepository(Usuario).findOne({ where: { id: usuario.id }, select: { id: true, ubicacionId: true } });
      if (!u?.ubicacionId || u.ubicacionId !== orden.ubicacionId) throw new ForbiddenException('Ese pedido no es de su tienda.');
    }
    if (orden.estado !== E.EN_CAMINO || !orden.traspasoId) throw new BadRequestException('Ese pedido todavía no viene en camino.');
    const recibidas = new Map(dto.lineas.map((l) => [l.varianteId, l.cantidadRecibida]));
    const enviadas = orden.lineas.filter((l) => (l.cantidadAprobada ?? 0) > 0);
    for (const l of enviadas) {
      if (!recibidas.has(l.varianteId)) throw new BadRequestException(`Falta verificar ${l.codigo} ${l.color}.`);
      if (recibidas.get(l.varianteId)! > (l.cantidadAprobada ?? 0)) throw new BadRequestException(`${l.codigo} ${l.color}: no puede recibir más de lo enviado (${l.cantidadAprobada}).`);
    }
    const hayDiferencia = enviadas.some((l) => recibidas.get(l.varianteId) !== l.cantidadAprobada);
    if (hayDiferencia && !dto.nota?.trim()) throw new BadRequestException('Hay diferencias con lo enviado: anote qué pasó (faltantes o dañados).');

    const traspaso = await this.traspasos.buscarPorIdOFallar(orden.traspasoId);
    await this.traspasos.recibir(
      traspaso.id,
      { lineas: traspaso.lineas.map((l) => ({ lineaId: l.id, cantidadRecibida: recibidas.get(l.varianteId) ?? 0 })) },
      usuario.id,
      async (manager) => {
        await this.contabilizarRecepcion(manager, orden, recibidas);
        for (const l of enviadas) await manager.update(OrdenTiendaLinea, l.id, { cantidadRecibida: recibidas.get(l.varianteId)! });
        await manager.update(OrdenTienda, orden.id, { estado: E.ENTREGADA, atendidaPorId: usuario.id, atendidaEn: new Date() });
        await this.evento(manager, orden.id, E.ENTREGADA, usuario.id, dto.nota ?? (hayDiferencia ? 'Recibido con diferencias' : 'Verificado: coincide con lo enviado'));
      },
    );
    return { ok: true };
  }

  private async contabilizarRecepcion(manager: EntityManager, orden: OrdenTienda, recibidas: Map<string, number>): Promise<void> {
    const variantes = await manager.find(VarianteProducto, { where: { id: In(orden.lineas.map((l) => l.varianteId)) } });
    const costoNormal = new Map(variantes.map((v) => [v.id, v.costo ? Number(v.costo) : null]));
    const lineas: LineaTraslado[] = [];
    for (const l of orden.lineas) {
      const enviada = l.cantidadAprobada ?? 0;
      if (enviada <= 0) continue;
      const recibida = recibidas.get(l.varianteId) ?? 0;
      const especial = Number(l.costoTienda ?? 0);
      const normal = costoNormal.get(l.varianteId) ?? especial;
      lineas.push({ enviada, recibida, especial, normal });

      // Costo promedio de la tienda: lo que ya había (a su costo) más lo recibido a costo especial.
      if (recibida > 0) {
        const stock = await manager.findOne(StockUbicacion, { where: { ubicacionId: orden.ubicacionId, varianteId: l.varianteId }, lock: { mode: 'pessimistic_write' } });
        if (stock) {
          const antes = Math.max(stock.cantidad - recibida, 0);
          const costoAntes = stock.costoPromedio ? Number(stock.costoPromedio) : normal;
          const nuevo = antes + recibida > 0 ? (antes * costoAntes + recibida * especial) / (antes + recibida) : especial;
          await manager.update(StockUbicacion, stock.id, { costoPromedio: redondear(nuevo).toFixed(2) });
        }
      }
    }
    if (orden.esPrueba) return; // los traslados de prueba no generan asiento
    const r = asientoTraslado(lineas, { tiendas: CUENTA.INVENTARIO_TIENDAS, bodega: CUENTA.INVENTARIO, merma: CUENTA.PERDIDA_MERMAS, diferencia: CUENTA.DIFERENCIA_COSTO_TRASLADOS });
    if (r.vacio) return;
    await this.contabilidad.registrarAsientoEnTransaccion(manager, {
      fecha: hoyISO(),
      descripcion: `Traslado a tienda ${orden.ubicacion.nombre} — pedido ${numeroOrdenTexto(orden.ubicacion.codigo, orden.numero)}`.slice(0, 255),
      origenTipo: REFERENCIA,
      origenId: orden.id,
      lineas: r.asiento,
    });
  }
}
