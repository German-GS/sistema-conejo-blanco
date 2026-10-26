import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { Factura } from './factura.entity.js';
import { NotaCredito } from './nota-credito.entity.js';
import { FacturaLinea } from './factura-linea.entity.js';
import { pagadoPorFactura } from '../pagos/pagos.service.js';
import { NumeracionService } from './numeracion.service.js';
import { EmisionService } from './emision.service.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { CatalogoService } from '../catalogo/catalogo.service.js';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import { Pedido } from '../pedidos/pedido.entity.js';
import type { PedidoLinea } from '../pedidos/pedido-linea.entity.js';
import { EstadoPedido } from '../common/enums/estado-pedido.enum.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import type { Provincia } from '../common/enums/provincia.enum.js';
import { CategoriaFactura } from '../common/enums/categoria-factura.enum.js';
import { sumarDias, diferenciaEnDias, hoyISO } from '../common/utils/fecha.util.js';
import { redondear } from '../common/utils/dinero.util.js';
import { ESTADOS_EMISION, etiquetaEmision } from './estado-emision.js';
import type { EstadoConexionHacienda } from './hacienda-client.interface.js';

export interface ResumenMensual {
  mes: string;
  etiqueta: string;
  contado: number;
  credito: number;
  total: number;
}

export interface FacturaListado {
  id: string;
  consecutivo: string;
  numeroOrden: number | null;
  origen: 'pedido' | 'manual';
  cliente: { id: string; nombre: string; provincia: Provincia | null };
  fecha: string;
  tipoPago: TipoPago;
  categoria: CategoriaFactura;
  diasCredito: number | null;
  fechaVencimiento: string | null;
  diasParaVencer: number | null;
  pagado: string;
  saldo: string;
  subtotal: string;
  ivaMonto: string;
  total: string;
  estadoHacienda: string;
  mensajeHacienda: string | null;
  notaCredito: { id: string; consecutivo: string; fecha: string } | null;
}

export interface NotaCreditoListado {
  id: string;
  consecutivo: string;
  facturaConsecutivo: string;
  pedidoId: string | null;
  numeroOrden: number | null;
  cliente: { id: string; nombre: string };
  fecha: string;
  motivo: string;
  total: string;
  usuario: { id: string; nombre: string } | null;
  estadoHacienda: string;
}

// Lo que define el cobro de una factura sale del pedido (origen 'pedido')
// o de la propia factura (origen 'manual').
function datosCobro(f: Factura): { anulada: boolean; tipoPago: TipoPago; diasCredito: number | null; numeroOrden: number | null } {
  if (f.origen === 'manual') {
    return { anulada: f.anulada, tipoPago: f.tipoPago ?? TipoPago.CONTADO, diasCredito: f.diasCredito, numeroOrden: null };
  }
  const pedido = f.pedido!;
  return {
    anulada: pedido.estado === EstadoPedido.ANULADO,
    tipoPago: pedido.tipoPago,
    diasCredito: pedido.diasCredito,
    numeroOrden: pedido.numeroOrden,
  };
}

const TIPO_FACTURA_ELECTRONICA = '01';
const TIPO_NOTA_CREDITO = '03';
const REFERENCIA_FACTURA = 'factura';
const REFERENCIA_NOTA_CREDITO = 'nota_credito';

