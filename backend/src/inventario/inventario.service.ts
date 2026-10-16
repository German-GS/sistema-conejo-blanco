import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StockUbicacion } from './stock-ubicacion.entity.js';
import { MovimientoInventario } from './movimiento-inventario.entity.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';

export interface RegistrarMovimientoParams {
  ubicacionId: string;
  varianteId: string;
  tipo: TipoMovimientoInventario;
  cantidad: number; // con signo: positivo entra, negativo sale
  referenciaTipo?: string;
  referenciaId?: string;
  creadoPorId: string;
  // Solo para casos ya conocidos y deliberados (ej. ajuste de conteo que
  // corrige un descuadre); las ventas y traspasos nunca deben forzarlo.
  permitirNegativo?: boolean;
  // Cuánto puede bajar de 0 sin bloquear, en pares (ej. el colchón de
  // sobreventa de pedidos — ver COLCHON_SOBREVENTA_PARES). Distinto de
  // permitirNegativo: acá SÍ hay un límite, solo que no es cero.
  colchonNegativo?: number;
}

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepo: Repository<MovimientoInventario>,
    @InjectRepository(StockUbicacion)
    private readonly stockRepo: Repository<StockUbicacion>,
    private readonly dataSource: DataSource,
  ) {}

  listarStock(filtros: { ubicacionId?: string; varianteId?: string } = {}): Promise<StockUbicacion[]> {
    return this.stockRepo.find({
      where: {
        ...(filtros.ubicacionId ? { ubicacionId: filtros.ubicacionId } : {}),
        ...(filtros.varianteId ? { varianteId: filtros.varianteId } : {}),
      },
      relations: { ubicacion: true, variante: { producto: true } },
      order: { ubicacion: { nombre: 'ASC' } },
    });
  }

  listarKardex(filtros: { ubicacionId?: string; varianteId?: string } = {}): Promise<MovimientoInventario[]> {
    return this.movimientoRepo.find({
      where: {
        ...(filtros.ubicacionId ? { ubicacionId: filtros.ubicacionId } : {}),
        ...(filtros.varianteId ? { varianteId: filtros.varianteId } : {}),
      },
      relations: { ubicacion: true, variante: { producto: true }, creadoPor: true },
      select: { creadoPor: { id: true, nombre: true } },
      order: { creadoEn: 'DESC' },
      take: 200,
    });
  }

  // Abre su propia transacción — para llamadas independientes (ingreso
  // manual, ajustes). Los flujos que ya están dentro de una transacción
  // propia (traspasos, facturación) usan registrarMovimientoEnTransaccion
  // directamente para que todo quede atómico junto con su propia lógica.
  registrarMovimiento(params: RegistrarMovimientoParams): Promise<MovimientoInventario> {
    return this.dataSource.transaction((manager) => this.registrarMovimientoEnTransaccion(manager, params));
  }

  async registrarMovimientoEnTransaccion(
    manager: EntityManager,
    params: RegistrarMovimientoParams,
  ): Promise<MovimientoInventario> {
    // Lock pesimista sobre la fila de stock: si dos movimientos del mismo
    // (ubicación, variante) llegan al mismo tiempo, el segundo espera a
    // que el primero termine su transacción — así nunca se pisan ni
    // permiten sobregirar el stock por una condición de carrera.
    let stock = await manager.findOne(StockUbicacion, {
      where: { ubicacionId: params.ubicacionId, varianteId: params.varianteId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!stock) {
      stock = manager.create(StockUbicacion, {
        ubicacionId: params.ubicacionId,
        varianteId: params.varianteId,
        cantidad: 0,
      });
    }

    const nuevaCantidad = stock.cantidad + params.cantidad;
    const limiteInferior = params.permitirNegativo ? -Infinity : -(params.colchonNegativo ?? 0);
    if (nuevaCantidad < limiteInferior) {
      throw new BadRequestException(
        params.colchonNegativo
          ? `Stock insuficiente en esa ubicación incluso con el colchón de sobreventa (${params.colchonNegativo} pares): hay ${stock.cantidad} pares disponibles.`
          : `Stock insuficiente en esa ubicación: hay ${stock.cantidad} pares disponibles.`,
      );
    }

    stock.cantidad = nuevaCantidad;
    await manager.save(StockUbicacion, stock);

    const movimiento = manager.create(MovimientoInventario, {
      ubicacionId: params.ubicacionId,
      varianteId: params.varianteId,
      tipo: params.tipo,
      cantidad: params.cantidad,
      referenciaTipo: params.referenciaTipo ?? null,
      referenciaId: params.referenciaId ?? null,
      creadoPorId: params.creadoPorId,
    });
    return manager.save(MovimientoInventario, movimiento);
  }

  ingresoManual(
    ubicacionId: string,
    varianteId: string,
    cantidad: number,
    creadoPorId: string,
  ): Promise<MovimientoInventario> {
    return this.registrarMovimiento({
      ubicacionId,
      varianteId,
      cantidad,
      tipo: TipoMovimientoInventario.INGRESO_INICIAL,
      creadoPorId,
    });
  }

  ajuste(
    ubicacionId: string,
    varianteId: string,
    cantidad: number,
    tipo: 'ajuste_conteo' | 'ajuste_merma',
    creadoPorId: string,
  ): Promise<MovimientoInventario> {
    return this.registrarMovimiento({
      ubicacionId,
      varianteId,
      cantidad,
      tipo: tipo === 'ajuste_conteo' ? TipoMovimientoInventario.AJUSTE_CONTEO : TipoMovimientoInventario.AJUSTE_MERMA,
      creadoPorId,
      permitirNegativo: true,
    });
  }
}
