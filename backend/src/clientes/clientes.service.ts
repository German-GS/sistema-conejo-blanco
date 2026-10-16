import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cliente } from './cliente.entity.js';
import type { CrearClienteDto } from './dto/crear-cliente.dto.js';
import type { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
    private readonly dataSource: DataSource,
  ) {}

  // Elimina un cliente que nunca tuvo movimientos (pedidos, facturas, notas de crédito o recibos).
  // Si ya tiene historial no se elimina —se desactiva— para no perder las ventas.
  async eliminar(id: string): Promise<void> {
    await this.buscarPorIdOFallar(id);
    const [{ usos }] = await this.dataSource.query(
      `SELECT (SELECT COUNT(*) FROM pedidos WHERE cliente_id = $1) + (SELECT COUNT(*) FROM facturas WHERE cliente_id = $1)
            + (SELECT COUNT(*) FROM notas_credito WHERE cliente_id = $1) + (SELECT COUNT(*) FROM pagos_recibidos WHERE cliente_id = $1) AS usos`,
      [id],
    );
    if (Number(usos) > 0) {
      throw new BadRequestException('Este cliente ya tiene pedidos, facturas o pagos: no se puede eliminar para conservar el historial. Desactivalo en su lugar.');
    }
    await this.clienteRepo.delete({ id });
  }

  listar(): Promise<Cliente[]> {
    return this.clienteRepo.find({ order: { nombre: 'ASC' } });
  }

  // Búsqueda para el autocompletar del vendedor al armar un pedido, y
  // también lo que usa el buscador de la página Clientes — por nombre,
  // cédula, teléfono, correo O dirección, solo clientes activos. Varias
  // palabras (ej. "Heredia Esperanza") exigen que CADA palabra aparezca
  // en algún campo, no necesariamente todas en el mismo.
  buscar(texto: string): Promise<Cliente[]> {
    const palabras = texto
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6); // tope defensivo, nadie busca con más de 6 palabras

    let qb = this.clienteRepo.createQueryBuilder('cliente').where('cliente.activo = true');
    palabras.forEach((palabra, i) => {
      const parametro = `palabra${i}`;
      qb = qb.andWhere(
        `(cliente.nombre ILIKE :${parametro} OR cliente.cedula ILIKE :${parametro} OR cliente.telefono ILIKE :${parametro} OR cliente.email ILIKE :${parametro} OR cliente.direccion ILIKE :${parametro})`,
        { [parametro]: `%${palabra}%` },
      );
    });

    return qb.orderBy('cliente.nombre', 'ASC').take(20).getMany();
  }

  async buscarPorIdOFallar(id: string): Promise<Cliente> {
    const cliente = await this.clienteRepo.findOneBy({ id });
    if (!cliente) {
      throw new NotFoundException('El cliente no existe.');
    }
    return cliente;
  }

  crear(dto: CrearClienteDto): Promise<Cliente> {
    const cliente = this.clienteRepo.create({
      ...dto,
      descuentoPorcentaje: dto.descuentoPorcentaje !== undefined ? dto.descuentoPorcentaje.toFixed(2) : null,
    });
    return this.clienteRepo.save(cliente);
  }

  async actualizar(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
    const cliente = await this.buscarPorIdOFallar(id);
    Object.assign(cliente, dto);
    if (dto.descuentoPorcentaje !== undefined) {
      cliente.descuentoPorcentaje = dto.descuentoPorcentaje.toFixed(2);
    }
    return this.clienteRepo.save(cliente);
  }
}
