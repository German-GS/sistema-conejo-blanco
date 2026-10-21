import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, LessThanOrEqual, MoreThanOrEqual, Repository, type FindOptionsWhere } from 'typeorm';
import { Pedido } from './pedido.entity.js';
import { PedidoLinea } from './pedido-linea.entity.js';
import { PedidoContador } from './pedido-contador.entity.js';
import { PedidoEdicion } from './pedido-edicion.entity.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { CatalogoService } from '../catalogo/catalogo.service.js';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { EstadoPedido } from '../common/enums/estado-pedido.enum.js';
import { MetodoEntrega } from '../common/enums/metodo-entrega.enum.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import type { Provincia } from '../common/enums/provincia.enum.js';
import { IVA_PORCENTAJE, UNIDADES_POR_DOCENA, COLCHON_SOBREVENTA_PARES } from '../common/constants/negocio.constant.js';
import { redondear, formatearColones } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import type { Cliente } from '../clientes/cliente.entity.js';
import type { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import type { EditarPedidoLineasDto } from './dto/editar-pedido-lineas.dto.js';
import type { CrearClienteDto } from '../clientes/dto/crear-cliente.dto.js';

const CONTADOR_ID = 'pedidos';

// 'facturado'/'activo' (sin facturar todavía) no son EstadoPedido — ese
// enum solo distingue activo/anulado a nivel de columna; facturado se
// resuelve en memoria según si el pedido trae Factura, igual que las
// etiquetas que ya se ven en PedidosPage. 'anulado' sí mapea directo a
// EstadoPedido.ANULADO.
export type EstadoListadoPedido = 'activo' | 'facturado' | 'anulado';

export interface FiltrosPedidos {
  vendedorId?: string;
  clienteId?: string;
  estado?: EstadoListadoPedido;
  desde?: string;
  hasta?: string;
  provincia?: Provincia;
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(PedidoEdicion)
    private readonly pedidoEdicionRepo: Repository<PedidoEdicion>,
    private readonly clientesService: ClientesService,
    private readonly catalogoService: CatalogoService,
    private readonly ubicacionesService: UbicacionesService,
    private readonly configuracionService: ConfiguracionService,
    private readonly inventarioService: InventarioService,
    private readonly dataSource: DataSource,
  ) {}

  // 'pedido' a propósito, no 'venta': acá todavía no hay comprobante, es
  // solo lo que descontó bodega para no sobrevender (ver crear/
  // editarLineas/anular más abajo).
  private static readonly REFERENCIA_PEDIDO = 'pedido';

  // select.vendedor acá abajo es a propósito: sin esto, TypeORM trae la
  // entidad Usuario completa —password_hash incluido— y el endpoint la
  // manda tal cual en la respuesta JSON. filtros.vendedorId lo fuerza el
  // controller cuando quien pregunta no tiene pedidos.ver (un vendedor
  // solo ve los suyos); el resto de filtros son los que expone PedidosPage.
  async listar(filtros: FiltrosPedidos = {}): Promise<Pedido[]> {
    const where: FindOptionsWhere<Pedido> = {};
    if (filtros.vendedorId) where.vendedorId = filtros.vendedorId;
    if (filtros.clienteId) where.clienteId = filtros.clienteId;
    if (filtros.provincia) where.cliente = { provincia: filtros.provincia };
    if (filtros.estado === 'anulado') where.estado = EstadoPedido.ANULADO;
    else if (filtros.estado === 'activo' || filtros.estado === 'facturado') where.estado = EstadoPedido.ACTIVO;

    if (filtros.desde && filtros.hasta) where.fecha = Between(filtros.desde, filtros.hasta);
    else if (filtros.desde) where.fecha = MoreThanOrEqual(filtros.desde);
    else if (filtros.hasta) where.fecha = LessThanOrEqual(filtros.hasta);

    const pedidos = await this.pedidoRepo.find({
      where,
      relations: { cliente: true, vendedor: true, ubicacion: true, lineas: true, factura: true },
      select: { vendedor: { id: true, nombre: true, email: true, rol: true, activo: true } },
      order: { creadoEn: 'DESC' },
    });

    // 'facturado'/'activo' dependen de si existe Factura relacionada, no
    // de una columna — se filtran acá, después de traer de la base.
    if (filtros.estado === 'facturado') return pedidos.filter((p) => p.factura);
    if (filtros.estado === 'activo') return pedidos.filter((p) => !p.factura);
    return pedidos;
  }

  async buscarPorIdOFallar(id: string): Promise<Pedido> {
    const pedido = await this.pedidoRepo.findOne({
      where: { id },
      relations: { cliente: true, vendedor: true, ubicacion: true, lineas: true, factura: true },
      select: { vendedor: { id: true, nombre: true, email: true, rol: true, activo: true } },
    });
    if (!pedido) {
      throw new NotFoundException('El pedido no existe.');
    }
    return pedido;
  }

  async crear(dto: CrearPedidoDto, vendedorId: string): Promise<Pedido> {
    if (Boolean(dto.clienteId) === Boolean(dto.clienteNuevo)) {
      throw new BadRequestException(
        'El pedido necesita un cliente: elegí uno existente o completá los datos de un cliente nuevo, no ambos ni ninguno.',
      );
    }
    let cliente: Cliente | null = null;
    if (dto.clienteId) {
      cliente = await this.clientesService.buscarPorIdOFallar(dto.clienteId);
    }

    // El vendedor no elige ubicación — el pedido siempre sale de la
    // bodega de distribución central. dto.ubicacionId queda solo para un
    // futuro uso administrativo (ver CrearPedidoDto).
    const ubicacion = dto.ubicacionId
      ? await this.ubicacionesService.buscarPorIdOFallar(dto.ubicacionId)
      : await this.ubicacionesService.buscarBodegaCentralOFallar();

    const topeDescuento = await this.calcularTopeDescuento(cliente);

    // Se arman las líneas ANTES de la transacción de escritura: si algún
    // producto/variante no existe, falla temprano sin haber tocado el
    // contador de numeroOrden.
    const lineas: PedidoLinea[] = [];
    let subtotal = 0;
    for (const lineaDto of dto.lineas) {
      const variante = await this.catalogoService.buscarVarianteParaVenta(lineaDto.varianteId);
      const producto = await this.catalogoService.buscarProductoPorIdOFallar(variante.productoId);

      const descuentoPorcentaje = lineaDto.descuentoPorcentaje ?? 0;
      const precioConDescuento = this.validarDescuentoOFallar(
        descuentoPorcentaje,
        topeDescuento,
        variante.precioPorPar,
        variante.costo,
        producto.codigo,
        variante.color,
      );

      const pares = Math.round(lineaDto.docenas * UNIDADES_POR_DOCENA);
      if (pares < 1) throw new BadRequestException('Cada línea debe tener al menos 1 par.');
      const montoLinea = redondear(pares * precioConDescuento);
      subtotal += montoLinea;

      const linea = new PedidoLinea();
      linea.varianteId = variante.id;
      linea.codigoProducto = producto.codigo;
      linea.nombreProducto = producto.nombre;
      linea.color = variante.color;
      linea.docenas = lineaDto.docenas.toFixed(2);
      linea.pares = pares;
      linea.precioPorPar = variante.precioPorPar;
      linea.descuentoPorcentaje = descuentoPorcentaje.toFixed(2);
      linea.montoLinea = montoLinea.toFixed(2);
      lineas.push(linea);
    }

    subtotal = redondear(subtotal);
    const ivaMonto = redondear(subtotal * (IVA_PORCENTAJE / 100));
    const total = redondear(subtotal + ivaMonto);

    return this.dataSource.transaction(async (manager) => {
      const numeroOrden = await this.reservarNumeroOrden(manager);

      const pedido = manager.create(Pedido, {
        numeroOrden,
        clienteId: dto.clienteId ?? null,
        clientePendiente: dto.clienteNuevo ?? null,
        vendedorId,
        ubicacionId: ubicacion.id,
        fecha: dto.fecha ?? hoyISO(),
        tipoPago: dto.tipoPago,
        diasCredito: dto.diasCredito ?? null,
        metodoEntrega: dto.metodoEntrega,
        empresaEncomienda: dto.metodoEntrega === MetodoEntrega.ENCOMIENDA ? dto.empresaEncomienda?.trim() || null : null,
        subtotal: subtotal.toFixed(2),
        ivaPorcentaje: IVA_PORCENTAJE.toFixed(2),
        ivaMonto: ivaMonto.toFixed(2),
        total: total.toFixed(2),
        estado: EstadoPedido.ACTIVO,
        lineas,
      });

      const guardado = await manager.save(Pedido, pedido);

      // Descuenta bodega en cuanto el pedido existe — no al facturar (ver
      // FacturacionService.facturarPedido) — para que dos vendedores
      // nunca vendan el mismo par sin que el segundo se entere. Se
      // permite un colchón de sobreventa (ver COLCHON_SOBREVENTA_PARES):
      // el negocio todavía quiere poder seguir vendiendo un poco pasado
      // el límite físico, así que esto bloquea solo si ni con el colchón
      // alcanza.
      for (const linea of guardado.lineas) {
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: ubicacion.id,
          varianteId: linea.varianteId,
          tipo: TipoMovimientoInventario.RESERVA_PEDIDO,
          cantidad: -linea.pares,
          referenciaTipo: PedidosService.REFERENCIA_PEDIDO,
          referenciaId: guardado.id,
          creadoPorId: vendedorId,
          colchonNegativo: COLCHON_SOBREVENTA_PARES,
        });
      }

      return guardado;
    });
  }

  // Administración revisa los datos que el vendedor tecleó a mano
  // (pedido.clientePendiente), los ajusta si hace falta, y acá se crea
  // el Cliente real por primera vez y se vincula al pedido. clientePendiente
  // se conserva como registro histórico de lo que se capturó en la calle.
  async registrarCliente(id: string, dto: CrearClienteDto): Promise<Pedido> {
    const pedido = await this.buscarPorIdOFallar(id);
    if (pedido.clienteId) {
      throw new BadRequestException('Este pedido ya tiene un cliente registrado.');
    }

    const cliente = await this.clientesService.crear(dto);
    pedido.clienteId = cliente.id;
    await this.pedidoRepo.save(pedido);
    return this.buscarPorIdOFallar(id);
  }

  // Para el caso en que el cliente pendiente resulta ser uno que YA existe
  // en la base (el vendedor no lo encontró, o lo tecleó con otro nombre).
  async vincularClienteExistente(id: string, clienteId: string): Promise<Pedido> {
    const pedido = await this.buscarPorIdOFallar(id);
    if (pedido.clienteId) {
      throw new BadRequestException('Este pedido ya tiene un cliente registrado.');
    }
    await this.clientesService.buscarPorIdOFallar(clienteId);

    pedido.clienteId = clienteId;
    await this.pedidoRepo.save(pedido);
    return this.buscarPorIdOFallar(id);
  }

  // Solo para pedidos SIN facturar — una vez que existe Factura, Hacienda
  // ya no permite "borrar" la venta: hay que anularla con una Nota de
  // Crédito (ver FacturacionService.anularFactura), que además revierte
  // inventario y contabilidad. Este método es el atajo simple para
  // cuando el pedido nunca llegó a facturarse — pero igual hay que
  // devolverle a bodega lo que RESERVA_PEDIDO le había descontado al
  // crearlo, si no ese stock queda "perdido" (reservado para siempre en
  // un pedido que ya no existe).
  async anular(id: string, usuarioId: string): Promise<Pedido> {
    const pedido = await this.buscarPorIdOFallar(id);
    if (pedido.factura) {
      throw new BadRequestException(
        'Este pedido ya fue facturado — anulá la factura desde Facturas (genera una nota de crédito).',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (pedido.ubicacionId) {
        for (const linea of pedido.lineas) {
          await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
            ubicacionId: pedido.ubicacionId!,
            varianteId: linea.varianteId,
            tipo: TipoMovimientoInventario.LIBERACION_RESERVA,
            cantidad: linea.pares,
            referenciaTipo: PedidosService.REFERENCIA_PEDIDO,
            referenciaId: pedido.id,
            creadoPorId: usuarioId,
          });
        }
      }
      await manager.update(Pedido, id, { estado: EstadoPedido.ANULADO });
    });

    return this.buscarPorIdOFallar(id);
  }

  // Corrige las líneas de un pedido ya guardado — típicamente porque
  // bodega, al alistar, encontró menos stock del que el pedido pide.
  // Reemplaza TODAS las líneas (igual que crear) y deja un registro
  // inmutable de qué cambió y quién lo cambió. También ajusta lo que
  // bodega tiene reservado según suba o baje cada cantidad (mismo
  // colchón de sobreventa que crear() — ver COLCHON_SOBREVENTA_PARES).
  // No se puede editar un pedido anulado ni uno que ya tiene factura (el
  // comprobante ya es definitivo ante Hacienda).
  async editarLineas(id: string, dto: EditarPedidoLineasDto, usuarioId: string): Promise<Pedido> {
    const pedido = await this.buscarPorIdOFallar(id);
    if (pedido.estado !== EstadoPedido.ACTIVO) {
      throw new BadRequestException('No se puede editar un pedido anulado.');
    }
    if (pedido.factura) {
      throw new BadRequestException('No se puede editar un pedido que ya fue facturado.');
    }

    const cliente = pedido.clienteId ? await this.clientesService.buscarPorIdOFallar(pedido.clienteId) : null;
    const topeDescuento = await this.calcularTopeDescuento(cliente);

    const lineasAnteriores = new Map(pedido.lineas.map((l) => [l.varianteId, l]));
    const lineasNuevas: PedidoLinea[] = [];
    const cambios: string[] = [];
    // Cuánto más (o menos) hay que descontarle a bodega por variante —
    // la diferencia entre lo que el pedido reservaba antes y lo que pide
    // esta edición. Positivo = hay que sacar más de bodega; negativo =
    // se le devuelve. Ver el loop de abajo y la transacción al final.
    const ajustesInventario = new Map<string, number>();
    let subtotal = 0;

    for (const lineaDto of dto.lineas) {
      const anterior = lineasAnteriores.get(lineaDto.varianteId);
      // El costo de producción se chequea siempre contra el dato actual
      // de la variante (no queda congelado) — el piso de margen protege
      // la venta de HOY, no la de cuando se armó el pedido originalmente.
      const variante = await this.catalogoService.buscarVarianteParaVenta(lineaDto.varianteId);
      const pares = Math.round(lineaDto.docenas * UNIDADES_POR_DOCENA);
      if (pares < 1) throw new BadRequestException('Cada línea debe tener al menos 1 par.');

      let precioPorPar: string;
      let codigoProducto: string;
      let nombreProducto: string;
      let color: string;

      if (anterior) {
        // Precio congelado del pedido original por default — corregir una
        // cantidad no debe recalcular el precio pactado. Pero si mandan un
        // precioPorPar explícito (ej. se negoció aparte con el cliente),
        // se respeta y queda en la bitácora igual que cualquier otro cambio.
        precioPorPar = lineaDto.precioPorPar != null ? lineaDto.precioPorPar.toFixed(2) : anterior.precioPorPar;
        codigoProducto = anterior.codigoProducto;
        nombreProducto = anterior.nombreProducto;
        color = anterior.color;
        if (Number(anterior.docenas) !== lineaDto.docenas) {
          cambios.push(`${codigoProducto} ${color}: ${Number(anterior.docenas).toFixed(2)} → ${lineaDto.docenas.toFixed(2)} docenas`);
        }
        if (Number(anterior.precioPorPar) !== Number(precioPorPar)) {
          cambios.push(
            `${codigoProducto} ${color}: precio ${formatearColones(anterior.precioPorPar)} → ${formatearColones(precioPorPar)}`,
          );
        }
        lineasAnteriores.delete(lineaDto.varianteId);
      } else {
        const producto = await this.catalogoService.buscarProductoPorIdOFallar(variante.productoId);
        precioPorPar = lineaDto.precioPorPar != null ? lineaDto.precioPorPar.toFixed(2) : variante.precioPorPar;
        codigoProducto = producto.codigo;
        nombreProducto = producto.nombre;
        color = variante.color;
        cambios.push(`${codigoProducto} ${color}: agregada (${lineaDto.docenas.toFixed(2)} docenas)`);
      }

      const descuentoPorcentaje = lineaDto.descuentoPorcentaje ?? 0;
      const precioConDescuento = this.validarDescuentoOFallar(
        descuentoPorcentaje,
        topeDescuento,
        precioPorPar,
        variante.costo,
        codigoProducto,
        color,
      );
      if (anterior && Number(anterior.descuentoPorcentaje) !== descuentoPorcentaje) {
        cambios.push(`${codigoProducto} ${color}: descuento ${Number(anterior.descuentoPorcentaje)}% → ${descuentoPorcentaje}%`);
      }

      const montoLinea = redondear(pares * precioConDescuento);
      subtotal += montoLinea;

      const linea = new PedidoLinea();
      linea.varianteId = lineaDto.varianteId;
      linea.codigoProducto = codigoProducto;
      linea.nombreProducto = nombreProducto;
      linea.color = color;
      linea.docenas = lineaDto.docenas.toFixed(2);
      linea.pares = pares;
      linea.precioPorPar = precioPorPar;
      linea.descuentoPorcentaje = descuentoPorcentaje.toFixed(2);
      linea.montoLinea = montoLinea.toFixed(2);
      lineasNuevas.push(linea);

      const deltaPares = pares - (anterior?.pares ?? 0);
      if (deltaPares !== 0) {
        ajustesInventario.set(lineaDto.varianteId, deltaPares);
      }
    }

    // Lo que quedó en el mapa son líneas del pedido original que no
    // vinieron en esta edición — se eliminan, y lo que tenían reservado
    // se le devuelve por completo a bodega.
    for (const eliminada of lineasAnteriores.values()) {
      cambios.push(`${eliminada.codigoProducto} ${eliminada.color}: eliminada`);
      ajustesInventario.set(eliminada.varianteId, -eliminada.pares);
    }

    // Si el método deja de ser Encomienda, la empresa se limpia sola — no
    // tiene sentido arrastrar "Correos de Costa Rica" en un pedido que
    // ahora es de entrega propia.
    const empresaNueva =
      dto.metodoEntrega === undefined
        ? undefined
        : dto.metodoEntrega === MetodoEntrega.ENCOMIENDA
          ? dto.empresaEncomienda?.trim() || null
          : null;

    if (dto.metodoEntrega !== undefined && dto.metodoEntrega !== pedido.metodoEntrega) {
      cambios.push(`Método de envío: ${etiquetaMetodoEntrega(pedido.metodoEntrega)} → ${etiquetaMetodoEntrega(dto.metodoEntrega)}`);
    }
    if (empresaNueva !== undefined && empresaNueva !== pedido.empresaEncomienda) {
      cambios.push(`Empresa de encomienda: ${pedido.empresaEncomienda ?? '—'} → ${empresaNueva ?? '—'}`);
    }

    if (cambios.length === 0) {
      throw new BadRequestException('No hay ningún cambio que guardar.');
    }

    subtotal = redondear(subtotal);
    const ivaMonto = redondear(subtotal * (IVA_PORCENTAJE / 100));
    const total = redondear(subtotal + ivaMonto);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PedidoLinea, { pedidoId: id });
      for (const linea of lineasNuevas) {
        linea.pedidoId = id;
      }
      await manager.save(PedidoLinea, lineasNuevas);

      await manager.update(Pedido, id, {
        subtotal: subtotal.toFixed(2),
        ivaMonto: ivaMonto.toFixed(2),
        total: total.toFixed(2),
        ...(dto.metodoEntrega !== undefined ? { metodoEntrega: dto.metodoEntrega } : {}),
        ...(empresaNueva !== undefined ? { empresaEncomienda: empresaNueva } : {}),
      });

      // Ajusta lo que bodega tiene reservado según cómo cambiaron las
      // cantidades — mismo colchón de sobreventa que al crear el pedido
      // (ver crear() más arriba). Pedidos de antes del inventario
      // multi-bodega (sin ubicacionId) no tienen de dónde ajustar, así
      // que se saltan esto — el resto de la edición igual se guarda.
      if (pedido.ubicacionId) {
        for (const [varianteId, deltaPares] of ajustesInventario) {
          await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
            ubicacionId: pedido.ubicacionId!,
            varianteId,
            tipo: TipoMovimientoInventario.RESERVA_PEDIDO,
            cantidad: -deltaPares,
            referenciaTipo: PedidosService.REFERENCIA_PEDIDO,
            referenciaId: id,
            creadoPorId: usuarioId,
            colchonNegativo: COLCHON_SOBREVENTA_PARES,
          });
        }
      }

      await manager.save(
        PedidoEdicion,
        manager.create(PedidoEdicion, { pedidoId: id, usuarioId, motivo: dto.motivo?.trim() || null, cambios }),
      );
    });

    return this.buscarPorIdOFallar(id);
  }

  // select.usuario acá abajo, mismo motivo que en listar(): sin esto se
  // filtra el passwordHash del usuario que hizo la edición.
  listarEdiciones(pedidoId: string): Promise<PedidoEdicion[]> {
    return this.pedidoEdicionRepo.find({
      where: { pedidoId },
      relations: { usuario: true },
      select: { usuario: { id: true, nombre: true, email: true, rol: true, activo: true } },
      order: { creadoEn: 'DESC' },
    });
  }

  // El tope de descuento que puede aplicar el vendedor es el MAYOR entre
  // el descuento asignado a este cliente puntual (administración lo pone
  // más alto para clientes que compran mucho) y el tope general que
  // administración configura para cualquier venta (ver ConfiguracionDescuento).
  // Un cliente sin descuento asignado, o un cliente pendiente que todavía
  // no existe en el sistema, solo tienen el tope general.
  private async calcularTopeDescuento(cliente: Cliente | null): Promise<number> {
    const config = await this.configuracionService.obtenerDescuento();
    const topeCliente = Number(cliente?.descuentoPorcentaje ?? 0);
    const topeGeneral = Number(config.descuentoMaximoVendedorPorcentaje);
    return Math.max(topeCliente, topeGeneral);
  }

  // Dos reglas, siempre las dos: el descuento no puede pasar el tope
  // permitido, y el precio resultante no puede quedar por debajo del
  // costo de producción de la variante (si esa variante tiene costo
  // cargado — ver VarianteProducto.costo). Devuelve el precio con
  // descuento ya aplicado, para que el que llama no repita la cuenta.
  private validarDescuentoOFallar(
    descuentoPorcentaje: number,
    topeDescuento: number,
    precioPorPar: string,
    costo: string | null,
    codigoProducto: string,
    color: string,
  ): number {
    if (descuentoPorcentaje > topeDescuento) {
      throw new BadRequestException(
        `El descuento máximo permitido para ${codigoProducto} ${color} es ${topeDescuento}%.`,
      );
    }
    const precioConDescuento = redondear(Number(precioPorPar) * (1 - descuentoPorcentaje / 100));
    if (costo != null && precioConDescuento < Number(costo)) {
      throw new BadRequestException(
        `El descuento deja ${codigoProducto} ${color} en ${formatearColones(precioConDescuento)} — por debajo del costo de producción. Bajá el descuento.`,
      );
    }
    return precioConDescuento;
  }

  // Incremento atómico con UPDATE ... RETURNING: dos vendedores guardando
  // pedidos al mismo tiempo nunca reciben el mismo número (mismo patrón
  // que NumeracionService de facturación en Conejo Motors).
  private async reservarNumeroOrden(manager: DataSource['manager']): Promise<number> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(PedidoContador)
      .values({ id: CONTADOR_ID, ultimo: 0 })
      .orIgnore()
      .execute();

    const res = await manager
      .createQueryBuilder()
      .update(PedidoContador)
      .set({ ultimo: () => 'ultimo + 1' })
      .where('id = :id', { id: CONTADOR_ID })
      .returning('ultimo')
      .execute();

    const nuevo = Number(res.raw?.[0]?.ultimo ?? res.raw?.[0]?.ULTIMO);
    if (!Number.isFinite(nuevo) || nuevo <= 0) {
      throw new Error('No se pudo reservar el número de orden del pedido.');
    }
    return nuevo;
  }
}

function etiquetaMetodoEntrega(metodo: MetodoEntrega | null): string {
  if (metodo === MetodoEntrega.ENCOMIENDA) return 'Encomienda';
  if (metodo === MetodoEntrega.ENTREGA_PROPIA) return 'Entrega propia';
  return '—';
}
