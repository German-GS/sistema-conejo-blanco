import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { hoyISO, sumarDias } from '../common/utils/fecha.util.js';
import { cuotaExternaDelPeriodo, sabadosDelMes } from './cuotas-externas.js';
import { DeduccionExterna } from './deduccion-externa.entity.js';
import type { GuardarDeduccionExternaDto } from './dto/empleado.dto.js';
import { Empleado } from './empleado.entity.js';
import { FrecuenciaPago } from './planilla.enums.js';

type Actor = { id: string; email?: string };

export const ETIQUETA_TIPO = { prestamo_banco_popular: 'Préstamo Banco Popular', embargo: 'Embargo' } as const;
const ETIQUETA_PERIODO = { semana: 'por semana', quincena: 'por quincena', mes: 'por mes' } as const;

// Cómo se ve el descuento en la colilla y el detalle: «Embargo exp. 12-345», «Préstamo Banco Popular 555».
export const etiquetaDeduccion = (d: Pick<DeduccionExterna, 'tipo' | 'descripcion'>): string => `${ETIQUETA_TIPO[d.tipo]}${d.descripcion?.trim() ? ` ${d.descripcion.trim()}` : ''}`;

@Injectable()
export class DeduccionesExternasService {
  constructor(
    @InjectRepository(DeduccionExterna) private readonly repo: Repository<DeduccionExterna>,
    @InjectRepository(Empleado) private readonly empleados: Repository<Empleado>,
    private readonly bitacora: BitacoraService,
  ) {}

  // Con lo que se descontaría cada semana del mes en curso, para que quien digita vea el efecto de lo que anotó.
  async listar(empleadoId: string) {
    const [anio, mes] = hoyISO().split('-').map(Number);
    const sabados = sabadosDelMes(anio, mes);
    const filas = await this.repo.find({ where: { empleadoId }, order: { activa: 'DESC', creadoEn: 'DESC' } });
    return filas.map((d) => ({
      ...d,
      semanasDelMes: sabados.map((s) => ({ sabado: s, monto: cuotaExternaDelPeriodo(Number(d.monto), d.periodicidad, FrecuenciaPago.SEMANAL, sumarDias(s, -5), sumarDias(s, 1)) })),
    }));
  }

  private validar(dto: GuardarDeduccionExternaDto, desde: string) {
    if (dto.fechaHasta && dto.fechaHasta < desde) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    if (dto.tipo === 'prestamo_banco_popular' && dto.periodicidad === 'quincena') throw new BadRequestException('Un préstamo del banco se descuenta por semana o por mes.');
  }

  async crear(empleadoId: string, dto: GuardarDeduccionExternaDto, actor: Actor) {
    const empleado = await this.empleados.findOneBy({ id: empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    const desde = dto.fechaDesde ?? hoyISO();
    this.validar(dto, desde);
    const guardada = await this.repo.save(
      this.repo.create({
        empleadoId,
        tipo: dto.tipo,
        descripcion: dto.descripcion?.trim() ?? '',
        monto: dto.monto.toFixed(2),
        periodicidad: dto.periodicidad,
        fechaDesde: desde,
        fechaHasta: dto.fechaHasta || null,
        saldo: dto.saldo != null ? dto.saldo.toFixed(2) : null,
        activa: true,
      }),
    );
    await this.bitacora.registrar({ accion: 'deduccion_externa', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: empleado.nombre, detalle: `Nuevo: ${etiquetaDeduccion(guardada)}, ₡${guardada.monto} ${ETIQUETA_PERIODO[guardada.periodicidad]}` });
    return guardada;
  }

  async actualizar(id: string, dto: GuardarDeduccionExternaDto, actor: Actor) {
    const d = await this.repo.findOne({ where: { id }, relations: { empleado: true } });
    if (!d) throw new NotFoundException('El descuento no existe.');
    const desde = dto.fechaDesde ?? d.fechaDesde;
    this.validar(dto, desde);
    const antes = `₡${d.monto} ${ETIQUETA_PERIODO[d.periodicidad]}, ${d.activa ? 'activo' : 'inactivo'}`;
    Object.assign(d, {
      tipo: dto.tipo,
      descripcion: dto.descripcion?.trim() ?? d.descripcion,
      monto: dto.monto.toFixed(2),
      periodicidad: dto.periodicidad,
      fechaDesde: desde,
      fechaHasta: dto.fechaHasta === undefined ? d.fechaHasta : dto.fechaHasta || null,
      saldo: dto.saldo === undefined ? d.saldo : dto.saldo != null ? dto.saldo.toFixed(2) : null,
      activa: dto.activa ?? d.activa,
    });
    await this.repo.save(d);
    await this.bitacora.registrar({ accion: 'deduccion_externa', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: d.empleado.nombre, detalle: `${etiquetaDeduccion(d)} editado: antes ${antes}; ahora ₡${d.monto} ${ETIQUETA_PERIODO[d.periodicidad]}, ${d.activa ? 'activo' : 'inactivo'}` });
    const { empleado: _e, ...resto } = d;
    return resto;
  }
}
