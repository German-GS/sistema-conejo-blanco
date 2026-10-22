import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { StockUbicacion } from '../inventario/stock-ubicacion.entity.js';
import { MovimientoInventario } from '../inventario/movimiento-inventario.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import type { PosAjusteDto } from './dto/pos.dto.js';

const REFERENCIA = 'ajuste_tienda';

export interface ResultadoAjusteSync {
  id: string;
  estado: 'ok' | 'duplicada' | 'error';
  mensaje?: string;
}

// Conteo de inventario en la tienda: la tienda solo puede SUBIR su existencia (lo que baja, baja por ventas). Cada conteo queda en el
// kardex y en la bitácora (visible para el administrador del sistema). No genera asiento contable.
@Injectable()
export class AjustesTiendaService {
  private readonly logger = new Logger(AjustesTiendaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly inventario: InventarioService,
    private readonly bitacora: BitacoraService,
  ) {}

  async guardar(tienda: Ubicacion, usuarioId: string, a: PosAjusteDto): Promise<ResultadoAjusteSync> {
    try {
      const detalle = await this.dataSource.transaction(async (manager) => {
        // Si ya se recibió (reintento por una respuesta perdida) no se suma otra vez.
        if (await manager.exists(MovimientoInventario, { where: { referenciaTipo: REFERENCIA, referenciaId: a.id } })) return null;
        const partes: string[] = [];
        for (const l of a.lineas) {
          const variante = await manager.findOne(VarianteProducto, { where: { id: l.varianteId }, relations: { producto: true } });
          if (!variante) throw new Error('Un producto del conteo ya no existe en el catálogo.');
          const antes = (await manager.findOne(StockUbicacion, { where: { ubicacionId: tienda.id, varianteId: l.varianteId } }))?.cantidad ?? 0;
          await this.inventario.registrarMovimientoEnTransaccion(manager, {
            ubicacionId: tienda.id,
            varianteId: l.varianteId,
            tipo: TipoMovimientoInventario.AJUSTE_CONTEO,
            cantidad: l.cantidad,
            referenciaTipo: REFERENCIA,
            referenciaId: a.id,
            creadoPorId: usuarioId,
          });
          partes.push(`${variante.producto.codigo} ${variante.color} +${l.cantidad} (${antes}→${antes + l.cantidad})`);
        }
        return partes.join('; ');
      });
      if (detalle === null) return { id: a.id, estado: 'duplicada' };
      const usuario = await this.dataSource.getRepository(Usuario).findOne({ where: { id: usuarioId }, select: { id: true, email: true } });
      await this.bitacora.registrar({
        accion: 'inventario_tienda_aumentado',
        usuarioId,
        usuarioEmail: usuario?.email ?? '',
        objetivo: tienda.nombre,
        detalle: `${a.nota.trim()} — ${detalle}`.slice(0, 500),
      });
      return { id: a.id, estado: 'ok' };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo guardar el conteo.';
      this.logger.warn(`Conteo de tienda ${a.id} rechazado: ${mensaje}`);
      return { id: a.id, estado: 'error', mensaje };
    }
  }
}
