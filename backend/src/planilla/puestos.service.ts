import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuestoPlanilla } from './puesto.entity.js';

// Puestos que se siembran la primera vez (por nombre, sin pisar lo que se haya
// editado). Los de gerencia y administración van como cargos de confianza.
const PUESTOS_POR_DEFECTO: Array<{ nombre: string; esConfianza: boolean; sector?: 'industria' | 'comercio' }> = [
  { nombre: 'Gerente General', esConfianza: true },
  { nombre: 'Gerente Comercial', esConfianza: true },
  { nombre: 'Gerente', esConfianza: true },
  { nombre: 'Subgerente', esConfianza: true },
  { nombre: 'Administrador', esConfianza: true },
  { nombre: 'Jefe de Producción', esConfianza: false },
  { nombre: 'Supervisor', esConfianza: false },
  { nombre: 'Asistente Administrativo', esConfianza: false },
  { nombre: 'Contador', esConfianza: false },
  { nombre: 'Vendedor', esConfianza: false },
  { nombre: 'Chofer / Mensajero', esConfianza: false },
  { nombre: 'Bodeguero', esConfianza: false },
  { nombre: 'Operador', esConfianza: false },
  { nombre: 'Operador de Máquina', esConfianza: false },
  { nombre: 'Colaborador', esConfianza: false },
  { nombre: 'Conserje', esConfianza: false },
  // Puestos de tienda (comercio): el descanso semanal ya viene incluido en el pago.
  { nombre: 'Encargado de Tienda', esConfianza: false, sector: 'comercio' },
  { nombre: 'Dependiente de Tienda', esConfianza: false, sector: 'comercio' },
  { nombre: 'Cajero', esConfianza: false, sector: 'comercio' },
];

@Injectable()
export class PuestosService implements OnModuleInit {
  constructor(
    @InjectRepository(PuestoPlanilla)
    private readonly repo: Repository<PuestoPlanilla>,
  ) {}

  async onModuleInit() {
    const existentes = new Set((await this.repo.find({ select: { nombre: true } })).map((p) => p.nombre.toLowerCase()));
    const faltantes = PUESTOS_POR_DEFECTO.filter((p) => !existentes.has(p.nombre.toLowerCase()));
    if (faltantes.length > 0) await this.repo.save(this.repo.create(faltantes));
  }

  listar(): Promise<PuestoPlanilla[]> {
    return this.repo.find({ order: { activo: 'DESC', esConfianza: 'DESC', nombre: 'ASC' } });
  }

  async buscarOFallar(id: string): Promise<PuestoPlanilla> {
    const puesto = await this.repo.findOneBy({ id });
    if (!puesto) throw new NotFoundException('El puesto no existe.');
    return puesto;
  }

  async crear(nombre: string, esConfianza: boolean, sector: 'industria' | 'comercio' = 'industria'): Promise<PuestoPlanilla> {
    const limpio = nombre.trim();
    if (limpio.length < 2) throw new BadRequestException('Escribí el nombre del puesto.');
    if (await this.repo.createQueryBuilder('p').where('LOWER(p.nombre) = LOWER(:n)', { n: limpio }).getExists()) {
      throw new BadRequestException('Ya existe un puesto con ese nombre.');
    }
    return this.repo.save(this.repo.create({ nombre: limpio, esConfianza, sector }));
  }

  async actualizar(id: string, cambios: { nombre?: string; esConfianza?: boolean; sector?: 'industria' | 'comercio'; activo?: boolean }): Promise<PuestoPlanilla> {
    const puesto = await this.buscarOFallar(id);
    if (cambios.nombre !== undefined) puesto.nombre = cambios.nombre.trim();
    if (cambios.esConfianza !== undefined) puesto.esConfianza = cambios.esConfianza;
    if (cambios.sector !== undefined) puesto.sector = cambios.sector;
    if (cambios.activo !== undefined) puesto.activo = cambios.activo;
    return this.repo.save(puesto);
  }
}
