import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PagoRecibido } from './pago-recibido.entity.js';
import { PagoAplicacion } from './pago-aplicacion.entity.js';
import { PagoContador } from './pago-contador.entity.js';
import { CuentasBancariasService } from './cuentas-bancarias.service.js';
import { Factura } from '../facturacion/factura.entity.js';
import { Pedido } from '../pedidos/pedido.entity.js';
import { Cliente } from '../clientes/cliente.entity.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import { EstadoPedido } from '../common/enums/estado-pedido.enum.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import { sumarDias, hoyISO } from '../common/utils/fecha.util.js';
import { redondear } from '../common/utils/dinero.util.js';
import type { AnularPagoDto, CrearPagoDto } from './dto/pagos.dto.js';

const CONTADOR_ID = 'recibos';
const TOLERANCIA = 0.005;
const ORIGEN_PAGO = 'pago_recibido';

export interface FacturaPorCobrar {
  id: string;
  consecutivo: string;
  fecha: string;
  fechaVencimiento: string;
  diasParaVencer: number;
  total: number;
  pagado: number;
  saldo: number;
}

// Lo ya pagado por factura (solo pagos vigentes).
export async function pagadoPorFactura(manager: EntityManager, ids?: string[]): Promise<Map<string, number>> {
  const qb = manager
    .getRepository(PagoAplicacion)
    .createQueryBuilder('a')
    .innerJoin('a.pago', 'p')
    .select('a.factura_id', 'facturaId')
    .addSelect('SUM(a.monto)', 'pagado')
    .where("p.estado = 'vigente'")
    .groupBy('a.factura_id');
  if (ids) {
    if (ids.length === 0) return new Map();
    qb.andWhere('a.factura_id IN (:...ids)', { ids });
  }
  const filas = await qb.getRawMany<{ facturaId: string; pagado: string }>();
  return new Map(filas.map((f) => [f.facturaId, Number(f.pagado)]));
}

@Injectable()
export class PagosService {
  constructor(
    @InjectRepository(PagoRecibido)
    private readonly pagoRepo: Repository<PagoRecibido>,
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,
    private readonly cuentasBancarias: CuentasBancariasService,
    private readonly clientesService: ClientesService,
    private readonly configuracionService: ConfiguracionService,
    private readonly contabilidad: ContabilidadService,
    private readonly dataSource: DataSource,
  ) {}

  // Datos de cobro de una factura (de pedido o manual), sin importar el origen.
  private async datosCobro(manager: EntityManager, f: Factura) {
    if (f.origen === 'manual') {
      return { credito: f.tipoPago === TipoPago.CREDITO, anulada: f.anulada, dias: f.diasCredito ?? 0 };
    }
    const pedido = await manager.findOneByOrFail(Pedido, { id: f.pedidoId! });
    return { credito: pedido.tipoPago === TipoPago.CREDITO, anulada: pedido.estado === EstadoPedido.ANULADO, dias: pedido.diasCredito ?? 0 };
  }

  // Facturas a crédito de un cliente con saldo por cobrar, las más
  // urgentes primero.
  async facturasPorCobrar(clienteId: string): Promise<FacturaPorCobrar[]> {
    const facturas = await this.facturaRepo.find({ where: { clienteId }, relations: { notaCredito: true } });
    const pagado = await pagadoPorFactura(this.dataSource.manager, facturas.map((f) => f.id));
    const hoy = hoyISO();
    const resultado: FacturaPorCobrar[] = [];
    for (const f of facturas) {
      if (f.notaCredito) continue;
      const cobro = await this.datosCobro(this.dataSource.manager, f);
      if (!cobro.credito || cobro.anulada) continue;
      const pag = pagado.get(f.id) ?? 0;
      const saldo = redondear(Number(f.total) - pag);
      if (saldo <= TOLERANCIA) continue;
      const venc = sumarDias(f.fecha, cobro.dias);
      resultado.push({
        id: f.id,
        consecutivo: f.consecutivo,
        fecha: f.fecha,
        fechaVencimiento: venc,
        diasParaVencer: Math.round((Date.parse(venc) - Date.parse(hoy)) / 86_400_000),
        total: Number(f.total),
        pagado: pag,
        saldo,
      });
    }
    return resultado.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  }

