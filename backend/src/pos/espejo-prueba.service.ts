import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

// «Espejo» de prueba: al encender el modo de prueba se copia el inventario real de cada tienda como productos de prueba (mismos nombres,
// precios, costos y existencias) para hacer demostraciones y capacitar con datos reales sin tocar nada real. Al apagarlo, la copia y todo
// lo que se hizo con ella (ventas de caja, pedidos, traspasos, existencias y movimientos) se borra. Nada de esto genera asientos.
// La copia lleva `copia_de_id` apuntando al original, así se distingue de los productos de prueba que se crean a mano (esos no se tocan).
@Injectable()
export class EspejoPruebaService {
  constructor(private readonly dataSource: DataSource) {}

  // Borra la copia anterior (si había) y la vuelve a crear con lo que hay hoy en el inventario real.
  async regenerar(usuarioId: string): Promise<{ productos: number; unidades: number }> {
    return this.dataSource.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(7301)');
      await this.borrarEn(m);
      return this.crearEn(m, usuarioId, null);
    });
  }

  // Con el modo de prueba encendido toda tienda debe tener su copia: si una no la tiene (por ejemplo, se encendió antes de que existiera la
  // función, o la tienda es nueva), se crea sola la primera vez que su caja pide el catálogo. Es seguro llamarla varias veces a la vez.
  async asegurarDeTienda(ubicacionId: string, usuarioId: string): Promise<void> {
    const [{ n }] = await this.dataSource.query('SELECT COUNT(*)::int AS n FROM productos WHERE copia_de_id IS NOT NULL AND ubicacion_exclusiva_id = $1', [ubicacionId]);
    if (n > 0) return;
    await this.dataSource.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(7301)');
      await this.crearEn(m, usuarioId, ubicacionId);
    });
  }

  // Todos los pasos son idempotentes (no repiten lo que ya existe), así que crear dos veces seguidas no duplica nada.
  private async crearEn(m: EntityManager, usuarioId: string, ubicacionId: string | null): Promise<{ productos: number; unidades: number }> {
    // Un producto por (tienda, producto real) que tenga existencia registrada en esa tienda. El código lleva el de la tienda para no chocar.
    await m.query(
      `INSERT INTO productos (codigo, nombre, descripcion, cabys, activo, es_prueba, ubicacion_exclusiva_id, copia_de_id)
       SELECT LEFT('P-' || u.codigo || '-' || p.codigo, 30), p.nombre, p.descripcion, p.cabys, true, true, u.id, p.id
       FROM productos p
       JOIN variantes_producto v ON v.producto_id = p.id AND v.activo
       JOIN stock_ubicaciones s ON s.variante_id = v.id
       JOIN ubicaciones u ON u.id = s.ubicacion_id AND u.tipo = 'tienda' AND u.activa AND ($1::uuid IS NULL OR u.id = $1::uuid)
       WHERE p.activo AND NOT p.es_prueba AND p.copia_de_id IS NULL AND (p.ubicacion_exclusiva_id IS NULL OR p.ubicacion_exclusiva_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM productos t WHERE t.copia_de_id = p.id AND t.ubicacion_exclusiva_id = u.id)
       GROUP BY u.id, p.id
       ON CONFLICT (codigo) DO NOTHING`,
      [ubicacionId],
    );
    await m.query(`
      INSERT INTO variantes_producto (producto_id, color, precio_por_par, costo, precio_tienda, codigo_barras, activo, copia_de_id)
      SELECT t.id, v.color, v.precio_por_par, v.costo, v.precio_tienda, NULL, true, v.id
      FROM productos t
      JOIN variantes_producto v ON v.producto_id = t.copia_de_id AND v.activo
      JOIN stock_ubicaciones s ON s.variante_id = v.id AND s.ubicacion_id = t.ubicacion_exclusiva_id
      WHERE t.copia_de_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM variantes_producto x WHERE x.copia_de_id = v.id AND x.producto_id = t.id)`);
    await m.query(`
      INSERT INTO stock_ubicaciones (ubicacion_id, variante_id, cantidad, costo_promedio, stock_minimo)
      SELECT s.ubicacion_id, tv.id, s.cantidad, s.costo_promedio, s.stock_minimo
      FROM variantes_producto tv
      JOIN productos tp ON tp.id = tv.producto_id
      JOIN stock_ubicaciones s ON s.variante_id = tv.copia_de_id AND s.ubicacion_id = tp.ubicacion_exclusiva_id
      WHERE tv.copia_de_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM stock_ubicaciones y WHERE y.variante_id = tv.id AND y.ubicacion_id = s.ubicacion_id)`);
    await m.query(
      `INSERT INTO movimientos_inventario (ubicacion_id, variante_id, tipo, cantidad, referencia_tipo, creado_por)
       SELECT s.ubicacion_id, s.variante_id, 'ingreso_inicial', s.cantidad, 'espejo_prueba', $1
       FROM stock_ubicaciones s JOIN variantes_producto tv ON tv.id = s.variante_id
       WHERE tv.copia_de_id IS NOT NULL AND s.cantidad > 0
         AND NOT EXISTS (SELECT 1 FROM movimientos_inventario x WHERE x.variante_id = s.variante_id AND x.referencia_tipo = 'espejo_prueba')`,
      [usuarioId],
    );
    const [r] = await m.query(`SELECT COUNT(DISTINCT tv.producto_id)::int AS productos, COALESCE(SUM(s.cantidad), 0)::int AS unidades
      FROM stock_ubicaciones s JOIN variantes_producto tv ON tv.id = s.variante_id WHERE tv.copia_de_id IS NOT NULL`);
    return { productos: r.productos, unidades: r.unidades };
  }

  // Borra la copia y todo lo hecho con ella. Devuelve cuántos productos de la copia se borraron.
  async eliminar(): Promise<number> {
    return this.dataSource.transaction((m) => this.borrarEn(m));
  }

  private async borrarEn(m: EntityManager): Promise<number> {
    const variantes: Array<{ id: string }> = await m.query('SELECT id FROM variantes_producto WHERE copia_de_id IS NOT NULL');
    const [{ n }] = await m.query('SELECT COUNT(*)::int AS n FROM productos WHERE copia_de_id IS NOT NULL');
    if (variantes.length > 0) {
      const ids = variantes.map((v) => v.id);
      await m.query('DELETE FROM pos_venta_lineas WHERE variante_id = ANY($1)', [ids]);
      await m.query('DELETE FROM pos_ventas v WHERE NOT EXISTS (SELECT 1 FROM pos_venta_lineas l WHERE l.venta_id = v.id)');
      await m.query('DELETE FROM pos_orden_lineas WHERE variante_id = ANY($1)', [ids]);
      await m.query('DELETE FROM pos_ordenes o WHERE NOT EXISTS (SELECT 1 FROM pos_orden_lineas l WHERE l.orden_id = o.id)');
      await m.query('DELETE FROM traspaso_lineas WHERE variante_id = ANY($1)', [ids]);
      await m.query('DELETE FROM traspasos t WHERE NOT EXISTS (SELECT 1 FROM traspaso_lineas l WHERE l.traspaso_id = t.id)');
      await m.query('DELETE FROM movimientos_inventario WHERE variante_id = ANY($1)', [ids]);
      await m.query('DELETE FROM stock_ubicaciones WHERE variante_id = ANY($1)', [ids]);
    }
    await m.query('DELETE FROM variantes_producto WHERE copia_de_id IS NOT NULL');
    await m.query('DELETE FROM productos WHERE copia_de_id IS NOT NULL');
    return n;
  }
}
