import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Traspaso } from './traspaso.entity.js';
import { TraspasoLinea } from './traspaso-linea.entity.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service.js';
import { EstadoTraspaso } from '../common/enums/estado-traspaso.enum.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';
import type { CrearTraspasoDto } from './dto/crear-traspaso.dto.js';
import type { RecibirTraspasoDto } from './dto/recibir-traspaso.dto.js';

const REFERENCIA_TRASPASO = 'traspaso';

@Injectable()
export class TraspasosService {
  constructor(
    @InjectRepository(Traspaso)
    private readonly traspasoRepo: Repository<Traspaso>,
    private readonly inventarioService: InventarioService,
    private readonly ubicacionesService: UbicacionesService,
    private readonly dataSource: DataSource,
  ) {}

  listar(): Promise<Traspaso[]> {
    return this.traspasoRepo.find({
      relations: { origen: true, destino: true, lineas: { variante: { producto: true } }, solicitadoPor: true, recibidoPor: true },
      select: {
        solicitadoPor: { id: true, nombre: true },
        recibidoPor: { id: true, nombre: true },
      },
      order: { creadoEn: 'DESC' },
    });
  }

  async buscarPorIdOFallar(id: string): Promise<Traspaso> {
    const traspaso = await this.traspasoRepo.findOne({
      where: { id },
      relations: { origen: true, destino: true, lineas: { variante: { producto: true } }, solicitadoPor: true, recibidoPor: true },
      select: {
        solicitadoPor: { id: true, nombre: true },
        recibidoPor: { id: true, nombre: true },
      },
    });
    if (!traspaso) {
      throw new NotFoundException('El traspaso no existe.');
    }
    return traspaso;
  }

  // Crear NO mueve stock todavía — el kardex recién se toca al despachar
  // (ver despachar más abajo). Esto deja registrada la intención sin
  // comprometer inventario hasta que de verdad salga de origen.
  async crear(dto: CrearTraspasoDto, solicitadoPorId: string): Promise<Traspaso> {
    if (dto.origenId === dto.destinoId) {
      throw new BadRequestException('El origen y el destino no pueden ser la misma ubicación.');
    }
    await this.ubicacionesService.buscarPorIdOFallar(dto.origenId);
    await this.ubicacionesService.buscarPorIdOFallar(dto.destinoId);

    const traspaso = this.traspasoRepo.create({
      origenId: dto.origenId,
      destinoId: dto.destinoId,
      solicitadoPorId,
      estado: EstadoTraspaso.SOLICITADO,
      lineas: dto.lineas.map((l) =>
        Object.assign(new TraspasoLinea(), { varianteId: l.varianteId, cantidadEnviada: l.cantidadEnviada }),
      ),
    });
    const guardado = await this.traspasoRepo.save(traspaso);
    return this.buscarPorIdOFallar(guardado.id);
  }

