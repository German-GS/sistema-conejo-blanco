import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Factura } from './factura.entity.js';
import { FacturaLinea } from './factura-linea.entity.js';
import { NumeracionService } from './numeracion.service.js';
import { HACIENDA_CLIENT, type HaciendaClient } from './hacienda-client.interface.js';
import type { CrearFacturaManualDto } from './dto/crear-factura-manual.dto.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { CatalogoService } from '../catalogo/catalogo.service.js';
import { CuentasBancariasService } from '../pagos/cuentas-bancarias.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import { COLCHON_SOBREVENTA_PARES } from '../common/constants/negocio.constant.js';
import { hoyISO, sumarDias } from '../common/utils/fecha.util.js';
import { redondear } from '../common/utils/dinero.util.js';

const TIPO_FACTURA_ELECTRONICA = '01';
const REFERENCIA_FACTURA = 'factura';

export interface DocumentoFactura {
  id: string;
  origen: 'pedido' | 'manual';
  consecutivo: string;
  fecha: string;
  fechaVencimiento: string;
  condicion: string;
  medioPago: string | null;
  ordenCompra: string | null;
  vendedor: string | null;
  anulada: boolean;
  estadoHacienda: string;
  encabezado: Record<string, string | null>;
  cliente: { nombre: string; cedula: string; telefono: string; email: string; direccion: string | null };
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuentoPorcentaje: number;
    impuestoPorcentaje: number;
    subtotal: number;
  }>;
  totales: { subtotalBruto: number; descuento: number; subtotal: number; impuestos: number; total: number };
  notas: string | null;
  terminos: string | null;
  leyenda: string | null;
}

// Calcula una línea: cantidad × precio, menos descuento %, más impuesto %.
export function calcularLinea(cantidad: number, precio: number, descuentoPct: number, impuestoPct: number) {
  const bruto = redondear(cantidad * precio);
  const descuento = redondear(bruto * (descuentoPct / 100));
  const subtotal = redondear(bruto - descuento);
  const impuesto = redondear(subtotal * (impuestoPct / 100));
  return { bruto, descuento, subtotal, impuesto };
}

