import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PosVenta } from './pos-venta.entity.js';
import { OrdenTienda } from './orden-tienda.entity.js';
import { AsientoContable } from '../contabilidad/asiento-contable.entity.js';
import { ContabilidadService } from '../contabilidad/contabilidad.service.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { numeroTexto } from './pos.service.js';
import { numeroOrdenTexto } from './ordenes-tienda.service.js';

// Durante las pruebas: convierte una venta o un pedido de tienda ya contabilizado en uno "de prueba", borrando sus asientos
// (y las reversas de esos asientos). Solo el administrador del sistema; queda anotado en la bitácora.
@Injectable()
export class PruebasPosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contabilidad: ContabilidadService,
    private readonly bitacora: BitacoraService,
  ) {}

  private async borrarAsientos(manager: EntityManager, origenTipo: string, origenId: string): Promise<number> {
    const originales = await manager.find(AsientoContable, { where: { origenTipo, origenId } });
    if (originales.length === 0) return 0;
    const reversas = await manager.query('SELECT id FROM asientos_contables WHERE origen_tipo = $1 AND origen_id = ANY($2::uuid[])', ['reversa', originales.map((a) => a.id)]);
    const todos = [...originales.map((a) => ({ id: a.id, fecha: a.fecha })), ...(await Promise.all(reversas.map(async (r: { id: string }) => ({ id: r.id, fecha: (await manager.findOneByOrFail(AsientoContable, { id: r.id })).fecha }))))];
    for (const a of todos) {
      if (await this.contabilidad.estaCerrado(manager, a.fecha)) throw new BadRequestException(`El asiento del ${a.fecha} está en un mes ya cerrado: reabra el período antes de borrarlo.`);
    }
    // Primero las reversas (apuntan a los originales); las líneas se borran con su asiento.
    if (reversas.length) await manager.query('DELETE FROM asientos_contables WHERE id = ANY($1::uuid[])', [reversas.map((r: { id: string }) => r.id)]);
    await manager.query('DELETE FROM asientos_contables WHERE id = ANY($1::uuid[])', [originales.map((a) => a.id)]);
    return todos.length;
  }

  async convertirVenta(id: string, actor: { id: string; email: string }, ip?: string) {
    const borrados = await this.dataSource.transaction(async (manager) => {
      const venta = await manager.findOne(PosVenta, { where: { id }, relations: { ubicacion: true } });
      if (!venta) throw new NotFoundException('La venta no existe.');
      if (venta.esPrueba) throw new BadRequestException('Esa venta ya es de prueba.');
      const n = await this.borrarAsientos(manager, 'pos_venta', id);
      await manager.update(PosVenta, id, { esPrueba: true });
      return { n, texto: numeroTexto(venta.ubicacion.codigo, venta.numero) };
    });
    await this.bitacora.registrar({ accion: 'asiento_eliminado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: `venta POS ${borrados.texto}`, detalle: `Convertida en venta de prueba: ${borrados.n} asiento(s) eliminado(s)`, ip });
    return { ok: true, asientosEliminados: borrados.n };
  }

  async convertirOrden(id: string, actor: { id: string; email: string }, ip?: string) {
    const borrados = await this.dataSource.transaction(async (manager) => {
      const orden = await manager.findOne(OrdenTienda, { where: { id }, relations: { ubicacion: true } });
      if (!orden) throw new NotFoundException('El pedido no existe.');
      if (orden.esPrueba) throw new BadRequestException('Ese pedido ya es de prueba.');
      const n = await this.borrarAsientos(manager, 'pos_orden', id);
      await manager.update(OrdenTienda, id, { esPrueba: true });
      return { n, texto: numeroOrdenTexto(orden.ubicacion.codigo, orden.numero) };
    });
    await this.bitacora.registrar({ accion: 'asiento_eliminado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: `pedido de tienda ${borrados.texto}`, detalle: `Convertido en pedido de prueba: ${borrados.n} asiento(s) eliminado(s)`, ip });
    return { ok: true, asientosEliminados: borrados.n };
  }
}