@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,
    @InjectRepository(NotaCredito)
    private readonly notaCreditoRepo: Repository<NotaCredito>,
    private readonly numeracionService: NumeracionService,
    private readonly pedidosService: PedidosService,
    private readonly inventarioService: InventarioService,
    private readonly catalogoService: CatalogoService,
    private readonly contabilidadService: ContabilidadService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly emision: EmisionService,
  ) {}

  buscarPorPedidoId(pedidoId: string): Promise<Factura | null> {
    return this.facturaRepo.findOne({ where: { pedidoId } });
  }

  async buscarPorIdOFallar(id: string): Promise<Factura> {
    const factura = await this.facturaRepo.findOne({ where: { id }, relations: { pedido: true, cliente: true } });
    if (!factura) {
      throw new NotFoundException('La factura no existe.');
    }
    return factura;
  }

  // Arma el comprobante a partir de un pedido ya con cliente registrado.
  // Ya NO descuenta inventario acá — eso pasa al crear (o editar) el
  // pedido, para que bodega nunca venda algo que ya no hay (ver
  // PedidosService.crear/editarLineas). Facturar es puramente el momento
  // fiscal/contable: arma el comprobante y registra dos asientos, la
  // venta (ingreso + IVA + cuenta por cobrar/caja) y el costo de lo
  // vendido (gasto contra el inventario que bodega ya había descontado).
  // Todo en una sola transacción. El envío a Hacienda queda en manos del
  // EmisionService (ver emision.service.ts).
  async facturarPedido(pedidoId: string): Promise<Factura> {
    const pedido = await this.pedidosService.buscarPorIdOFallar(pedidoId);

    if (pedido.estado !== EstadoPedido.ACTIVO) {
      throw new BadRequestException('No se puede facturar un pedido anulado.');
    }
    if (!pedido.clienteId) {
      throw new BadRequestException(
        'Este pedido todavía tiene un cliente pendiente de registrar — hay que registrarlo antes de facturar.',
      );
    }
    if (!pedido.ubicacionId) {
      throw new BadRequestException(
        'Este pedido no tiene ubicación de despacho (es un pedido de antes del inventario multi-bodega) — no se puede facturar automáticamente.',
      );
    }
    const existente = await this.buscarPorPedidoId(pedidoId);
    if (existente) {
      throw new BadRequestException('Este pedido ya tiene una factura generada.');
    }

    const sucursal = this.config.get<string>('EMISOR_SUCURSAL', '001');
    const terminal = this.config.get<string>('EMISOR_TERMINAL', '00001');
    const cedulaEmisor = this.config.getOrThrow<string>('EMISOR_CEDULA');

    const facturaId = await this.dataSource.transaction(async (manager) => {
      const secuencial = await this.numeracionService.siguienteSecuencialEnTransaccion(
        manager,
        sucursal,
        terminal,
        TIPO_FACTURA_ELECTRONICA,
      );
      const consecutivo = this.numeracionService.armarConsecutivo({
        sucursal,
        terminal,
        tipo: TIPO_FACTURA_ELECTRONICA,
        secuencial,
      });
      const { clave } = this.numeracionService.armarClave({ cedulaEmisor, consecutivo });

      const factura = manager.create(Factura, {
        pedidoId: pedido.id,
        clienteId: pedido.clienteId!,
        tipoComprobante: TIPO_FACTURA_ELECTRONICA,
        consecutivo,
        claveNumerica: clave,
        fecha: hoyISO(),
        subtotal: pedido.subtotal,
        ivaPorcentaje: pedido.ivaPorcentaje,
        ivaMonto: pedido.ivaMonto,
        total: pedido.total,
      });
      const guardada = await manager.save(Factura, factura);

      // Asiento automático de la venta — partida doble, cuadra siempre
      // porque sale de los mismos subtotal/iva/total ya calculados.
      const subtotal = Number(pedido.subtotal);
      const ivaMonto = Number(pedido.ivaMonto);
      const total = Number(pedido.total);
      const cuentaContrapartida = pedido.tipoPago === TipoPago.CREDITO ? CUENTA.CUENTAS_POR_COBRAR : CUENTA.CAJA;

      await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
        fecha: guardada.fecha,
        descripcion: `Venta — Orden #${pedido.numeroOrden} (factura ${consecutivo})`,
        origenTipo: REFERENCIA_FACTURA,
        origenId: guardada.id,
        lineas: [
          { codigoCuenta: cuentaContrapartida, debe: total },
          { codigoCuenta: CUENTA.VENTAS, haber: subtotal },
          { codigoCuenta: CUENTA.IVA_POR_PAGAR, haber: ivaMonto },
        ],
      });

      // Asiento aparte para el costo de lo vendido — reconoce el gasto
      // contra el inventario que bodega ya había descontado físicamente
      // al crear/editar el pedido (ver PedidosService). Solo cuenta lo
      // que tiene costo cargado en el catálogo (VarianteProducto.costo
      // es opcional) — sin costo no hay con qué armar la línea.
      const costoVentas = await this.calcularCostoVentas(pedido.lineas);
      if (costoVentas > 0) {
        await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
          fecha: guardada.fecha,
          descripcion: `Costo de ventas — Orden #${pedido.numeroOrden} (factura ${consecutivo})`,
          origenTipo: REFERENCIA_FACTURA,
          origenId: guardada.id,
          lineas: [
            { codigoCuenta: CUENTA.COSTO_VENTAS, debe: costoVentas },
            { codigoCuenta: CUENTA.INVENTARIO, haber: costoVentas },
          ],
        });
      }

      return guardada.id;
    });

    // El envío a Hacienda va fuera de la transacción de datos: es una
    // llamada de red (cuando exista de verdad), no debe mantener la
    // transacción de Postgres abierta esperándola.
    await this.emision.enviar(facturaId);
    return this.buscarPorIdOFallar(facturaId);
  }

  // Cuántas facturas hay en cada estado de emisión y qué tan lista está la
  // conexión con Hacienda — para el panel y la bandeja «Para hacer hoy». Las
  // facturas anuladas (con nota de crédito) no cuentan: ya no hay nada que emitir.
  async resumenEmision(): Promise<{
    conexion: EstadoConexionHacienda;
    cantidades: Record<string, number>;
    total: number;
  }> {
    const filas = await this.facturaRepo
      .createQueryBuilder('f')
      .leftJoin('f.notaCredito', 'nc')
      .select('f.estado', 'estado')
      .addSelect('COUNT(*)::int', 'cantidad')
      .where('nc.id IS NULL')
      .groupBy('f.estado')
      .getRawMany<{ estado: string; cantidad: number }>();
    const cantidades = Object.fromEntries(ESTADOS_EMISION.map((e) => [e, 0])) as Record<string, number>;
    for (const fila of filas) cantidades[fila.estado] = Number(fila.cantidad);
    return {
      conexion: (await this.emision.preparacion()).conexion,
      cantidades,
      total: Object.values(cantidades).reduce((a, b) => a + b, 0),
    };
  }

  // Anula una factura ya emitida generando su Nota de Crédito — Hacienda
  // no permite "borrar" ni editar una Factura Electrónica, así que la
  // corrección oficial es este comprobante aparte (tipo '03'), con su
  // propia numeración (mismo NumeracionService que la factura). En una
  // sola transacción: (1) le devuelve a bodega el stock que quedó
  // descontado desde que se creó/editó el pedido (RESERVA_PEDIDO), como
  // DEVOLUCION_VENTA, (2) registra el asiento contable inverso al de la
  // venta y al del costo de ventas, (3) deja el pedido como anulado.
  // Anula la factura COMPLETA — no hay notas de crédito parciales en
  // este sistema todavía, así que solo se puede anular una vez.
  // PENDIENTE(hacienda): la nota de crédito se crea en el sistema pero NO se envía a Hacienda.
  // Una factura aceptada solo se anula de verdad con una nota de crédito electrónica aceptada.
  // Hay que: armar el XML de NotaCreditoElectronica (tipo 03, con InformacionReferencia a la clave de
  // la factura, código 01/02), firmarlo y enviarlo por el mismo HaciendaClient, y darle a NotaCredito
  // los mismos estados de emisión que Factura (estado, xmlEnviado, xmlRespuesta, cron de consulta).
  // Imprescindible ANTES de pasar a producción. Ver docs/FACTURACION_ELECTRONICA.md.
  async anularFactura(facturaId: string, motivo: string, usuarioId: string): Promise<NotaCredito> {
    const factura = await this.buscarPorIdOFallar(facturaId);
    const pagado = (await pagadoPorFactura(this.dataSource.manager, [factura.id])).get(factura.id) ?? 0;
    if (pagado > 0) {
      throw new BadRequestException(
        'Esta factura ya tiene pagos recibidos. Anulá primero esos recibos (Pagos recibidos) y después la factura.',
      );
    }
    if (factura.origen === 'manual') {
      return this.anularFacturaManual(factura, motivo, usuarioId);
    }
    if (factura.pedido!.estado === EstadoPedido.ANULADO) {
      throw new BadRequestException('Esta factura ya fue anulada.');
    }
    const existente = await this.notaCreditoRepo.findOne({ where: { facturaId } });
    if (existente) {
      throw new BadRequestException('Esta factura ya tiene una nota de crédito.');
    }

    const pedido = await this.pedidosService.buscarPorIdOFallar(factura.pedidoId!);
    if (!pedido.ubicacionId) {
      throw new BadRequestException(
        'Este pedido no tiene ubicación de despacho (es un pedido de antes del inventario multi-bodega) — no se puede revertir el inventario automáticamente.',
      );
    }

    const sucursal = this.config.get<string>('EMISOR_SUCURSAL', '001');
    const terminal = this.config.get<string>('EMISOR_TERMINAL', '00001');
    const cedulaEmisor = this.config.getOrThrow<string>('EMISOR_CEDULA');

    const notaId = await this.dataSource.transaction(async (manager) => {
      // Devuelve al stock lo que la factura había descontado — mismo
      // movimiento que usaría una devolución de mercadería.
      for (const linea of pedido.lineas) {
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: pedido.ubicacionId!,
          varianteId: linea.varianteId,
          tipo: TipoMovimientoInventario.DEVOLUCION_VENTA,
          cantidad: linea.pares,
          referenciaTipo: REFERENCIA_NOTA_CREDITO,
          referenciaId: factura.id,
          creadoPorId: usuarioId,
        });
      }

      const secuencial = await this.numeracionService.siguienteSecuencialEnTransaccion(
        manager,
        sucursal,
        terminal,
        TIPO_NOTA_CREDITO,
      );
      const consecutivo = this.numeracionService.armarConsecutivo({
        sucursal,
        terminal,
        tipo: TIPO_NOTA_CREDITO,
        secuencial,
      });
      const { clave } = this.numeracionService.armarClave({ cedulaEmisor, consecutivo });

      const nota = manager.create(NotaCredito, {
        facturaId: factura.id,
        clienteId: factura.clienteId,
        consecutivo,
        claveNumerica: clave,
        fecha: hoyISO(),
        motivo,
        subtotal: factura.subtotal,
        ivaPorcentaje: factura.ivaPorcentaje,
        ivaMonto: factura.ivaMonto,
        total: factura.total,
        usuarioId,
      });
      const guardada = await manager.save(NotaCredito, nota);

      // Asiento inverso al de la venta: lo que era débito pasa a crédito
      // y viceversa, mismas cuentas y montos — siempre cuadra.
      const subtotal = Number(factura.subtotal);
      const ivaMonto = Number(factura.ivaMonto);
      const total = Number(factura.total);
      const cuentaContrapartida = pedido.tipoPago === TipoPago.CREDITO ? CUENTA.CUENTAS_POR_COBRAR : CUENTA.CAJA;

      await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
        fecha: guardada.fecha,
        descripcion: `Nota de crédito ${consecutivo} — Orden #${pedido.numeroOrden} (anula factura ${factura.consecutivo})`,
        origenTipo: REFERENCIA_NOTA_CREDITO,
        origenId: guardada.id,
        lineas: [
          { codigoCuenta: CUENTA.VENTAS, debe: subtotal },
          { codigoCuenta: CUENTA.IVA_POR_PAGAR, debe: ivaMonto },
          { codigoCuenta: cuentaContrapartida, haber: total },
        ],
      });

      // Reversa también el costo de ventas que facturarPedido había
      // reconocido — el inventario ya volvió físicamente arriba, esto
      // deshace el impacto contable para que quede simétrico.
      const costoVentas = await this.calcularCostoVentas(pedido.lineas);
      if (costoVentas > 0) {
        await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
          fecha: guardada.fecha,
          descripcion: `Nota de crédito ${consecutivo} — reversa costo de ventas Orden #${pedido.numeroOrden}`,
          origenTipo: REFERENCIA_NOTA_CREDITO,
          origenId: guardada.id,
          lineas: [
            { codigoCuenta: CUENTA.INVENTARIO, debe: costoVentas },
            { codigoCuenta: CUENTA.COSTO_VENTAS, haber: costoVentas },
          ],
        });
      }

      await manager.update(Pedido, pedido.id, { estado: EstadoPedido.ANULADO });

      return guardada.id;
    });

    return this.buscarNotaCreditoPorIdOFallar(notaId);
  }

  // Anulación de una factura hecha a mano: mismo mecanismo que la de un
  // pedido (nota de crédito + asientos inversos + devolución de stock),
  // pero sin pedido que marcar como anulado — la factura misma queda
  // anulada. El costo de ventas se revierte con el costo congelado en
  // cada línea al emitir, para que quede exactamente simétrico.
  private async anularFacturaManual(factura: Factura, motivo: string, usuarioId: string): Promise<NotaCredito> {
    if (factura.anulada) throw new BadRequestException('Esta factura ya fue anulada.');
    const existente = await this.notaCreditoRepo.findOne({ where: { facturaId: factura.id } });
    if (existente) throw new BadRequestException('Esta factura ya tiene una nota de crédito.');

    const lineas = await this.dataSource.getRepository(FacturaLinea).find({ where: { facturaId: factura.id } });
    const sucursal = this.config.get<string>('EMISOR_SUCURSAL', '001');
    const terminal = this.config.get<string>('EMISOR_TERMINAL', '00001');
    const cedulaEmisor = this.config.getOrThrow<string>('EMISOR_CEDULA');

    const notaId = await this.dataSource.transaction(async (manager) => {
      for (const linea of lineas) {
        if (!linea.varianteId || !factura.ubicacionId) continue;
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: factura.ubicacionId,
          varianteId: linea.varianteId,
          tipo: TipoMovimientoInventario.DEVOLUCION_VENTA,
          cantidad: Math.round(Number(linea.cantidad)),
          referenciaTipo: REFERENCIA_NOTA_CREDITO,
          referenciaId: factura.id,
          creadoPorId: usuarioId,
        });
      }

      const secuencial = await this.numeracionService.siguienteSecuencialEnTransaccion(manager, sucursal, terminal, TIPO_NOTA_CREDITO);
      const consecutivo = this.numeracionService.armarConsecutivo({ sucursal, terminal, tipo: TIPO_NOTA_CREDITO, secuencial });
      const { clave } = this.numeracionService.armarClave({ cedulaEmisor, consecutivo });

      const nota = await manager.save(
        NotaCredito,
        manager.create(NotaCredito, {
          facturaId: factura.id,
          clienteId: factura.clienteId,
          consecutivo,
          claveNumerica: clave,
          fecha: hoyISO(),
          motivo,
          subtotal: factura.subtotal,
          ivaPorcentaje: factura.ivaPorcentaje,
          ivaMonto: factura.ivaMonto,
          total: factura.total,
          usuarioId,
        }),
      );

      const subtotal = Number(factura.subtotal);
      const ivaMonto = Number(factura.ivaMonto);
      const total = Number(factura.total);
      const contrapartida = factura.tipoPago === TipoPago.CREDITO ? CUENTA.CUENTAS_POR_COBRAR : CUENTA.CAJA;
      await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
        fecha: nota.fecha,
        descripcion: `Nota de crédito ${consecutivo} (anula factura manual ${factura.consecutivo})`,
        origenTipo: REFERENCIA_NOTA_CREDITO,
        origenId: nota.id,
        lineas: [
          { codigoCuenta: CUENTA.VENTAS, debe: subtotal },
          ...(ivaMonto > 0 ? [{ codigoCuenta: CUENTA.IVA_POR_PAGAR, debe: ivaMonto }] : []),
          { codigoCuenta: contrapartida, haber: total },
        ],
      });

      const costoVentas = redondear(
        lineas.reduce((a, l) => a + (l.varianteId && l.costoUnitario != null ? Number(l.costoUnitario) * Number(l.cantidad) : 0), 0),
      );
      if (costoVentas > 0) {
        await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
          fecha: nota.fecha,
          descripcion: `Nota de crédito ${consecutivo} — reversa costo de ventas factura manual ${factura.consecutivo}`,
          origenTipo: REFERENCIA_NOTA_CREDITO,
          origenId: nota.id,
          lineas: [
            { codigoCuenta: CUENTA.INVENTARIO, debe: costoVentas },
            { codigoCuenta: CUENTA.COSTO_VENTAS, haber: costoVentas },
          ],
        });
      }

      await manager.update(Factura, factura.id, { anulada: true });
      return nota.id;
    });

    return this.buscarNotaCreditoPorIdOFallar(notaId);
  }

  // Suma pares × costo de cada línea, usando el costo ACTUAL de la
  // variante (igual que el piso de margen de PedidosService — no queda
  // congelado en el pedido). Líneas de una variante sin costo cargado
  // simplemente no aportan nada: no se puede reconocer un costo que el
  // catálogo no tiene.
  private async calcularCostoVentas(lineas: PedidoLinea[]): Promise<number> {
    let total = 0;
    for (const linea of lineas) {
      const variante = await this.catalogoService.buscarVarianteParaVenta(linea.varianteId);
      if (variante.costo != null) {
        total += linea.pares * Number(variante.costo);
      }
    }
    return redondear(total);
  }

  private async buscarNotaCreditoPorIdOFallar(id: string): Promise<NotaCredito> {
    const nota = await this.notaCreditoRepo.findOne({
      where: { id },
      relations: { factura: { pedido: true }, cliente: true, usuario: true },
      select: { usuario: { id: true, nombre: true, email: true, rol: true, activo: true } },
    });
    if (!nota) {
      throw new NotFoundException('La nota de crédito no existe.');
    }
    return nota;
  }

  // select.usuario acá abajo, mismo motivo que en otros listar(): sin
  // esto se filtra el passwordHash del usuario que anuló la factura.
  async listarNotasCredito(): Promise<NotaCreditoListado[]> {
    const notas = await this.notaCreditoRepo.find({
      relations: { factura: { pedido: true }, cliente: true, usuario: true },
      select: { usuario: { id: true, nombre: true, email: true, rol: true, activo: true } },
      order: { creadoEn: 'DESC' },
    });
    return notas.map((n) => ({
      id: n.id,
      consecutivo: n.consecutivo,
      facturaConsecutivo: n.factura.consecutivo,
      pedidoId: n.factura.pedido?.id ?? null,
      numeroOrden: n.factura.pedido?.numeroOrden ?? null,
      cliente: { id: n.cliente.id, nombre: n.cliente.nombre },
      fecha: n.fecha,
      motivo: n.motivo,
      total: n.total,
      usuario: n.usuario ? { id: n.usuario.id, nombre: n.usuario.nombre } : null,
      estadoHacienda: n.estado,
    }));
  }

  // Todas las facturas, con una categoría de cobro calculada a partir del
  // pedido detrás (no hay módulo de cuentas por cobrar todavía, así que
  // no existe un "ya cobrada" real — ver CategoriaFactura):
  //   - anulada: el pedido detrás fue anulado.
  //   - cancelada: pedido a contado, ya cobrada al momento de facturar.
  //   - pendiente: pedido a crédito, todavía por cobrar — la única
  //     categoría con fecha de vencimiento.
  // filtros.clienteId/provincia aplican siempre; filtros.estado filtra por
  // categoría (pensado sobre todo para "pendiente", donde además importa
  // el orden por días para vencer).
  async listarFacturas(filtros: {
    estado?: CategoriaFactura;
    // Estado de emisión ante Hacienda (pendiente_envio, enviada, aceptada, rechazada).
    emision?: string;
    clienteId?: string;
    provincia?: Provincia;
    vencimiento?: 'vencidas' | 'proximos_7' | 'proximos_30';
  }): Promise<FacturaListado[]> {
    const facturas = await this.facturaRepo.find({
      where: {
        ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
        ...(filtros.emision && ESTADOS_EMISION.includes(filtros.emision) ? { estado: filtros.emision as Factura['estado'] } : {}),
        ...(filtros.provincia ? { cliente: { provincia: filtros.provincia } } : {}),
      },
      relations: { cliente: true, pedido: true, notaCredito: true },
    });

    const hoy = hoyISO();
    const pagados = await pagadoPorFactura(this.dataSource.manager);
    const listado: FacturaListado[] = facturas.map((f) => {
      const cobro = datosCobro(f);
      const pagado = cobro.tipoPago === TipoPago.CREDITO ? (pagados.get(f.id) ?? 0) : Number(f.total);
      const saldo = redondear(Number(f.total) - pagado);
      // A crédito: pendiente mientras quede saldo; cancelada (saldada) cuando se pagó completa.
      const categoria = cobro.anulada
        ? CategoriaFactura.ANULADA
        : cobro.tipoPago === TipoPago.CREDITO && saldo > 0.005
          ? CategoriaFactura.PENDIENTE
          : CategoriaFactura.CANCELADA;

      const esPendiente = categoria === CategoriaFactura.PENDIENTE;
      const fechaVencimiento = esPendiente ? sumarDias(f.fecha, cobro.diasCredito ?? 0) : null;

      return {
        id: f.id,
        consecutivo: f.consecutivo,
        numeroOrden: cobro.numeroOrden,
        origen: f.origen,
        cliente: { id: f.cliente.id, nombre: f.cliente.nombre, provincia: f.cliente.provincia },
        fecha: f.fecha,
        tipoPago: cobro.tipoPago,
        categoria,
        diasCredito: cobro.diasCredito,
        fechaVencimiento,
        diasParaVencer: fechaVencimiento ? diferenciaEnDias(fechaVencimiento, hoy) : null,
        pagado: redondear(pagado).toFixed(2),
        saldo: (categoria === CategoriaFactura.ANULADA ? 0 : Math.max(0, saldo)).toFixed(2),
        subtotal: f.subtotal,
        ivaMonto: f.ivaMonto,
        total: f.total,
        estadoHacienda: f.estado,
        mensajeHacienda: f.mensajeHacienda,
        notaCredito: f.notaCredito
          ? { id: f.notaCredito.id, consecutivo: f.notaCredito.consecutivo, fecha: f.notaCredito.fecha }
          : null,
      };
    });

    let filtrado = filtros.estado ? listado.filter((f) => f.categoria === filtros.estado) : listado;

    // Solo tiene sentido sobre facturas con vencimiento (pendientes) — en
    // el resto diasParaVencer es null y simplemente no matchean.
    if (filtros.vencimiento === 'vencidas') {
      filtrado = filtrado.filter((f) => f.diasParaVencer != null && f.diasParaVencer < 0);
    } else if (filtros.vencimiento === 'proximos_7') {
      filtrado = filtrado.filter((f) => f.diasParaVencer != null && f.diasParaVencer >= 0 && f.diasParaVencer <= 7);
    } else if (filtros.vencimiento === 'proximos_30') {
      filtrado = filtrado.filter((f) => f.diasParaVencer != null && f.diasParaVencer >= 0 && f.diasParaVencer <= 30);
    }

    // Pendientes ordenadas por lo más urgente primero; el resto por fecha
    // de factura más reciente primero.
    return filtrado.sort((a, b) => {
      if (a.diasParaVencer != null && b.diasParaVencer != null) return a.diasParaVencer - b.diasParaVencer;
      return b.fecha.localeCompare(a.fecha);
    });
  }

  // Mismo listado que listarFacturas, en un .xlsx descargable — para que
  // administración/contador se lo lleven a una reunión o se lo pasen al
  // contador externo sin tener que copiar la tabla a mano.
  async generarExcelFacturas(filtros: {
    estado?: CategoriaFactura;
    emision?: string;
    clienteId?: string;
    provincia?: Provincia;
    vencimiento?: 'vencidas' | 'proximos_7' | 'proximos_30';
  }): Promise<Buffer> {
    const facturas = await this.listarFacturas(filtros);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    libro.created = new Date();
    const hoja = libro.addWorksheet('Facturas');

    hoja.columns = [
      { header: 'Consecutivo', key: 'consecutivo', width: 24 },
      { header: 'Orden #', key: 'numeroOrden', width: 10 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Provincia', key: 'provincia', width: 14 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Tipo de pago', key: 'tipoPago', width: 14 },
      { header: 'Categoría', key: 'categoria', width: 14 },
      { header: 'Vence', key: 'fechaVencimiento', width: 12 },
      { header: 'Días para vencer', key: 'diasParaVencer', width: 16 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'IVA', key: 'ivaMonto', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Estado de emisión', key: 'estadoHacienda', width: 20 },
      { header: 'Nota de crédito', key: 'notaCredito', width: 24 },
    ];
    hoja.getRow(1).font = { bold: true };

    for (const f of facturas) {
      hoja.addRow({
        consecutivo: f.consecutivo,
        numeroOrden: f.numeroOrden ?? 'Manual',
        cliente: f.cliente.nombre,
        provincia: f.cliente.provincia ? etiquetaProvincia(f.cliente.provincia) : '',
        fecha: f.fecha,
        tipoPago: f.tipoPago === TipoPago.CREDITO ? 'Crédito' : 'Contado',
        categoria: etiquetaCategoria(f.categoria),
        fechaVencimiento: f.fechaVencimiento ?? '',
        diasParaVencer: f.diasParaVencer ?? '',
        subtotal: Number(f.subtotal),
        ivaMonto: Number(f.ivaMonto),
        total: Number(f.total),
        estadoHacienda: etiquetaEmision(f.estadoHacienda),
        notaCredito: f.notaCredito?.consecutivo ?? '',
      });
    }
    for (const columna of ['subtotal', 'ivaMonto', 'total']) {
      hoja.getColumn(columna).numFmt = '#,##0.00';
    }

    const buffer = await libro.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Ventas facturadas por mes (últimos `meses`, incluye el actual),
  // separadas por tipo de pago — para el gráfico de rendimiento del
  // dashboard. Las facturas de pedidos anulados no cuentan como venta.
  async resumenMensual(meses: number): Promise<ResumenMensual[]> {
    const facturas = await this.facturaRepo.find({ relations: { pedido: true } });
    const validas = facturas.filter((f) => !datosCobro(f).anulada);

    const hoy = new Date();
    const claves: string[] = [];
    const buckets: Record<string, { etiqueta: string; contado: number; credito: number }> = {};
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      claves.push(clave);
      buckets[clave] = { etiqueta: NOMBRES_MES[d.getUTCMonth()], contado: 0, credito: 0 };
    }

    for (const f of validas) {
      const clave = f.fecha.slice(0, 7);
      const balde = buckets[clave];
      if (!balde) continue; // factura fuera del rango de meses pedido
      if (datosCobro(f).tipoPago === TipoPago.CREDITO) balde.credito += Number(f.total);
      else balde.contado += Number(f.total);
    }

    return claves.map((clave) => ({
      mes: clave,
      etiqueta: buckets[clave].etiqueta,
      contado: redondear(buckets[clave].contado),
      credito: redondear(buckets[clave].credito),
      total: redondear(buckets[clave].contado + buckets[clave].credito),
    }));
  }
}

const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const ETIQUETAS_PROVINCIA: Record<string, string> = {
  san_jose: 'San José',
  alajuela: 'Alajuela',
  cartago: 'Cartago',
  heredia: 'Heredia',
  guanacaste: 'Guanacaste',
  puntarenas: 'Puntarenas',
  limon: 'Limón',
};

function etiquetaProvincia(provincia: string): string {
  return ETIQUETAS_PROVINCIA[provincia] ?? provincia;
}

function etiquetaCategoria(categoria: CategoriaFactura): string {
  if (categoria === CategoriaFactura.CANCELADA) return 'Cancelada';
  if (categoria === CategoriaFactura.PENDIENTE) return 'Pendiente';
  return 'Anulada';
}