  private async siguienteNumero(manager: EntityManager): Promise<number> {
    await manager.createQueryBuilder().insert().into(PagoContador).values({ id: CONTADOR_ID, ultimo: 0 }).orIgnore().execute();
    const res = await manager
      .createQueryBuilder()
      .update(PagoContador)
      .set({ ultimo: () => 'ultimo + 1' })
      .where('id = :id', { id: CONTADOR_ID })
      .returning('ultimo')
      .execute();
    const nuevo = Number(res.raw?.[0]?.ultimo);
    if (!Number.isFinite(nuevo) || nuevo <= 0) throw new Error('No se pudo reservar el número del recibo.');
    return nuevo;
  }

  async crear(dto: CrearPagoDto, usuarioId: string) {
    const cuenta = await this.cuentasBancarias.buscarActivaOFallar(dto.cuentaBancariaId);
    if (Number.isNaN(Date.parse(dto.fecha))) throw new BadRequestException('La fecha no es válida.');
    if (dto.fecha > hoyISO()) throw new BadRequestException('La fecha del pago no puede ser futura.');

    let cliente: Cliente | null = null;
    if (dto.clienteId) cliente = await this.clientesService.buscarPorIdOFallar(dto.clienteId);

    let total: number;
    if (dto.tipo === 'factura') {
      if (!cliente) throw new BadRequestException('Elegí el cliente que pagó.');
      const aplicaciones = (dto.aplicaciones ?? []).filter((a) => a.monto > 0);
      if (aplicaciones.length === 0) throw new BadRequestException('Indicá cuánto se paga a cada factura.');
      if (new Set(aplicaciones.map((a) => a.facturaId)).size !== aplicaciones.length) {
        throw new BadRequestException('Una factura aparece más de una vez.');
      }
      total = redondear(aplicaciones.reduce((a, x) => a + x.monto, 0));
    } else {
      if (!dto.concepto?.trim()) throw new BadRequestException('Anotá de qué es el ingreso.');
      if (!dto.monto) throw new BadRequestException('Indicá el monto.');
      total = redondear(dto.monto);
    }

    const pagoId = await this.dataSource.transaction(async (manager) => {
      const aplicaciones: PagoAplicacion[] = [];
      if (dto.tipo === 'factura') {
        for (const a of dto.aplicaciones!.filter((x) => x.monto > 0)) {
          // Lock de la factura: dos pagos simultáneos no pueden pasarse del saldo.
          const factura = await manager.findOne(Factura, { where: { id: a.facturaId }, lock: { mode: 'pessimistic_write' } });
          if (!factura || factura.clienteId !== cliente!.id) {
            throw new BadRequestException('Una de las facturas no es de este cliente.');
          }
          const cobro = await this.datosCobro(manager, factura);
          if (!cobro.credito) throw new BadRequestException(`La factura ${factura.consecutivo} es de contado: no tiene saldo por cobrar.`);
          const anuladaPorNota = await manager.getRepository(Factura).createQueryBuilder('f').innerJoin('f.notaCredito', 'n').where('f.id = :id', { id: factura.id }).getExists();
          if (cobro.anulada || anuladaPorNota) throw new BadRequestException(`La factura ${factura.consecutivo} está anulada.`);
          const pagado = (await pagadoPorFactura(manager, [factura.id])).get(factura.id) ?? 0;
          const saldo = redondear(Number(factura.total) - pagado);
          if (a.monto > saldo + TOLERANCIA) {
            throw new BadRequestException(
              `La factura ${factura.consecutivo} solo tiene un saldo de ₡${saldo.toLocaleString('es-CR')}: no se puede aplicar más.`,
            );
          }
          aplicaciones.push(Object.assign(new PagoAplicacion(), { facturaId: factura.id, monto: a.monto.toFixed(2) }));
        }
      }

      const numero = await this.siguienteNumero(manager);
      const pago = await manager.save(
        PagoRecibido,
        manager.create(PagoRecibido, {
          numero,
          tipo: dto.tipo,
          clienteId: cliente?.id ?? null,
          cuentaBancariaId: cuenta.id,
          fecha: dto.fecha,
          medioPago: dto.medioPago,
          total: total.toFixed(2),
          concepto: dto.tipo === 'otros' ? dto.concepto!.trim() : null,
          notas: dto.notas?.trim() || null,
          creadoPorId: usuarioId,
          aplicaciones,
        }),
      );

      // Asiento: la plata entra a la cuenta elegida (banco o caja) y sale
      // de cuentas por cobrar — o, en otros ingresos, se reconoce el ingreso.
      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha: dto.fecha,
        descripcion:
          dto.tipo === 'factura'
            ? `Recibo de caja #${numero} — pago de ${cliente!.nombre}`
            : `Recibo de caja #${numero} — ${dto.concepto!.trim()}`,
        origenTipo: ORIGEN_PAGO,
        origenId: pago.id,
        lineas: [
          { codigoCuenta: cuenta.cuentaContable.codigo, debe: total },
          { codigoCuenta: dto.tipo === 'factura' ? CUENTA.CUENTAS_POR_COBRAR : CUENTA.OTROS_INGRESOS, haber: total },
        ],
      });
      return pago.id;
    });
    return this.detalle(pagoId);
  }

  async anular(id: string, dto: AnularPagoDto) {
    const pago = await this.pagoRepo.findOne({ where: { id }, relations: { cuentaBancaria: { cuentaContable: true }, cliente: true } });
    if (!pago) throw new NotFoundException('El recibo no existe.');
    if (pago.estado === 'anulado') throw new BadRequestException('Este recibo ya está anulado.');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(PagoRecibido, id, {
        estado: 'anulado',
        motivoAnulacion: dto.motivo.trim(),
        anuladoEn: new Date(),
      });
      // Se reversa el asiento original (mismo día, mismas cuentas al revés) en vez
      // de armar uno nuevo con la fecha de hoy.
      await this.contabilidad.reversarPorOrigenEnTransaccion(
        manager,
        ORIGEN_PAGO,
        pago.id,
        dto.motivo,
        `Anulación del recibo de caja #${pago.numero}`,
      );
    });
    return this.detalle(id);
  }

  // Los usuarios no se exponen completos: solo id y nombre.
  private limpiar(pago: PagoRecibido) {
    const { creadoPor, ...resto } = pago;
    return { ...resto, creadoPor: creadoPor ? { id: creadoPor.id, nombre: creadoPor.nombre } : null };
  }

  async detalle(id: string) {
    const pago = await this.pagoRepo.findOne({
      where: { id },
      relations: { cliente: true, cuentaBancaria: true, aplicaciones: { factura: true }, creadoPor: true },
    });
    if (!pago) throw new NotFoundException('El recibo no existe.');
    const encabezado = await this.configuracionService.obtenerFactura();
    return {
      ...this.limpiar(pago),
      encabezado: {
        logoUrl: encabezado.logoUrl,
        razonSocial: encabezado.razonSocial,
        cedulaJuridica: encabezado.cedulaJuridica,
        descripcionActividad: encabezado.descripcionActividad,
        direccion: encabezado.direccion,
        telefono: encabezado.telefono,
        correo: encabezado.correo,
      },
    };
  }

  async listar(f: { estado?: string; clienteId?: string; desde?: string; hasta?: string }) {
    const qb = this.pagoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.cliente', 'cliente')
      .innerJoinAndSelect('p.cuentaBancaria', 'cuenta')
      .leftJoinAndSelect('p.aplicaciones', 'a')
      .leftJoinAndSelect('a.factura', 'factura')
      .orderBy('p.fecha', 'DESC')
      .addOrderBy('p.numero', 'DESC')
      .take(500);
    if (f.estado === 'vigente' || f.estado === 'anulado') qb.andWhere('p.estado = :e', { e: f.estado });
    if (f.clienteId) qb.andWhere('p.cliente_id = :c', { c: f.clienteId });
    if (f.desde) qb.andWhere('p.fecha >= :d', { d: f.desde });
    if (f.hasta) qb.andWhere('p.fecha <= :h', { h: f.hasta });
    const pagos = await qb.getMany();
    return pagos.map((p) => ({
      id: p.id,
      numero: p.numero,
      tipo: p.tipo,
      fecha: p.fecha,
      estado: p.estado,
      total: p.total,
      medioPago: p.medioPago,
      concepto: p.concepto,
      cliente: p.cliente ? { id: p.cliente.id, nombre: p.cliente.nombre } : null,
      cuenta: p.cuentaBancaria.nombre,
      facturas: p.aplicaciones.map((a) => a.factura.consecutivo),
    }));
  }
}