  // Despachar: sale de verdad de origen (kardex TRASPASO_SALIDA por
  // línea) y pasa a EnTransito. Si no hay stock suficiente en origen para
  // alguna línea, falla y no despacha nada (todo o nada, transaccional).
  async despachar(id: string, usuarioId: string): Promise<Traspaso> {
    const traspaso = await this.buscarPorIdOFallar(id);
    if (traspaso.estado !== EstadoTraspaso.SOLICITADO) {
      throw new BadRequestException('Solo se puede despachar un traspaso en estado Solicitado.');
    }

    await this.dataSource.transaction(async (manager) => {
      for (const linea of traspaso.lineas) {
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: traspaso.origenId,
          varianteId: linea.varianteId,
          tipo: TipoMovimientoInventario.TRASPASO_SALIDA,
          cantidad: -linea.cantidadEnviada,
          referenciaTipo: REFERENCIA_TRASPASO,
          referenciaId: traspaso.id,
          creadoPorId: usuarioId,
        });
      }
      await manager.update(Traspaso, traspaso.id, {
        estado: EstadoTraspaso.EN_TRANSITO,
        fechaEnvio: new Date(),
      });
    });

    return this.buscarPorIdOFallar(id);
  }

  // Recibir: entra a destino (kardex TRASPASO_ENTRADA) por la cantidad
  // REAL que llegó, no por lo que se despachó. Si cantidad_recibida ≠
  // cantidad_enviada, la diferencia (merma en tránsito o sobrante) queda
  // trazada en la propia línea del traspaso y el estado pasa a
  // RecibidoConDiferencia — no flota sin explicación, pero tampoco se
  // registra un movimiento de ajuste aparte (ver nota más abajo).
  // `enTransaccion` (opcional) corre dentro de la misma transacción, después de mover el inventario: así la recepción de un
  // pedido de tienda y su asiento contable quedan juntos o no quedan.
  async recibir(id: string, dto: RecibirTraspasoDto, usuarioId: string, enTransaccion?: (manager: EntityManager, traspaso: Traspaso) => Promise<void>): Promise<Traspaso> {
    const traspaso = await this.buscarPorIdOFallar(id);
    if (!enTransaccion) {
      const [propio] = await this.dataSource.query('SELECT 1 FROM pos_ordenes WHERE traspaso_id = $1 LIMIT 1', [id]);
      if (propio) throw new BadRequestException('Este traspaso es de un pedido de una tienda: lo recibe la tienda desde su caja, verificando lo enviado.');
    }
    if (traspaso.estado !== EstadoTraspaso.EN_TRANSITO) {
      throw new BadRequestException('Solo se puede recibir un traspaso en estado En tránsito.');
    }

    const cantidadesPorLinea = new Map(dto.lineas.map((l) => [l.lineaId, l.cantidadRecibida]));
    for (const linea of traspaso.lineas) {
      if (!cantidadesPorLinea.has(linea.id)) {
        throw new BadRequestException(`Falta la cantidad recibida para la línea ${linea.id}.`);
      }
    }

    let huboDiferencia = false;

    await this.dataSource.transaction(async (manager) => {
      for (const linea of traspaso.lineas) {
        const cantidadRecibida = cantidadesPorLinea.get(linea.id)!;
        if (cantidadRecibida !== linea.cantidadEnviada) {
          huboDiferencia = true;
        }

        // Un solo movimiento, por la cantidad REAL recibida — no dos. La
        // merma en tránsito (si la hay) no necesita su propio movimiento
        // de ajuste: ya queda perfectamente trazada comparando
        // cantidadEnviada vs cantidadRecibida en esta misma línea, y el
        // estado del traspaso pasa a RecibidoConDiferencia. Un ajuste
        // aparte aquí restaría la merma DOS veces (una por recibir menos
        // de lo despachado, otra por el ajuste) — bug real, encontrado
        // probando el caso "llegan 10 de 12": el stock quedaba en 8 en
        // vez de 10.
        await this.inventarioService.registrarMovimientoEnTransaccion(manager, {
          ubicacionId: traspaso.destinoId,
          varianteId: linea.varianteId,
          tipo: TipoMovimientoInventario.TRASPASO_ENTRADA,
          cantidad: cantidadRecibida,
          referenciaTipo: REFERENCIA_TRASPASO,
          referenciaId: traspaso.id,
          creadoPorId: usuarioId,
        });

        await manager.update(TraspasoLinea, linea.id, { cantidadRecibida });
      }

      await manager.update(Traspaso, traspaso.id, {
        estado: huboDiferencia ? EstadoTraspaso.RECIBIDO_CON_DIFERENCIA : EstadoTraspaso.RECIBIDO,
        fechaRecepcion: new Date(),
        recibidoPorId: usuarioId,
      });
      if (enTransaccion) await enTransaccion(manager, traspaso);
    });

    return this.buscarPorIdOFallar(id);
  }
}
