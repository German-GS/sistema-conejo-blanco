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

  // Existencias que pidieron alerta (stock mínimo) y ya llegaron a ese nivel, más cualquier existencia en negativo.
  // Las agotadas y negativas salen primero.
  async alertas(ubicacionId?: string) {
    const filas: Array<{ ubicacionId: string; ubicacion: string; tipo: string; varianteId: string; codigo: string; nombre: string; color: string; cantidad: number; minimo: number }> = await this.dataSource.query(
      `SELECT s.ubicacion_id AS "ubicacionId", u.nombre AS ubicacion, u.tipo::text AS tipo, s.variante_id AS "varianteId",
              p.codigo, p.nombre, v.color, s.cantidad, s.stock_minimo AS minimo
       FROM stock_ubicaciones s
       JOIN ubicaciones u ON u.id = s.ubicacion_id
       JOIN variantes_producto v ON v.id = s.variante_id
       JOIN productos p ON p.id = v.producto_id
       WHERE u.activa AND v.activo AND p.activo AND NOT p.es_prueba AND ($1::uuid IS NULL OR s.ubicacion_id = $1::uuid)
         AND ((s.stock_minimo > 0 AND s.cantidad <= s.stock_minimo) OR s.cantidad < 0)
       ORDER BY (s.cantidad <= 0) DESC, (s.cantidad - s.stock_minimo) ASC, u.nombre, p.codigo`,
      [ubicacionId ?? null],
    );
    return filas.map((f) => ({ ...f, estado: f.cantidad < 0 ? 'negativo' : f.cantidad === 0 ? 'agotado' : 'bajo' }));
  }

  // Crea la fila de stock si no existía (con 0 pares) para poder dejar el mínimo antes de que llegue mercadería.
  async establecerMinimos(ubicacionId: string, minimos: Array<{ varianteId: string; minimo: number }>): Promise<{ actualizados: number }> {
    await this.dataSource.transaction(async (manager) => {
      for (const m of minimos) {
        const existente = await manager.findOne(StockUbicacion, { where: { ubicacionId, varianteId: m.varianteId } });
        if (existente) await manager.update(StockUbicacion, existente.id, { stockMinimo: m.minimo });
        else await manager.save(StockUbicacion, manager.create(StockUbicacion, { ubicacionId, varianteId: m.varianteId, cantidad: 0, stockMinimo: m.minimo }));
      }
    });
    return { actualizados: minimos.length };
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

  // La mercadería entra SIEMPRE por la bodega de distribución; de ahí sale a las tiendas con un traspaso (pedido de tienda).
  // Así nadie puede registrar existencias por error directo en una tienda.
  async ingresoManual(
    ubicacionId: string,
    varianteId: string,
    cantidad: number,
    creadoPorId: string,
  ): Promise<MovimientoInventario> {
    const [ubicacion] = await this.dataSource.query('SELECT tipo FROM ubicaciones WHERE id = $1', [ubicacionId]);
    if (!ubicacion) throw new BadRequestException('Esa ubicación no existe.');
    if (ubicacion.tipo !== 'bodega_distribucion') {
      throw new BadRequestException('Los ingresos de mercadería solo se registran en la bodega. Para llevarla a una tienda, la tienda hace un pedido y se traspasa desde la bodega.');
    }
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