// Factura hecha a mano (sin pedido): el encabezado, los textos y las
// líneas los arma administración — ver ConfiguracionFactura.
@Injectable()
export class FacturaManualService {
  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,
    private readonly numeracionService: NumeracionService,
    private readonly clientesService: ClientesService,
    private readonly ubicacionesService: UbicacionesService,
    private readonly inventarioService: InventarioService,
    private readonly catalogoService: CatalogoService,
    private readonly configuracionService: ConfiguracionService,
    private readonly cuentasBancarias: CuentasBancariasService,
    private readonly contabilidadService: ContabilidadService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @Inject(HACIENDA_CLIENT) private readonly haciendaClient: HaciendaClient,
  ) {}

  async crear(dto: CrearFacturaManualDto, usuarioId: string): Promise<Factura> {
    const cliente = await this.clientesService.buscarPorIdOFallar(dto.clienteId);
    if (dto.tipoPago === TipoPago.CREDITO && !dto.diasCredito) {
      throw new BadRequestException('Indique los días de crédito.');
    }
    const fecha = dto.fecha ?? hoyISO();
    if (Number.isNaN(Date.parse(fecha))) throw new BadRequestException('La fecha no es válida.');

    // Cada línea: o es un producto del catálogo (descuenta stock) o es
    // libre y necesita descripción.
    const hayCatalogo = dto.lineas.some((l) => l.varianteId);
    const ubicacion = hayCatalogo
      ? dto.ubicacionId
        ? await this.ubicacionesService.buscarPorIdOFallar(dto.ubicacionId)
        : await this.ubicacionesService.buscarBodegaCentralOFallar()
      : null;
    if (ubicacion && !ubicacion.permiteVenta) {
      throw new BadRequestException(`Desde "${ubicacion.nombre}" no se puede vender: elija otra ubicación.`);
    }

    const lineas: Array<Partial<FacturaLinea> & { cantidadNum: number; costo: number | null }> = [];
    let subtotal = 0;
    let descuentoTotal = 0;
    let impuestos = 0;
    for (const [i, l] of dto.lineas.entries()) {
      let descripcion = l.descripcion?.trim() ?? '';
      let costo: number | null = null;
      if (l.varianteId) {
        if (!Number.isInteger(l.cantidad)) {
          throw new BadRequestException('Los productos del catálogo se facturan en pares enteros.');
        }
        const variante = await this.catalogoService.buscarVarianteParaVenta(l.varianteId);
        const producto = await this.catalogoService.buscarProductoPorIdOFallar(variante.productoId);
        if (!descripcion) descripcion = `${producto.codigo} — ${producto.nombre} (${variante.color})`;
        costo = variante.costo != null ? Number(variante.costo) : null;
      }
      if (!descripcion) throw new BadRequestException(`La línea ${i + 1} necesita una descripción.`);

      const c = calcularLinea(l.cantidad, l.precioUnitario, l.descuentoPorcentaje ?? 0, l.impuestoPorcentaje);
      subtotal += c.subtotal;
      descuentoTotal += c.descuento;
      impuestos += c.impuesto;
      lineas.push({
        varianteId: l.varianteId ?? null,
        orden: i + 1,
        descripcion,
        cantidad: l.cantidad.toFixed(2),
        precioUnitario: l.precioUnitario.toFixed(2),
        descuentoPorcentaje: (l.descuentoPorcentaje ?? 0).toFixed(2),
        impuestoPorcentaje: l.impuestoPorcentaje.toFixed(2),
        costoUnitario: costo != null ? costo.toFixed(2) : null,
        subtotal: c.subtotal.toFixed(2),
        impuestoMonto: c.impuesto.toFixed(2),
        cantidadNum: l.cantidad,
        costo,
      });
    }
    subtotal = redondear(subtotal);
    descuentoTotal = redondear(descuentoTotal);
    impuestos = redondear(impuestos);
    const total = redondear(subtotal + impuestos);
    if (total <= 0) throw new BadRequestException('El total de la factura debe ser mayor a cero.');

    const tasas = new Set(dto.lineas.map((l) => l.impuestoPorcentaje));
    const ivaPorcentaje = tasas.size === 1 ? [...tasas][0] : 0;

    const encabezado = await this.configuracionService.obtenerFactura();
    const cuentasBancarias = await this.cuentasBancarias.textoParaFactura();
    const por = (valor: string | undefined, predeterminado: string) => (valor !== undefined ? valor : predeterminado);

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
        pedidoId: null,
        origen: 'manual',
        clienteId: cliente.id,
        tipoComprobante: TIPO_FACTURA_ELECTRONICA,
        consecutivo,
        claveNumerica: clave,
        fecha,
        subtotal: subtotal.toFixed(2),
        descuentoTotal: descuentoTotal.toFixed(2),
        ivaPorcentaje: ivaPorcentaje.toFixed(2),
        ivaMonto: impuestos.toFixed(2),
        total: total.toFixed(2),
        tipoPago: dto.tipoPago,
        diasCredito: dto.tipoPago === TipoPago.CREDITO ? dto.diasCredito! : null,
        medioPago: dto.medioPago,
        ordenCompra: dto.ordenCompra?.trim() || null,
        vendedor: dto.vendedor?.trim() || null,
        ubicacionId: ubicacion?.id ?? null,
        notas: por(dto.notas, encabezado.notasPredeterminadas) || null,
        terminos: por(dto.terminos, encabezado.terminosCondiciones) || null,
        leyenda: por(dto.leyenda, encabezado.leyendaAutorizacion) || null,
        encabezado: {
          logoUrl: encabezado.logoUrl,
          razonSocial: encabezado.razonSocial,
          cedulaJuridica: encabezado.cedulaJuridica,
          descripcionActividad: encabezado.descripcionActividad,
          actividadEconomica: encabezado.actividadEconomica,
          correo: encabezado.correo,
          telefono: encabezado.telefono,
          direccion: encabezado.direccion,
          cuentasBancarias,
        },
        lineas: lineas.map(({ cantidadNum: _c, costo: _k, ...resto }) => Object.assign(new FacturaLinea(), resto)),
      });
      const guardada = await manager.save(Factura, factura);

      // Stock de las líneas de catálogo.
      for (const l of lineas) {
        if (!l.varianteId) continue;
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: ubicacion!.id,
          varianteId: l.varianteId,
          tipo: TipoMovimientoInventario.VENTA_MANUAL,
          cantidad: -l.cantidadNum,
          referenciaTipo: REFERENCIA_FACTURA,
          referenciaId: guardada.id,
          creadoPorId: usuarioId,
          colchonNegativo: COLCHON_SOBREVENTA_PARES,
        });
      }

      const contrapartida = dto.tipoPago === TipoPago.CREDITO ? CUENTA.CUENTAS_POR_COBRAR : CUENTA.CAJA;
      await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
        fecha,
        descripcion: `Venta — factura manual ${consecutivo}`,
        origenTipo: REFERENCIA_FACTURA,
        origenId: guardada.id,
        lineas: [
          { codigoCuenta: contrapartida, debe: total },
          { codigoCuenta: CUENTA.VENTAS, haber: subtotal },
          ...(impuestos > 0 ? [{ codigoCuenta: CUENTA.IVA_POR_PAGAR, haber: impuestos }] : []),
        ],
      });

      const costoVentas = redondear(lineas.reduce((a, l) => a + (l.varianteId && l.costo != null ? l.costo * l.cantidadNum : 0), 0));
      if (costoVentas > 0) {
        await this.contabilidadService.registrarAsientoEnTransaccion(manager, {
          fecha,
          descripcion: `Costo de ventas — factura manual ${consecutivo}`,
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

    const guardada = await this.facturaRepo.findOneOrFail({ where: { id: facturaId }, relations: { cliente: true } });
    const resultado = await this.haciendaClient.enviar(guardada);
    guardada.estado = resultado.estado;
    guardada.mensajeHacienda = resultado.mensaje;
    await this.facturaRepo.save(guardada);
    return guardada;
  }

  // Todo lo que hace falta para mostrar/imprimir una factura (de pedido o
  // manual) con el mismo formato.
  async documento(id: string): Promise<DocumentoFactura> {
    const f = await this.facturaRepo.findOne({
      where: { id },
      relations: { cliente: true, lineas: true, pedido: { lineas: true, vendedor: true }, notaCredito: true },
      order: { lineas: { orden: 'ASC' } },
    });
    if (!f) throw new NotFoundException('La factura no existe.');

    const manual = f.origen === 'manual';
    const actual = await this.configuracionService.obtenerFactura();
    const encabezado = manual && f.encabezado
      ? f.encabezado
      : {
          logoUrl: actual.logoUrl,
          razonSocial: actual.razonSocial,
          cedulaJuridica: actual.cedulaJuridica,
          descripcionActividad: actual.descripcionActividad,
          actividadEconomica: actual.actividadEconomica,
          correo: actual.correo,
          telefono: actual.telefono,
          direccion: actual.direccion,
          cuentasBancarias: await this.cuentasBancarias.textoParaFactura(),
        };

    const tipoPago = manual ? (f.tipoPago ?? TipoPago.CONTADO) : f.pedido!.tipoPago;
    const dias = manual ? f.diasCredito : f.pedido!.diasCredito;
    const credito = tipoPago === TipoPago.CREDITO;
    const anulada = manual ? f.anulada : f.pedido!.estado === 'anulado';

    const lineas = manual
      ? f.lineas.map((l) => ({
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
          descuentoPorcentaje: Number(l.descuentoPorcentaje),
          impuestoPorcentaje: Number(l.impuestoPorcentaje),
          subtotal: Number(l.subtotal),
        }))
      : f.pedido!.lineas.map((l) => ({
          descripcion: `${l.codigoProducto} — ${l.nombreProducto} (${l.color})`,
          cantidad: l.pares,
          precioUnitario: Number(l.precioPorPar),
          descuentoPorcentaje: Number(l.descuentoPorcentaje),
          impuestoPorcentaje: Number(f.ivaPorcentaje),
          subtotal: Number(l.montoLinea),
        }));

    const subtotalBruto = redondear(lineas.reduce((a, l) => a + l.cantidad * l.precioUnitario, 0));
    const subtotal = Number(f.subtotal);
    return {
      id: f.id,
      origen: f.origen,
      consecutivo: f.consecutivo,
      fecha: f.fecha,
      fechaVencimiento: credito ? sumarDias(f.fecha, dias ?? 0) : f.fecha,
      condicion: credito ? `Crédito ${dias ?? 0} días` : 'Contado',
      medioPago: manual ? f.medioPago : null,
      ordenCompra: manual ? f.ordenCompra : null,
      vendedor: manual ? f.vendedor : (f.pedido!.vendedor?.nombre ?? null),
      anulada: anulada || Boolean(f.notaCredito),
      estadoHacienda: f.estado,
      encabezado,
      cliente: {
        nombre: f.cliente.nombre,
        cedula: f.cliente.cedula,
        telefono: f.cliente.telefono,
        email: f.cliente.email,
        direccion: f.cliente.direccion,
      },
      lineas,
      totales: {
        subtotalBruto,
        descuento: redondear(subtotalBruto - subtotal),
        subtotal,
        impuestos: Number(f.ivaMonto),
        total: Number(f.total),
      },
      notas: manual ? f.notas : null,
      terminos: manual ? f.terminos : null,
      leyenda: manual ? f.leyenda : actual.leyendaAutorizacion || null,
    };
  }
}
