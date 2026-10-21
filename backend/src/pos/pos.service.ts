import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PosVenta, ESTADO_POS_VENTA } from './pos-venta.entity.js';
import { PosVentaLinea } from './pos-venta-linea.entity.js';
import { PosPago } from './pos-pago.entity.js';
import { PosCaja } from './pos-caja.entity.js';
import { PosConfiguracion } from './pos-configuracion.entity.js';
import type { ActualizarPosConfigDto, PosCajaDto, PosVentaDto, SincronizarPosDto } from './dto/pos.dto.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { TipoUbicacion } from '../common/enums/tipo-ubicacion.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { StockUbicacion } from '../inventario/stock-ubicacion.entity.js';
import { Rol } from '../common/enums/rol.enum.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { CuentaBancaria } from '../pagos/cuenta-bancaria.entity.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import { CUENTA, ContabilidadService } from '../contabilidad/contabilidad.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { OrdenesTiendaService, type ResultadoOrdenSync } from './ordenes-tienda.service.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';

const REFERENCIA = 'pos_venta';
const ZONA = 'America/Costa_Rica';
const fechaCR = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const numeroTexto = (codigoTienda: string, numero: number): string => `${codigoTienda}-${String(numero).padStart(6, '0')}`;

export interface ResultadoVentaSync {
  id: string;
  estado: 'ok' | 'duplicada' | 'error';
  numero?: number;
  mensaje?: string;
}

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly inventario: InventarioService,
    private readonly contabilidad: ContabilidadService,
    private readonly configuracion: ConfiguracionService,
    private readonly ordenes: OrdenesTiendaService,
    @InjectRepository(PosVenta) private readonly ventaRepo: Repository<PosVenta>,
    @InjectRepository(PosCaja) private readonly cajaRepo: Repository<PosCaja>,
    @InjectRepository(PosConfiguracion) private readonly configRepo: Repository<PosConfiguracion>,
    @InjectRepository(Ubicacion) private readonly ubicacionRepo: Repository<Ubicacion>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  // ------------------------------------------------------------------ Terminal

  // El encargado de tienda solo opera la tienda que tiene asignada; la gerencia y el sistema pueden operar cualquiera.
  private async exigirTiendaPropia(usuario: { id: string; rol: string }, ubicacionId: string): Promise<void> {
    if (usuario.rol !== Rol.ENCARGADO_TIENDA) return;
    const u = await this.usuarioRepo.findOne({ where: { id: usuario.id }, select: { id: true, ubicacionId: true } });
    if (!u?.ubicacionId || u.ubicacionId !== ubicacionId) throw new ForbiddenException('Esa no es la tienda asignada a su cuenta.');
  }

  async tiendas(usuario: { id: string; rol: string }) {
    const todas = await this.ubicacionRepo.find({ where: { tipo: TipoUbicacion.TIENDA, activa: true }, order: { nombre: 'ASC' }, select: { id: true, nombre: true, codigo: true } });
    if (usuario.rol !== Rol.ENCARGADO_TIENDA) return todas;
    const u = await this.usuarioRepo.findOne({ where: { id: usuario.id }, select: { id: true, ubicacionId: true } });
    return todas.filter((t) => t.id === u?.ubicacionId);
  }

  private async tiendaOFallar(id: string): Promise<Ubicacion> {
    const u = await this.ubicacionRepo.findOneBy({ id });
    if (!u || u.tipo !== TipoUbicacion.TIENDA || !u.activa) throw new BadRequestException('Esa ubicación no es una tienda activa.');
    return u;
  }

  // Todo lo que la terminal necesita para trabajar sin internet: productos con precio de tienda, existencias y datos del tiquete.
  async catalogo(usuario: { id: string; rol: string }, ubicacionId: string) {
    await this.exigirTiendaPropia(usuario, ubicacionId);
    const tienda = await this.tiendaOFallar(ubicacionId);
    const [variantes, ultimo, encabezado, cfg, ultimaOrden, recientes] = await Promise.all([
      this.dataSource.query(
        `SELECT v.id AS "varianteId", p.codigo, p.nombre, v.color, v.precio_tienda::float8 AS precio, v.codigo_barras AS "codigoBarras",
                COALESCE(s.cantidad, 0)::int AS stock, COALESCE(s.stock_minimo, 0)::int AS minimo,
                COALESCE((SELECT SUM(sb.cantidad) FROM stock_ubicaciones sb JOIN ubicaciones ub ON ub.id = sb.ubicacion_id WHERE sb.variante_id = v.id AND ub.tipo = 'bodega_distribucion' AND ub.activa), 0)::int AS bodega
         FROM variantes_producto v JOIN productos p ON p.id = v.producto_id
         LEFT JOIN stock_ubicaciones s ON s.variante_id = v.id AND s.ubicacion_id = $1
         WHERE v.activo AND p.activo AND v.precio_tienda IS NOT NULL ORDER BY p.codigo, v.color`,
        [ubicacionId],
      ),
      this.dataSource.query('SELECT COALESCE(MAX(numero), 0)::int AS n FROM pos_ventas WHERE ubicacion_id = $1', [ubicacionId]),
      this.configuracion.obtenerFactura(),
      this.obtenerConfig(),
      this.dataSource.query('SELECT COALESCE(MAX(numero), 0)::int AS n FROM pos_ordenes WHERE ubicacion_id = $1', [ubicacionId]),
      this.ordenes.recientes(ubicacionId),
    ]);
    return {
      generadoEn: new Date().toISOString(),
      tienda: { id: tienda.id, nombre: tienda.nombre, codigo: tienda.codigo },
      encabezado: { razonSocial: encabezado.razonSocial, cedulaJuridica: encabezado.cedulaJuridica, telefono: encabezado.telefono, direccion: encabezado.direccion, pie: cfg.pieTiquete },
      ultimoNumero: ultimo[0].n,
      ultimoNumeroOrden: ultimaOrden[0].n,
      ordenesRecientes: recientes,
      variantes,
    };
  }

  private async obtenerConfig(): Promise<PosConfiguracion> {
    const existente = await this.configRepo.findOneBy({ id: 'general' });
    if (existente) return existente;
    return this.configRepo.save(this.configRepo.create({ id: 'general', pieTiquete: '¡Gracias por su compra!' }));
  }

  // Recibe lo que la terminal guardó (con o sin internet). Es seguro reenviar: lo ya recibido se reconoce por su id.
  async sincronizar(usuario: { id: string; rol: string }, dto: SincronizarPosDto) {
    await this.exigirTiendaPropia(usuario, dto.ubicacionId);
    const tienda = await this.tiendaOFallar(dto.ubicacionId);
    const cfg = await this.obtenerConfig();
    const resultados: ResultadoVentaSync[] = [];
    const resultadosCajas: Array<{ id: string; estado: 'ok' | 'error'; mensaje?: string }> = [];
    const resultadosOrdenes: ResultadoOrdenSync[] = [];

    // 1. Aperturas de caja (las ventas se enlazan a su turno).
    for (const c of dto.cajas) {
      try {
        await this.guardarApertura(tienda, usuario.id, c);
      } catch (err) {
        resultadosCajas.push({ id: c.id, estado: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo guardar la caja.' });
      }
    }
    // 2. Ventas, en el orden en que se cobraron.
    for (const v of [...dto.ventas].sort((a, b) => a.numero - b.numero)) {
      try {
        resultados.push(await this.dataSource.transaction((manager) => this.guardarVenta(manager, tienda, usuario.id, v, cfg)));
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'No se pudo guardar la venta.';
        this.logger.warn(`Venta POS ${v.id} rechazada: ${mensaje}`);
        resultados.push({ id: v.id, estado: 'error', mensaje });
      }
    }
    // 2b. Pedidos de reposición hechos en la terminal.
    for (const o of [...(dto.ordenes ?? [])].sort((a, b) => a.numero - b.numero)) {
      try {
        resultadosOrdenes.push(await this.ordenes.guardar(tienda, usuario.id, o));
      } catch (err) {
        resultadosOrdenes.push({ id: o.id, estado: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo guardar el pedido.' });
      }
    }
    // 3. Cierres de caja (ya con todas las ventas del turno).
    for (const c of dto.cajas) {
      if (resultadosCajas.some((r) => r.id === c.id)) continue;
      try {
        await this.guardarCierre(c);
        resultadosCajas.push({ id: c.id, estado: 'ok' });
      } catch (err) {
        resultadosCajas.push({ id: c.id, estado: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo cerrar la caja.' });
      }
    }

    const [stock, ultimo] = await Promise.all([
      this.dataSource.query('SELECT variante_id AS "varianteId", cantidad::int AS stock, stock_minimo::int AS minimo FROM stock_ubicaciones WHERE ubicacion_id = $1', [tienda.id]),
      this.dataSource.query('SELECT COALESCE(MAX(numero), 0)::int AS n FROM pos_ventas WHERE ubicacion_id = $1', [tienda.id]),
    ]);
    const [ultimaOrden, recientes] = await Promise.all([
      this.dataSource.query('SELECT COALESCE(MAX(numero), 0)::int AS n FROM pos_ordenes WHERE ubicacion_id = $1', [tienda.id]),
      this.ordenes.recientes(tienda.id),
    ]);
    return { ventas: resultados, cajas: resultadosCajas, ordenes: resultadosOrdenes, ordenesRecientes: recientes, ultimoNumeroOrden: ultimaOrden[0].n, stock, ultimoNumero: ultimo[0].n, sincronizadoEn: new Date().toISOString() };
  }

  private async guardarApertura(tienda: Ubicacion, usuarioId: string, c: PosCajaDto): Promise<void> {
    const existente = await this.cajaRepo.findOneBy({ id: c.id });
    if (existente) return;
    await this.cajaRepo.save(
      this.cajaRepo.create({
        id: c.id,
        ubicacionId: tienda.id,
        cajeroId: await this.cajeroValido(c.cajeroId, usuarioId),
        abiertaEn: new Date(c.abiertaEn),
        fondoInicial: redondear(c.fondoInicial).toFixed(2),
        notas: c.notas ?? null,
      }),
    );
  }

  private async guardarCierre(c: PosCajaDto): Promise<void> {
    if (!c.cerradaEn) return;
    const caja = await this.cajaRepo.findOneBy({ id: c.id });
    if (!caja) throw new NotFoundException('La caja no existe.');
    if (caja.cerradaEn) return;
    const [{ efectivo }] = await this.dataSource.query(
      `SELECT COALESCE(SUM(p.monto), 0)::float8 AS efectivo FROM pos_pagos p JOIN pos_ventas v ON v.id = p.venta_id
       WHERE v.caja_id = $1 AND v.estado = 'vigente' AND p.medio = 'efectivo'`,
      [c.id],
    );
    const esperado = redondear(Number(caja.fondoInicial) + Number(efectivo));
    const contado = redondear(c.efectivoContado ?? esperado);
    await this.cajaRepo.update(c.id, {
      cerradaEn: new Date(c.cerradaEn),
      efectivoEsperado: esperado.toFixed(2),
      efectivoContado: contado.toFixed(2),
      diferencia: redondear(contado - esperado).toFixed(2),
      notas: c.notas ?? caja.notas,
    });
  }

  private async cajeroValido(cajeroId: string | undefined, porDefecto: string): Promise<string> {
    if (cajeroId && (await this.usuarioRepo.existsBy({ id: cajeroId }))) return cajeroId;
    return porDefecto;
  }

  private cuentaMedio(medio: string, cfg: PosConfiguracion): string | null {
    if (medio === 'tarjeta') return cfg.cuentaTarjetaId;
    if (medio === 'sinpe') return cfg.cuentaSinpeId;
    if (medio === 'transferencia') return cfg.cuentaTransferenciaId;
    return null;
  }

  private async guardarVenta(manager: EntityManager, tienda: Ubicacion, usuarioId: string, v: PosVentaDto, cfg: PosConfiguracion): Promise<ResultadoVentaSync> {
    const ya = await manager.findOne(PosVenta, { where: { id: v.id } });
    if (ya) return { id: v.id, estado: 'duplicada', numero: ya.numero };

    const variantes = await manager.find(VarianteProducto, { where: { id: In(v.lineas.map((l) => l.varianteId)) }, relations: { producto: true } });
    const porId = new Map(variantes.map((x) => [x.id, x]));
    // Costo de la tienda (promedio de lo recibido a costo especial); sin dato, el costo del producto.
    const costosTienda = new Map((await manager.find(StockUbicacion, { where: { ubicacionId: tienda.id, varianteId: In(v.lineas.map((l) => l.varianteId)) } })).map((s) => [s.varianteId, s.costoPromedio]));
    const lineas = v.lineas.map((l) => {
      const variante = porId.get(l.varianteId);
      if (!variante) throw new BadRequestException('Un producto del tiquete ya no existe en el catálogo.');
      const bruto = redondear(l.precioUnitario * l.cantidad);
      const descuento = redondear(Math.min(l.descuento ?? 0, bruto));
      return { l, variante, bruto, descuento, subtotal: redondear(bruto - descuento), costo: costosTienda.get(variante.id) ?? variante.costo };
    });
    const subtotal = redondear(lineas.reduce((a, x) => a + x.bruto, 0));
    const descuento = redondear(lineas.reduce((a, x) => a + x.descuento, 0));
    const total = redondear(subtotal - descuento);
    const pagado = redondear(v.pagos.reduce((a, p) => a + p.monto, 0));
    if (Math.abs(pagado - total) > 0.01) throw new BadRequestException(`Los pagos (${pagado}) no suman el total del tiquete (${total}).`);

    // Si el número ya lo usa otra venta (por ejemplo, se reinstaló la terminal), se le da el siguiente libre.
    let numero = v.numero;
    if (await manager.exists(PosVenta, { where: { ubicacionId: tienda.id, numero } })) {
      const [{ n }] = await manager.query('SELECT COALESCE(MAX(numero), 0)::int + 1 AS n FROM pos_ventas WHERE ubicacion_id = $1', [tienda.id]);
      numero = n;
    }
    // Control de precios: la terminal cobra con el catálogo que tenía guardado; si el precio no coincide con el actual, queda marcado.
    const distintos = lineas.filter((x) => x.variante.precioTienda === null || Math.abs(Number(x.variante.precioTienda) - redondear(x.l.precioUnitario)) > 0.001).length;
    const alerta = distintos ? `${distintos} línea(s) con precio distinto al de tienda actual` : null;
    const cajeroId = await this.cajeroValido(v.cajeroId, usuarioId);
    const cajaId = v.cajaId && (await manager.exists(PosCaja, { where: { id: v.cajaId } })) ? v.cajaId : null;

    const venta = manager.create(PosVenta, {
      id: v.id,
      ubicacionId: tienda.id,
      numero,
      cajeroId,
      cajaId,
      fecha: new Date(v.fecha),
      subtotal: subtotal.toFixed(2),
      descuento: descuento.toFixed(2),
      total: total.toFixed(2),
      estado: ESTADO_POS_VENTA.VIGENTE,
      creadaSinConexion: Boolean(v.sinConexion),
      alerta,
      lineas: lineas.map((x) =>
        manager.create(PosVentaLinea, {
          varianteId: x.variante.id,
          codigo: x.variante.producto.codigo,
          descripcion: x.variante.producto.nombre.slice(0, 200),
          color: x.variante.color,
          cantidad: x.l.cantidad,
          precioUnitario: redondear(x.l.precioUnitario).toFixed(2),
          descuento: x.descuento.toFixed(2),
          subtotal: x.subtotal.toFixed(2),
          costoUnitario: x.costo,
        }),
      ),
      pagos: v.pagos.map((p) =>
        manager.create(PosPago, {
          medio: p.medio,
          monto: redondear(p.monto).toFixed(2),
          referencia: p.referencia?.trim() || null,
          recibido: p.medio === 'efectivo' && p.recibido !== undefined ? redondear(p.recibido).toFixed(2) : null,
          vuelto: p.medio === 'efectivo' && p.recibido !== undefined ? redondear(Math.max(0, p.recibido - p.monto)).toFixed(2) : null,
        }),
      ),
    });
    await manager.save(PosVenta, venta);

    // Inventario de la tienda: la venta ya ocurrió, así que nunca se rechaza por falta de existencias (queda en el kardex y en las alertas).
    for (const x of lineas) {
      await this.inventario.registrarMovimientoEnTransaccion(manager, {
        ubicacionId: tienda.id,
        varianteId: x.variante.id,
        tipo: TipoMovimientoInventario.VENTA_POS,
        cantidad: -x.l.cantidad,
        referenciaTipo: REFERENCIA,
        referenciaId: v.id,
        creadoPorId: cajeroId,
        permitirNegativo: true,
      });
    }

    await this.registrarAsientos(manager, tienda, venta, lineas, cfg, new Date(v.fecha));
    return { id: v.id, estado: 'ok', numero };
  }

  // Libro mayor: caja o banco contra ventas (sin IVA: régimen simplificado) y el costo de lo vendido contra inventario.
  private async registrarAsientos(
    manager: EntityManager,
    tienda: Ubicacion,
    venta: PosVenta,
    lineas: Array<{ l: { cantidad: number }; variante: VarianteProducto; costo: string | null }>,
    cfg: PosConfiguracion,
    fechaVenta: Date,
  ): Promise<void> {
    let fecha = fechaCR(fechaVenta);
    let nota = '';
    // Una venta cobrada sin internet puede llegar cuando su mes ya se cerró: se contabiliza hoy y se deja la fecha original en la descripción.
    if (await this.contabilidad.estaCerrado(manager, fecha)) {
      nota = ` (cobrada el ${fecha})`;
      fecha = hoyISO();
    }
    const etiqueta = numeroTexto(tienda.codigo, venta.numero);

    const porCuenta = new Map<string, number>();
    for (const p of venta.pagos) {
      const cuentaId = this.cuentaMedio(p.medio, cfg);
      let codigo: string = CUENTA.CAJA;
      if (cuentaId) {
        const banco = await manager.findOne(CuentaBancaria, { where: { id: cuentaId }, relations: { cuentaContable: true } });
        if (banco?.cuentaContable) codigo = banco.cuentaContable.codigo;
      }
      porCuenta.set(codigo, redondear((porCuenta.get(codigo) ?? 0) + Number(p.monto)));
    }
    const total = Number(venta.total);
    if (total > 0) {
      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha,
        descripcion: `Venta POS ${etiqueta}${nota}`.slice(0, 255),
        origenTipo: REFERENCIA,
        origenId: venta.id,
        lineas: [...[...porCuenta.entries()].map(([codigoCuenta, debe]) => ({ codigoCuenta, debe })), { codigoCuenta: CUENTA.VENTAS, haber: total }],
      });
    }
    const costo = redondear(lineas.reduce((a, x) => a + (x.costo ? Number(x.costo) * x.l.cantidad : 0), 0));
    if (costo > 0) {
      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha,
        descripcion: `Costo de ventas POS ${etiqueta}${nota}`.slice(0, 255),
        origenTipo: REFERENCIA,
        origenId: venta.id,
        lineas: [
          { codigoCuenta: CUENTA.COSTO_VENTAS, debe: costo },
          { codigoCuenta: CUENTA.INVENTARIO_TIENDAS, haber: costo },
        ],
      });
    }
  }

  // ------------------------------------------------------------------ Administración

  async anular(id: string, motivo: string, usuarioId: string) {
    if (!motivo.trim()) throw new BadRequestException('Indique el motivo de la anulación.');
    await this.dataSource.transaction(async (manager) => {
      const venta = await manager.findOne(PosVenta, { where: { id }, relations: { lineas: true, ubicacion: true } });
      if (!venta) throw new NotFoundException('La venta no existe.');
      if (venta.estado !== ESTADO_POS_VENTA.VIGENTE) throw new BadRequestException('Esa venta ya está anulada.');
      for (const l of venta.lineas) {
        await this.inventario.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: venta.ubicacionId,
          varianteId: l.varianteId,
          tipo: TipoMovimientoInventario.DEVOLUCION_POS,
          cantidad: l.cantidad,
          referenciaTipo: REFERENCIA,
          referenciaId: venta.id,
          creadoPorId: usuarioId,
          permitirNegativo: true,
        });
      }
      await this.contabilidad.reversarPorOrigenEnTransaccion(manager, REFERENCIA, venta.id, motivo, `Anulación de venta POS ${numeroTexto(venta.ubicacion.codigo, venta.numero)} — ${motivo.trim()}`);
      await manager.update(PosVenta, venta.id, { estado: ESTADO_POS_VENTA.ANULADA, motivoAnulacion: motivo.trim().slice(0, 200), anuladaEn: new Date(), anuladaPorId: usuarioId });
    });
    return { ok: true };
  }

  private rango(f: { desde?: string; hasta?: string }): [string | null, string | null] {
    for (const v of [f.desde, f.hasta]) if (v && !FECHA.test(v)) throw new BadRequestException('Las fechas deben ir como AAAA-MM-DD.');
    return [f.desde || null, f.hasta || null];
  }

  async listar(f: { desde?: string; hasta?: string; ubicacionId?: string; estado?: string }) {
    const [desde, hasta] = this.rango(f);
    const filas: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT v.id, v.numero, u.codigo AS "tiendaCodigo", u.nombre AS tienda, to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD HH24:MI') AS fecha,
              us.nombre AS cajero, v.total::float8 AS total, v.estado, v.creada_sin_conexion AS "sinConexion", v.alerta,
              (SELECT string_agg(DISTINCT p.medio, ', ' ORDER BY p.medio) FROM pos_pagos p WHERE p.venta_id = v.id) AS medios,
              (SELECT COALESCE(SUM(l.cantidad), 0)::int FROM pos_venta_lineas l WHERE l.venta_id = v.id) AS pares
       FROM pos_ventas v JOIN ubicaciones u ON u.id = v.ubicacion_id JOIN usuarios us ON us.id = v.cajero_id
       WHERE ($1::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') >= $1) AND ($2::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') <= $2)
         AND ($3::uuid IS NULL OR v.ubicacion_id = $3::uuid) AND ($4::text IS NULL OR v.estado = $4)
       ORDER BY v.fecha DESC LIMIT 300`,
      [desde, hasta, f.ubicacionId || null, f.estado || null],
    );
    return filas.map((x) => ({ ...x, numeroTexto: numeroTexto(String(x.tiendaCodigo), Number(x.numero)) }));
  }

  async detalle(id: string) {
    const venta = await this.ventaRepo.findOne({ where: { id }, relations: { lineas: true, pagos: true, ubicacion: true, cajero: true } });
    if (!venta) throw new NotFoundException('La venta no existe.');
    return {
      id: venta.id,
      numero: venta.numero,
      numeroTexto: numeroTexto(venta.ubicacion.codigo, venta.numero),
      tienda: venta.ubicacion.nombre,
      cajero: venta.cajero.nombre,
      fecha: venta.fecha,
      estado: venta.estado,
      motivoAnulacion: venta.motivoAnulacion,
      alerta: venta.alerta,
      subtotal: venta.subtotal,
      descuento: venta.descuento,
      total: venta.total,
      sinConexion: venta.creadaSinConexion,
      lineas: venta.lineas.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, color: l.color, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, subtotal: l.subtotal })),
      pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: p.monto, referencia: p.referencia, recibido: p.recibido, vuelto: p.vuelto })),
    };
  }

  async resumen(f: { desde?: string; hasta?: string; ubicacionId?: string }) {
    const [desde, hasta] = this.rango(f);
    const donde = `v.estado = 'vigente' AND ($1::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') >= $1) AND ($2::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') <= $2) AND ($3::uuid IS NULL OR v.ubicacion_id = $3::uuid)`;
    const p = [desde, hasta, f.ubicacionId || null];
    const [[k], porMedio, porDia, porTienda, topProductos, [anuladas], pendientes] = await Promise.all([
      this.dataSource.query(`SELECT COALESCE(SUM(v.total), 0)::float8 AS total, COUNT(*)::int AS tiquetes, COALESCE(SUM((SELECT SUM(l.cantidad) FROM pos_venta_lineas l WHERE l.venta_id = v.id)), 0)::int AS pares FROM pos_ventas v WHERE ${donde}`, p),
      this.dataSource.query(`SELECT pg.medio AS etiqueta, SUM(pg.monto)::float8 AS monto FROM pos_pagos pg JOIN pos_ventas v ON v.id = pg.venta_id WHERE ${donde} GROUP BY 1 ORDER BY 2 DESC`, p),
      this.dataSource.query(`SELECT to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') AS etiqueta, SUM(v.total)::float8 AS monto, COUNT(*)::int AS tiquetes FROM pos_ventas v WHERE ${donde} GROUP BY 1 ORDER BY 1`, p),
      this.dataSource.query(`SELECT u.nombre AS etiqueta, SUM(v.total)::float8 AS monto, COUNT(*)::int AS tiquetes FROM pos_ventas v JOIN ubicaciones u ON u.id = v.ubicacion_id WHERE ${donde} GROUP BY 1 ORDER BY 2 DESC`, p),
      this.dataSource.query(`SELECT l.codigo || ' ' || l.color AS etiqueta, SUM(l.cantidad)::int AS pares, SUM(l.subtotal)::float8 AS monto FROM pos_venta_lineas l JOIN pos_ventas v ON v.id = l.venta_id WHERE ${donde} GROUP BY 1 ORDER BY 3 DESC LIMIT 10`, p),
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM pos_ventas v WHERE v.estado = 'anulada' AND ($1::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') >= $1) AND ($2::text IS NULL OR to_char(v.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') <= $2) AND ($3::uuid IS NULL OR v.ubicacion_id = $3::uuid)`, p),
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM pos_ventas v WHERE v.creada_sin_conexion AND ${donde}`, p),
    ]);
    return {
      kpis: { total: redondear(Number(k.total)), tiquetes: Number(k.tiquetes), pares: Number(k.pares), ticketPromedio: k.tiquetes > 0 ? redondear(Number(k.total) / Number(k.tiquetes)) : 0, anuladas: Number(anuladas.n), sinConexion: Number(pendientes[0].n) },
      porMedio,
      porDia,
      porTienda,
      topProductos,
    };
  }

  async cajas(f: { desde?: string; hasta?: string; ubicacionId?: string }) {
    const [desde, hasta] = this.rango(f);
    return this.dataSource.query(
      `SELECT c.id, u.nombre AS tienda, us.nombre AS cajero, to_char(c.abierta_en AT TIME ZONE '${ZONA}', 'YYYY-MM-DD HH24:MI') AS "abiertaEn",
              to_char(c.cerrada_en AT TIME ZONE '${ZONA}', 'YYYY-MM-DD HH24:MI') AS "cerradaEn", c.fondo_inicial::float8 AS "fondoInicial",
              c.efectivo_esperado::float8 AS "efectivoEsperado", c.efectivo_contado::float8 AS "efectivoContado", c.diferencia::float8 AS diferencia, c.notas,
              (SELECT COALESCE(SUM(v.total), 0)::float8 FROM pos_ventas v WHERE v.caja_id = c.id AND v.estado = 'vigente') AS ventas
       FROM pos_cajas c JOIN ubicaciones u ON u.id = c.ubicacion_id JOIN usuarios us ON us.id = c.cajero_id
       WHERE ($1::text IS NULL OR to_char(c.abierta_en AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') >= $1) AND ($2::text IS NULL OR to_char(c.abierta_en AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') <= $2)
         AND ($3::uuid IS NULL OR c.ubicacion_id = $3::uuid)
       ORDER BY c.abierta_en DESC LIMIT 200`,
      [desde, hasta, f.ubicacionId || null],
    );
  }

  async configuracionActual() {
    const cfg = await this.obtenerConfig();
    const cuentas: Array<{ id: string; nombre: string }> = await this.dataSource.query('SELECT id, nombre FROM cuentas_bancarias WHERE activa ORDER BY nombre');
    return { ...cfg, cuentasBancarias: cuentas };
  }

  async actualizarConfiguracion(dto: ActualizarPosConfigDto) {
    const cfg = await this.obtenerConfig();
    for (const k of ['cuentaTarjetaId', 'cuentaSinpeId', 'cuentaTransferenciaId'] as const) {
      if (dto[k] !== undefined) cfg[k] = dto[k] || null;
    }
    if (dto.pieTiquete !== undefined) cfg.pieTiquete = dto.pieTiquete.trim();
    await this.configRepo.save(cfg);
    return this.configuracionActual();
  }
}
