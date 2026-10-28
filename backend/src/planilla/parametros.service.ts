import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { TipoParametroPlanilla } from './planilla.enums.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParametroPlanilla } from './parametro-planilla.entity.js';
import { Feriado } from './feriado.entity.js';
import { PARAMETROS_POR_DEFECTO } from './parametros-por-defecto.js';
import type { Parametros } from './calculo.js';
import { HorarioBase } from './horario-base.entity.js';
import { HORARIO_BASE_POR_DEFECTO, validarHorarioSemanal, type HorarioSemanal } from './horario.js';
import type { CrearFeriadoDto } from './dto/otros.dto.js';

@Injectable()
export class ParametrosService implements OnModuleInit {
  constructor(
    @InjectRepository(ParametroPlanilla)
    private readonly parametroRepo: Repository<ParametroPlanilla>,
    @InjectRepository(Feriado)
    private readonly feriadoRepo: Repository<Feriado>,
    @InjectRepository(HorarioBase)
    private readonly horarioRepo: Repository<HorarioBase>,
  ) {}

  // Siembra los parámetros que falten (idempotente por nombre): si más
  // adelante se agrega uno nuevo al código, aparece solo sin pisar los
  // valores que administración ya haya editado.
  async onModuleInit() {
    const filas = await this.parametroRepo.find();
    const existentes = new Set(filas.map((p) => p.nombre));
    // La tolerancia de ± minutos era una sola; ahora hay una por cada marca. Los nuevos arrancan con el valor que ya tenía configurado.
    const viejo = filas.find((p) => p.nombre === 'TOLERANCIA_MARCA_MINUTOS');
    const heredan = ['TOLERANCIA_ENTRADA_MINUTOS', 'TOLERANCIA_SALIDA_MINUTOS', 'TOLERANCIA_ALMUERZO_SALIDA_MINUTOS', 'TOLERANCIA_ALMUERZO_REGRESO_MINUTOS'];
    const faltantes = PARAMETROS_POR_DEFECTO.filter((p) => !existentes.has(p.nombre));
    if (faltantes.length > 0) {
      await this.parametroRepo.save(this.parametroRepo.create(faltantes.map((p) => ({ ...p, valor: String(viejo && heredan.includes(p.nombre) ? Number(viejo.valor) : p.valor) }))));
    }
    if (viejo) await this.parametroRepo.delete({ id: viejo.id });
  }

  // Horario de la fábrica por día; se crea con el horario por defecto la primera vez.
  async horarioBase(): Promise<HorarioSemanal> {
    const fila = await this.horarioRepo.findOneBy({ id: 'general' });
    if (fila) return fila.horario;
    return (await this.horarioRepo.save(this.horarioRepo.create({ id: 'general', horario: HORARIO_BASE_POR_DEFECTO }))).horario;
  }

  async actualizarHorarioBase(valor: unknown): Promise<HorarioSemanal> {
    let horario: HorarioSemanal;
    try {
      horario = validarHorarioSemanal(valor);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'El horario no es válido.');
    }
    await this.horarioBase();
    await this.horarioRepo.update({ id: 'general' }, { horario });
    return horario;
  }

  listar(): Promise<ParametroPlanilla[]> {
    return this.parametroRepo.find({ order: { tipo: 'ASC', nombre: 'ASC' } });
  }

  async mapa(): Promise<Parametros> {
    const todos = await this.parametroRepo.find();
    return Object.fromEntries(todos.map((p) => [p.nombre, Number(p.valor)]));
  }

  // Parámetros que fija la ley (cargas sociales, renta, créditos fiscales, provisiones y recargos).
  // Solo los modifica el gerente general o el administrador del sistema; el resto (horario, almuerzo, tolerancias) lo ajusta administración.
  static esDeLey(p: Pick<ParametroPlanilla, 'nombre' | 'tipo'>): boolean {
    return p.tipo !== TipoParametroPlanilla.JORNADA || p.nombre.startsWith('FACTOR_');
  }

  async actualizar(id: string, valor: number, esGerenteGeneral = false): Promise<ParametroPlanilla> {
    const parametro = await this.parametroRepo.findOneBy({ id });
    if (!parametro) throw new NotFoundException('El parámetro no existe.');
    if (ParametrosService.esDeLey(parametro) && !esGerenteGeneral) {
      throw new ForbiddenException('Los parámetros de ley solo los modifica el gerente general o el administrador del sistema.');
    }
    parametro.valor = String(valor);
    return this.parametroRepo.save(parametro);
  }

  listarFeriados(): Promise<Feriado[]> {
    return this.feriadoRepo.find({ order: { fecha: 'DESC' } });
  }

  async mapaFeriados(): Promise<Map<string, Feriado>> {
    return new Map((await this.feriadoRepo.find()).map((f) => [f.fecha, f]));
  }

  async crearFeriado(dto: CrearFeriadoDto): Promise<Feriado> {
    if (Number.isNaN(Date.parse(dto.fecha))) throw new BadRequestException('La fecha no es válida.');
    if (await this.feriadoRepo.existsBy({ fecha: dto.fecha })) {
      throw new ConflictException('Ya hay un feriado en esa fecha.');
    }
    return this.feriadoRepo.save(
      this.feriadoRepo.create({ fecha: dto.fecha, nombre: dto.nombre.trim(), pagoObligatorio: dto.pagoObligatorio ?? true }),
    );
  }

  async eliminarFeriado(id: string): Promise<void> {
    const resultado = await this.feriadoRepo.delete({ id });
    if (!resultado.affected) throw new NotFoundException('El feriado no existe.');
  }
}
