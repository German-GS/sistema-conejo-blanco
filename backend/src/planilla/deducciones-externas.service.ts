import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import { cuotaSemanalPorSabados, sabadosDelMes } from './cuotas-externas.js';
import { DeduccionExterna } from './deduccion-externa.entity.js';
import type { GuardarDeduccionExternaDto } from './dto/empleado.dto.js';
import { Empleado } from './empleado.entity.js';

type Actor = { id: string; email?: string };

@Injectable()
export class DeduccionesExternasService {
  constructor(
    @InjectRepository(DeduccionExterna) private readonly repo: Repository<DeduccionExterna>,
    @InjectRepository(Empleado) private readonly empleados: Repository<Empleado>,
    private readonly bitacora: BitacoraService,
  ) {}

  // Con el reparto semanal del mes en curso, para que quien digita vea cuánto se va a descontar cada semana.
  async listar(empleadoId: string) {
    const [anio, mes] = hoyISO().split('-').map(Number);
    const sabados = sabadosDelMes(anio, mes);
    const filas = await this.repo.find({ where: { empleadoId }, order: { activa: 'DESC', creadoEn: 'DESC' } });
    return filas.map((d) => ({
      ...d,
      semanasDelMes: sabados.map((s) => ({ sabado: s, monto: cuotaSemanalPorSabados(Number(d.cuotaMensual), s) })),
    }));
  }

  private validar(dto: GuardarDeduccionExternaDto) {
    if (dto.fechaHasta && dto.fechaHasta < dto.fechaDesde) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    if (dto.saldo != null && dto.saldo < 0) throw new BadRequestException('El saldo no puede ser negativo.');
  }

  async crear(empleadoId: string, dto: GuardarDeduccionExternaDto, actor: Actor) {
    const empleado = await this.empleados.findOneBy({ id: empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    this.validar(dto);
    const guardada = await this.repo.save(
      this.repo.create({
        empleadoId,
        tipo: 'prestamo_banco_popular',
        descripcion: dto.descripcion.trim(),
        cuotaMensual: dto.cuotaMensual.toFixed(2),
        fechaDesde: dto.fechaDesde,
        fechaHasta: dto.fechaHasta || null,
        saldo: dto.saldo != null ? dto.saldo.toFixed(2) : null,
        activa: true,
      }),
    );
    await this.bitacora.registrar({ accion: 'deduccion_externa', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: empleado.nombre, detalle: `Nuevo préstamo Banco Popular: ${guardada.descripcion}, ₡${guardada.cuotaMensual} al mes` });
    return guardada;
  }

  async actualizar(id: string, dto: GuardarDeduccionExternaDto, actor: Actor) {
    const d = await this.repo.findOne({ where: { id }, relations: { empleado: true } });
    if (!d) throw new NotFoundException('El préstamo no existe.');
    this.validar(dto);
    const antes = `₡${d.cuotaMensual} al mes, ${d.activa ? 'activo' : 'inactivo'}`;
    Object.assign(d, {
      descripcion: dto.descripcion.trim(),
      cuotaMensual: dto.cuotaMensual.toFixed(2),
      fechaDesde: dto.fechaDesde,
      fechaHasta: dto.fechaHasta || null,
      saldo: dto.saldo != null ? dto.saldo.toFixed(2) : null,
      activa: dto.activa ?? d.activa,
    });
    await this.repo.save(d);
    await this.bitacora.registrar({ accion: 'deduccion_externa', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: d.empleado.nombre, detalle: `Préstamo Banco Popular «${d.descripcion}» editado: antes ${antes}; ahora ₡${d.cuotaMensual} al mes, ${d.activa ? 'activo' : 'inactivo'}` });
    const { empleado: _e, ...resto } = d;
    return resto;
  }
}
