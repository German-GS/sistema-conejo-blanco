import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Producto } from './producto.entity.js';
import { VarianteProducto } from './variante-producto.entity.js';
import { ProductoEdicion } from './producto-edicion.entity.js';
import { ProductoFoto } from './producto-foto.entity.js';
import { formatearColones } from '../common/utils/dinero.util.js';
import type { CrearProductoDto } from './dto/crear-producto.dto.js';
import type { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import type { CrearVarianteDto } from './dto/crear-variante.dto.js';
import type { ActualizarVarianteDto } from './dto/actualizar-variante.dto.js';
import { ActividadTiendaService } from '../actividad-tienda/actividad-tienda.service.js';

@Injectable()
export class CatalogoService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    @InjectRepository(VarianteProducto)
    private readonly varianteRepo: Repository<VarianteProducto>,
    @InjectRepository(ProductoEdicion)
    private readonly edicionRepo: Repository<ProductoEdicion>,
    @InjectRepository(ProductoFoto)
    private readonly fotoRepo: Repository<ProductoFoto>,
    private readonly dataSource: DataSource,
    private readonly actividad: ActividadTiendaService,
  ) {}

  listarProductos(): Promise<Producto[]> {
    return this.productoRepo.find({
      relations: { variantes: true, fotos: true },
      order: { codigo: 'ASC' },
    });
  }

  // Autocompletar al armar un pedido, y también lo que usa el buscador de
  // Inventario — por código, nombre, descripción O color de cualquier
  // variante, solo productos activos. Varias palabras (ej. "media rojo")
  // exigen que CADA palabra aparezca en algún campo, no necesariamente
  // todas en el mismo — así "media" puede venir del nombre y "rojo" del
  // color de una variante, y el producto igual aparece.
  async buscarProductos(texto: string): Promise<Producto[]> {
    const palabras = texto
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6); // tope defensivo, nadie busca con más de 6 palabras
    if (palabras.length === 0) return this.listarProductos();

    let qb = this.productoRepo
      .createQueryBuilder('producto')
      // El join solo considera variantes activas: un color desactivado no
      // debe hacer aparecer el producto en la búsqueda.
      .leftJoin('producto.variantes', 'variante', 'variante.activo = true')
      .where('producto.activo = true');

    palabras.forEach((palabra, i) => {
      const parametro = `palabra${i}`;
      qb = qb.andWhere(
        // REPLACE: los códigos llevan espacio ("KW 223") pero se suele
        // buscar pegado ("kw223") — así ambas formas encuentran lo mismo.
        `(producto.codigo ILIKE :${parametro} OR REPLACE(producto.codigo, ' ', '') ILIKE :${parametro} OR producto.nombre ILIKE :${parametro} OR producto.descripcion ILIKE :${parametro} OR variante.color ILIKE :${parametro})`,
        { [parametro]: `%${palabra}%` },
      );
    });

    // Sin orderBy acá a propósito: Postgres exige que un SELECT DISTINCT
    // "plano" incluya en el select cualquier columna del ORDER BY, y solo
    // nos interesa juntar los ids — el orden final lo pone el find() de
    // abajo, que ya ordena por código.
    const filas = await qb.select('producto.id', 'id').distinct(true).limit(30).getRawMany();
    if (filas.length === 0) return [];

    const productos = await this.productoRepo.find({
      where: { id: In(filas.map((f) => f.id)) },
      relations: { variantes: true, fotos: true },
      order: { codigo: 'ASC' },
    });
    for (const producto of productos) {
      producto.variantes = producto.variantes.filter((v) => v.activo);
    }
    return productos;
  }

  async buscarProductoPorIdOFallar(id: string): Promise<Producto> {
    const producto = await this.productoRepo.findOne({ where: { id }, relations: { variantes: true, fotos: true } });
    if (!producto) {
      throw new NotFoundException('El producto no existe.');
    }
    return producto;
  }

  // Fotos de referencia del producto (no del color) — varias por
  // producto, para que el vendedor le muestre al cliente cómo se ve el
  // estilo. El archivo ya está guardado en disco cuando esto se llama
  // (ver CatalogoController.subirFoto) — esto solo registra la fila.
  async agregarFoto(productoId: string, url: string): Promise<ProductoFoto> {
    await this.buscarProductoPorIdOFallar(productoId);
    const foto = this.fotoRepo.create({ productoId, url });
    return this.fotoRepo.save(foto);
  }

  // Borra la fila Y el archivo físico — sin bloquear la respuesta si el
  // archivo ya no está en disco por algún motivo (igual se limpia el
  // registro).
  async eliminarFoto(fotoId: string): Promise<void> {
    const foto = await this.fotoRepo.findOneBy({ id: fotoId });
    if (!foto) {
      throw new NotFoundException('La foto no existe.');
    }
    await this.fotoRepo.remove(foto);
    try {
      await unlink(join(process.cwd(), foto.url));
    } catch {
      // Archivo ya ausente o no se pudo borrar — el registro ya se quitó,
      // que es lo que le importa al catálogo.
    }
  }

  // Elimina un producto que nunca se usó: sin pedidos, facturas ni traspasos y sin existencias. Se llevan
  // consigo sus colores, fotos, bitácora de ediciones y sus movimientos de inventario (que quedan en cero).
  // Un producto que ya se vendió no se elimina —se desactiva— para no perder el historial.
  async eliminarProducto(id: string, esSistema = false): Promise<void> {
    const producto = await this.productoRepo.findOne({ where: { id }, relations: { variantes: true, fotos: true } });
    if (!producto) throw new NotFoundException('El producto no existe.');
    const ids = producto.variantes.map((v) => v.id);
    if (producto.esPrueba) {
      if (!esSistema) throw new ForbiddenException('Solo el administrador del sistema elimina productos de prueba.');
      await this.purgarProductoDePrueba(producto, ids);
      return;
    }
    if (ids.length > 0) {
      const [{ usos }] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*) FROM pedido_lineas WHERE variante_id = ANY($1))
              + (SELECT COUNT(*) FROM factura_lineas WHERE variante_id = ANY($1))
              + (SELECT COUNT(*) FROM traspaso_lineas WHERE variante_id = ANY($1)) AS usos`,
        [ids],
      );
      if (Number(usos) > 0) {
        throw new BadRequestException('Este producto ya se usó en pedidos, facturas o traspasos: no se puede eliminar para conservar el historial. Desactivalo en su lugar.');
      }
      const [{ existencias }] = await this.dataSource.query('SELECT COALESCE(SUM(cantidad), 0)::int AS existencias FROM stock_ubicaciones WHERE variante_id = ANY($1)', [ids]);
      if (Number(existencias) !== 0) {
        throw new BadRequestException(`Este producto todavía tiene ${existencias} pares en bodega: deje el inventario en cero antes de eliminarlo.`);
      }
    }
    await this.dataSource.transaction(async (manager) => {
      if (ids.length > 0) {
        await manager.query('DELETE FROM movimientos_inventario WHERE variante_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM stock_ubicaciones WHERE variante_id = ANY($1)', [ids]);
      }
      await manager.delete(Producto, { id });
    });
    for (const foto of producto.fotos) {
      try {
        await unlink(join(process.cwd(), foto.url));
      } catch {
        // el archivo ya no estaba
      }
    }
  }

  // Un producto de prueba se elimina con TODO lo que se hizo con él (ventas de caja, pedidos y traspasos de tienda, existencias y
  // movimientos). No hay asientos que deshacer porque nunca se generaron. Los documentos que quedan sin ninguna línea se borran.
  private async purgarProductoDePrueba(producto: Producto, ids: string[]): Promise<void> {
    if (ids.length > 0) {
      const [{ usos }] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*) FROM pedido_lineas WHERE variante_id = ANY($1)) + (SELECT COUNT(*) FROM factura_lineas WHERE variante_id = ANY($1)) AS usos`,
        [ids],
      );
      if (Number(usos) > 0) throw new BadRequestException('Este producto de prueba aparece en pedidos o facturas reales: no se puede eliminar.');
    }
    await this.dataSource.transaction(async (manager) => {
      if (ids.length > 0) {
        await manager.query('DELETE FROM pos_venta_lineas WHERE variante_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM pos_ventas v WHERE NOT EXISTS (SELECT 1 FROM pos_venta_lineas l WHERE l.venta_id = v.id)');
        await manager.query('DELETE FROM pos_orden_lineas WHERE variante_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM pos_ordenes o WHERE NOT EXISTS (SELECT 1 FROM pos_orden_lineas l WHERE l.orden_id = o.id)');
        await manager.query('DELETE FROM traspaso_lineas WHERE variante_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM traspasos t WHERE NOT EXISTS (SELECT 1 FROM traspaso_lineas l WHERE l.traspaso_id = t.id)');
        await manager.query('DELETE FROM movimientos_inventario WHERE variante_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM stock_ubicaciones WHERE variante_id = ANY($1)', [ids]);
      }
      await manager.delete(Producto, { id: producto.id });
    });
    for (const foto of producto.fotos) {
      try {
        await unlink(join(process.cwd(), foto.url));
      } catch {
        // el archivo ya no estaba
      }
    }
  }

  // Para armar pedidos de vendedores y facturas: los productos de prueba no se pueden usar ahí (no son reales).
  async buscarVarianteParaVenta(id: string): Promise<VarianteProducto> {
    const variante = await this.buscarVariantePorIdOFallar(id);
    const [{ prueba }] = await this.dataSource.query('SELECT es_prueba AS prueba FROM productos WHERE id = $1', [variante.productoId]);
    if (prueba) throw new BadRequestException('Ese producto es de prueba: solo se usa en la caja de las tiendas y en sus pedidos, no en pedidos ni facturas.');
    return variante;
  }

  async crearProducto(dto: CrearProductoDto, usuarioId: string, esSistema = false): Promise<Producto> {
    if (dto.esPrueba && !esSistema) throw new ForbiddenException('Solo el administrador del sistema puede crear productos de prueba.');
    const producto = this.productoRepo.create({ ...dto, esPrueba: Boolean(dto.esPrueba) });
    const guardado = await this.productoRepo.save(producto);
    await this.registrarEdicion(guardado.id, usuarioId, [`Producto ${guardado.esPrueba ? 'de PRUEBA ' : ''}creado: ${guardado.codigo} — ${guardado.nombre}`]);
    return guardado;
  }

  async actualizarProducto(id: string, dto: ActualizarProductoDto, usuarioId: string): Promise<Producto> {
    const producto = await this.buscarProductoPorIdOFallar(id);
    const cambios: string[] = [];
    if (dto.codigo !== undefined && dto.codigo !== producto.codigo) {
      cambios.push(`Código: ${producto.codigo} → ${dto.codigo}`);
    }
    if (dto.nombre !== undefined && dto.nombre !== producto.nombre) {
      cambios.push(`Nombre: ${producto.nombre} → ${dto.nombre}`);
    }
    if (dto.descripcion !== undefined && dto.descripcion !== (producto.descripcion ?? '')) {
      cambios.push('Descripción actualizada');
    }
    if (dto.activo !== undefined && dto.activo !== producto.activo) {
      cambios.push(dto.activo ? 'Producto activado' : 'Producto desactivado');
    }

    Object.assign(producto, dto);
    const guardado = await this.productoRepo.save(producto);
    if (cambios.length > 0) {
      await this.registrarEdicion(id, usuarioId, cambios);
    }
    return guardado;
  }

  async crearVariante(dto: CrearVarianteDto, usuarioId: string): Promise<VarianteProducto> {
    await this.buscarProductoPorIdOFallar(dto.productoId);
    const variante = this.varianteRepo.create({
      productoId: dto.productoId,
      color: dto.color,
      precioPorPar: dto.precioPorPar.toFixed(2),
      costo: dto.costo !== undefined ? dto.costo.toFixed(2) : null,
      precioTienda: dto.precioTienda ? dto.precioTienda.toFixed(2) : null,
      codigoBarras: dto.codigoBarras ? dto.codigoBarras.trim() : null,
    });
    if (variante.codigoBarras) await this.verificarCodigoBarrasLibre(variante.codigoBarras);
    const guardada = await this.varianteRepo.save(variante);
    const detalleCosto = guardada.costo ? `, costo ${formatearColones(guardada.costo)}` : '';
    await this.registrarEdicion(dto.productoId, usuarioId, [
      `Color agregado: ${guardada.color} (${formatearColones(guardada.precioPorPar)}${detalleCosto})`,
    ]);
    return guardada;
  }

  private async verificarCodigoBarrasLibre(codigo: string, exceptoId?: string): Promise<void> {
    const otra = await this.varianteRepo.findOne({ where: { codigoBarras: codigo }, relations: { producto: true } });
    if (otra && otra.id !== exceptoId) {
      throw new BadRequestException(`Ese código de barras ya lo tiene ${otra.producto.codigo} (${otra.color}).`);
    }
  }

  async buscarVariantePorIdOFallar(id: string): Promise<VarianteProducto> {
    const variante = await this.varianteRepo.findOneBy({ id });
    if (!variante) {
      throw new NotFoundException('La variante no existe.');
    }
    return variante;
  }

  async actualizarVariante(id: string, dto: ActualizarVarianteDto, usuarioId: string): Promise<VarianteProducto> {
    const variante = await this.buscarVariantePorIdOFallar(id);
    const nombreActual = variante.color;
    const cambios: string[] = [];
    const cambiosTienda: string[] = [];

    if (dto.color !== undefined && dto.color !== variante.color) {
      cambios.push(`Color "${variante.color}" renombrado a "${dto.color}"`);
    }
    if (dto.precioPorPar !== undefined && dto.precioPorPar.toFixed(2) !== variante.precioPorPar) {
      cambios.push(`${nombreActual}: ${formatearColones(variante.precioPorPar)} → ${formatearColones(dto.precioPorPar.toFixed(2))}`);
    }
    if (dto.costo !== undefined && dto.costo.toFixed(2) !== variante.costo) {
      cambios.push(`${nombreActual} — costo: ${variante.costo ? formatearColones(variante.costo) : '—'} → ${formatearColones(dto.costo.toFixed(2))}`);
    }
    if (dto.activo !== undefined && dto.activo !== variante.activo) {
      cambios.push(`${nombreActual}: ${dto.activo ? 'activado' : 'desactivado'}`);
    }
    const nuevoPrecioTienda = dto.precioTienda === undefined ? undefined : dto.precioTienda === null ? null : dto.precioTienda.toFixed(2);
    if (nuevoPrecioTienda !== undefined && nuevoPrecioTienda !== variante.precioTienda) {
      cambios.push(`${nombreActual} — precio de tienda: ${variante.precioTienda ? formatearColones(variante.precioTienda) : '—'} → ${nuevoPrecioTienda ? formatearColones(nuevoPrecioTienda) : '—'}`);
      cambiosTienda.push(`precio de tienda: ${variante.precioTienda ? formatearColones(variante.precioTienda) : '—'} → ${nuevoPrecioTienda ? formatearColones(nuevoPrecioTienda) : '—'}`);
    }
    const nuevoCodigo = dto.codigoBarras === undefined ? undefined : dto.codigoBarras ? dto.codigoBarras.trim() : null;
    if (nuevoCodigo !== undefined && nuevoCodigo !== variante.codigoBarras) {
      if (nuevoCodigo) await this.verificarCodigoBarrasLibre(nuevoCodigo, id);
      cambios.push(`${nombreActual} — código de barras: ${variante.codigoBarras ?? '—'} → ${nuevoCodigo ?? '—'}`);
      cambiosTienda.push(`código de barras: ${variante.codigoBarras ?? '—'} → ${nuevoCodigo ?? '—'}`);
    }

    if (dto.color !== undefined) variante.color = dto.color;
    if (dto.precioPorPar !== undefined) variante.precioPorPar = dto.precioPorPar.toFixed(2);
    if (dto.costo !== undefined) variante.costo = dto.costo.toFixed(2);
    if (dto.activo !== undefined) variante.activo = dto.activo;
    if (nuevoPrecioTienda !== undefined) variante.precioTienda = nuevoPrecioTienda;
    if (nuevoCodigo !== undefined) variante.codigoBarras = nuevoCodigo;
    const guardada = await this.varianteRepo.save(variante);

    if (cambios.length > 0) {
      await this.registrarEdicion(variante.productoId, usuarioId, cambios);
    }
    if (cambiosTienda.length > 0) {
      const [prod] = await this.dataSource.query('SELECT codigo FROM productos WHERE id = $1', [variante.productoId]);
      const codigo = prod?.codigo ?? '';
      await this.actividad.registrarPanel({ usuarioId, tipo: 'precio_tienda', detalle: `${codigo} ${nombreActual}: ${cambiosTienda.join('; ')}` });
    }
    return guardada;
  }

  // select.usuario acá abajo, mismo motivo que en otros listar() del
  // proyecto: sin esto se filtra el passwordHash del usuario que editó.
  listarEdiciones(productoId: string): Promise<ProductoEdicion[]> {
    return this.edicionRepo.find({
      where: { productoId },
      relations: { usuario: true },
      select: { usuario: { id: true, nombre: true, email: true, rol: true, activo: true } },
      order: { creadoEn: 'DESC' },
    });
  }

  private registrarEdicion(productoId: string, usuarioId: string, cambios: string[]): Promise<ProductoEdicion> {
    return this.edicionRepo.save(this.edicionRepo.create({ productoId, usuarioId, cambios }));
  }
}
