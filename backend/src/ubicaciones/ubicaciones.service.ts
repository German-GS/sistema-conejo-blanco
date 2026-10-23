import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ubicacion } from './ubicacion.entity.js';
import { TipoUbicacion } from '../common/enums/tipo-ubicacion.enum.js';
import type { CrearUbicacionDto } from './dto/crear-ubicacion.dto.js';
import type { ActualizarUbicacionDto } from './dto/actualizar-ubicacion.dto.js';

@Injectable()
export class UbicacionesService {
  constructor(
    @InjectRepository(Ubicacion)
    private readonly ubicacionRepo: Repository<Ubicacion>,
  ) {}

  listar(): Promise<Ubicacion[]> {
    return this.ubicacionRepo.find({ order: { nombre: 'ASC' } });
  }

  async buscarPorIdOFallar(id: string): Promise<Ubicacion> {
    const ubicacion = await this.ubicacionRepo.findOneBy({ id });
    if (!ubicacion) {
      throw new NotFoundException('La ubicación no existe.');
    }
    return ubicacion;
  }

  async crear(dto: CrearUbicacionDto): Promise<Ubicacion> {
    const existente = await this.ubicacionRepo.findOneBy({ codigo: dto.codigo });
    if (existente) {
      throw new ConflictException('Ya existe una ubicación con ese código.');
    }
    const ubicacion = this.ubicacionRepo.create(dto);
    return this.ubicacionRepo.save(ubicacion);
  }

  async actualizar(id: string, dto: ActualizarUbicacionDto): Promise<Ubicacion> {
    const ubicacion = await this.buscarPorIdOFallar(id);
    Object.assign(ubicacion, dto);
    return this.ubicacionRepo.save(ubicacion);
  }

  // El vendedor visita clientes/tiendas pero el pedido siempre sale de la
  // bodega de distribución central — no se le pide elegir ubicación al
  // armar el pedido (ver PedidosService.crear). Si el día de mañana hay
  // más de una bodega de distribución, esto toma la más antigua (la
  // "principal") de forma determinística.
  async buscarBodegaCentralOFallar(): Promise<Ubicacion> {
    const bodega = await this.ubicacionRepo.findOne({
      where: { tipo: TipoUbicacion.BODEGA_DISTRIBUCION, activa: true },
      order: { creadoEn: 'ASC' },
    });
    if (!bodega) {
      throw new BadRequestException(
        'No hay ninguna bodega de distribución activa configurada — pida a administración que la cree en Inventario.',
      );
    }
    return bodega;
  }
}
