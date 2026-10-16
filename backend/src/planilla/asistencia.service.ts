import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import type { HorarioSemanal } from './horario.js';
import { join } from 'node:path';
import { Between, DataSource, In, Repository } from 'typeorm';
import { DiaAsistencia } from './dia-asistencia.entity.js';
import { ImportacionMarcas } from './importacion-marcas.entity.js';
import { ResolucionDia } from './resolucion-dia.entity.js';
import { Empleado } from './empleado.entity.js';
import { PlanillaLinea } from './planilla-linea.entity.js';
import { ParametrosService } from './parametros.service.js';
import { leerMarcas, previsualizar, type Lectura, type Mapeo } from './lector-excel.js';
import { esXls } from './lector-xls.js';
import { leerTarjetaXls } from './lector-tarjeta.js';
import { aplicarResolucion, clasificarDia, diaSemana, esperadoMinutos, normalizarNumeroReloj, opcionesEmpleado, type ResultadoDia, type TipoDia } from './calculo.js';
import { EstadoDia, EstadoPlanilla, TipoResolucionDia } from './planilla.enums.js';
import { sumarDias } from '../common/utils/fecha.util.js';
import type { Feriado } from './feriado.entity.js';
import type { ResolverDiaDto } from './dto/otros.dto.js';
import type { RegistrarHorasManualesDto } from './dto/horas-manuales.dto.js';

export interface FiltrosDias {
  desde?: string;
  hasta?: string;
  empleadoId?: string;
  // 'revisar' = ausencias + marcas faltantes + marcas ambiguas + horas faltantes
  estado?: EstadoDia | 'revisar' | 'almuerzo';
}

// Carpeta de comprobantes de justificación (dentro de uploads, que en
// producción es el bucket). No se sirve como archivo público: ver main.ts.
export const CARPETA_JUSTIFICANTES = './uploads/justificantes';

// Al empleado se le aplica su horario por día; si no tiene uno propio ni un
// contrato especial de horas por semana, el de la fábrica.
export function conHorario<T extends Empleado>(e: T, base: HorarioSemanal): T & { horarioSemanal: HorarioSemanal | null } {
  return Object.assign(Object.create(Object.getPrototypeOf(e)), e, {
    horarioSemanal: e.horarioSemanal ?? (e.horasSemana != null && Number(e.horasSemana) > 0 ? null : base),
  });
}

export function tipoDeDia(fecha: string, feriados: Map<string, Feriado>): TipoDia {
  if (feriados.has(fecha)) return 'feriado';
  return diaSemana(fecha) === 0 ? 'domingo' : 'ordinario';
}

function aCampos(r: ResultadoDia, tipoDia: TipoDia) {
  return {
    estado: r.estado,
    tipoDia,
    minutosBrutos: r.minutosBrutos,
    minutosAlmuerzo: r.minutosAlmuerzo,
    almuerzoEstimado: r.almuerzoEstimado,
    minutosNetos: r.minutosNetos,
    minutosExtra: r.minutosExtra,
    minutosEspeciales: r.minutosEspeciales,
    descuenta: r.descuenta,
    minutosFaltantes: r.minutosFaltantes,
    minutosDescontar: r.minutosDescontar,
    motivoRevision: r.motivoRevision,
  };
}

@Injectable()
export class AsistenciaService {
  constructor(
    @InjectRepository(DiaAsistencia)
    private readonly diaRepo: Repository<DiaAsistencia>,
    @InjectRepository(ImportacionMarcas)
    private readonly importacionRepo: Repository<ImportacionMarcas>,
    @InjectRepository(ResolucionDia)
    private readonly resolucionRepo: Repository<ResolucionDia>,
    @InjectRepository(Empleado)
    private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(PlanillaLinea)
    private readonly lineaRepo: Repository<PlanillaLinea>,
    private readonly parametros: ParametrosService,
    private readonly dataSource: DataSource,
  ) {}

  // Quita acentos y pasa a mayúsculas para comparar nombres.
  private static normalizarNombre(n: string): string[] {
    return n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((t) => t.length > 1);
  }

  // Parecido entre el nombre del reloj (apellidos primero) y el del
  // sistema: palabras en común, contando también las abreviadas
  // («Bet» ↔ «Betancourt»). Sin importar el orden.
  private static parecido(a: string, b: string): number {
    const ta = AsistenciaService.normalizarNombre(a);
    const tb = AsistenciaService.normalizarNombre(b);
    if (ta.length === 0 || tb.length === 0) return 0;
    const usadas = new Set<number>();
    let coinciden = 0;
    for (const x of ta) {
      const j = tb.findIndex((y, i) => !usadas.has(i) && (x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))));
      if (j >= 0) {
        usadas.add(j);
        coinciden++;
      }
    }
    // Al menos dos palabras en común (un solo nombre igual no basta); se
    // mide contra el nombre más corto porque el reloj suele traer nombres
    // completos y el sistema a veces solo un nombre y dos apellidos.
    return coinciden < 2 ? 0 : coinciden / Math.min(ta.length, tb.length);
  }

  // Para el .xls del reloj: quién es quién. Cada empleado del reloj sale
  // ya vinculado si su número coincide con uno del sistema, o con una
  // sugerencia por nombre si no (el usuario la confirma o la cambia).
  async previsualizar(buffer: Buffer) {
    if (!esXls(buffer)) return { formato: 'tabla' as const, ...(await previsualizar(buffer)) };

    let tarjeta;
    try {
      tarjeta = leerTarjetaXls(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'No se pudo leer el archivo del reloj.');
    }
    const empleados = await this.empleadoRepo.find({ where: { activo: true }, order: { nombre: 'ASC' } });
    const porNumero = new Map(empleados.map((e) => [e.numeroReloj, e]));
    const yaElegidos = new Set<string>();

    const filas = tarjeta.empleados.map((r) => {
      const res = tarjeta.resumen.find((x) => x.numero === r.numero)!;
      const exacto = porNumero.get(normalizarNumeroReloj(r.numero));
      if (exacto) yaElegidos.add(exacto.id);
      // Si el número coincide pero el nombre no se parece, se avisa.
      const nombreDistinto = exacto ? AsistenciaService.parecido(r.nombre, exacto.nombre) < 0.5 : false;
      return { ...r, ...res, empleadoId: exacto?.id ?? null, sugerido: false, nombreDistinto, deTienda: exacto?.esDeTienda === true };
    });
    // Sugerencias por nombre para los que no coinciden por número.
    for (const f of filas.filter((x) => !x.empleadoId)) {
      const candidatos = empleados
        .filter((e) => !yaElegidos.has(e.id) && !e.esDeTienda)
        .map((e) => ({ e, p: AsistenciaService.parecido(f.nombre, e.nombre) }))
        .sort((a, b) => b.p - a.p);
      if (candidatos[0] && candidatos[0].p >= 0.6 && (!candidatos[1] || candidatos[1].p < candidatos[0].p)) {
        f.empleadoId = candidatos[0].e.id;
        f.sugerido = true;
        yaElegidos.add(candidatos[0].e.id);
      }
    }
    return {
      formato: 'tarjeta' as const,
      periodoDesde: tarjeta.fechas[0],
      periodoHasta: tarjeta.fechas[tarjeta.fechas.length - 1],
      marcas: tarjeta.marcas.length,
      empleadosReloj: filas,
      empleadosSistema: empleados.map((e) => ({ id: e.id, nombre: e.nombre, numeroReloj: e.numeroReloj, esDeTienda: e.esDeTienda })),
    };
  }

  // Aplica los vínculos elegidos: el número del reloj pasa a ser el del empleado.
  private async aplicarVinculos(vinculos: Record<string, string>) {
    const pares = Object.entries(vinculos).map(([numero, empleadoId]) => [normalizarNumeroReloj(numero), empleadoId] as const);
    if (new Set(pares.map(([, id]) => id)).size !== pares.length) {
      throw new BadRequestException('Elegiste al mismo empleado para dos números distintos del reloj.');
    }
    // Primero se liberan los números de los empleados a vincular (el número
    // es único), por si dos empleados intercambian números entre sí.
    await this.dataSource.transaction(async (manager) => {
      for (const [, empleadoId] of pares) {
        await manager.update(Empleado, empleadoId, { numeroReloj: `tmp-${empleadoId.slice(0, 8)}` });
      }
      for (const [numero, empleadoId] of pares) {
        const otro = await manager.findOneBy(Empleado, { numeroReloj: numero });
        if (otro && otro.id !== empleadoId) {
          throw new BadRequestException(`El número ${numero} del reloj ya lo tiene ${otro.nombre} en el sistema.`);
        }
        await manager.update(Empleado, empleadoId, { numeroReloj: numero });
      }
    });
  }

  private validarMapeo(m: Mapeo) {
    const ok =
      m &&
      Number.isInteger(m.numero) &&
      m.numero >= 1 &&
      ((m.diseno === 'por_dia' && m.fecha && Array.isArray(m.horas) && m.horas.length > 0) ||
        (m.diseno === 'registro' && (m.fechaHora || (m.fecha && m.hora))));
    if (!ok) {
      throw new BadRequestException(
        'El mapeo de columnas está incompleto: indicá la columna del número, la fecha y las columnas de horas (o de fecha y hora).',
      );
    }
  }

  async importar(buffer: Buffer, nombreArchivo: string, mapeo: Mapeo | null, usuarioId: string, vinculos: Record<string, string> = {}) {
    let lectura: Lectura;
    if (esXls(buffer)) {
      try {
        lectura = leerTarjetaXls(buffer);
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'No se pudo leer el archivo del reloj.');
      }
      if (Object.keys(vinculos).length > 0) await this.aplicarVinculos(vinculos);
      mapeo = { formato: 'tarjeta' } as unknown as Mapeo;
    } else {
      if (!mapeo) throw new BadRequestException('Falta el mapeo de columnas.');
      this.validarMapeo(mapeo);
      lectura = await leerMarcas(buffer, mapeo);
    }
    if (lectura.fechas.length === 0) {
      throw new BadRequestException('No se pudo leer ninguna fecha del archivo. Revisá que sea el archivo correcto del reloj.');
    }
    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    const base = await this.parametros.horarioBase();
    const empleados = await this.empleadoRepo.find();
    const porNumero = new Map(empleados.map((e) => [e.numeroReloj, e]));

    const marcasPor = new Map<string, Map<string, string[]>>();
    for (const marca of lectura.marcas) {
      const numero = normalizarNumeroReloj(marca.numero);
      if (!marcasPor.has(numero)) marcasPor.set(numero, new Map());
      const dias = marcasPor.get(numero)!;
      dias.set(marca.fecha, [...(dias.get(marca.fecha) ?? []), marca.hora]);
    }

    const desde = lectura.fechas[0];
    const hasta = lectura.fechas[lectura.fechas.length - 1];
    const rango: string[] = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) rango.push(f);

    const presentesConocidos = new Map<string, Empleado>();
    const desconocidos: Array<{ numero: string; nombre: string | null }> = [];
    // El personal de tienda no marca en este reloj: si aparece en el archivo se omite.
    const omitidosTienda: string[] = [];
    for (const presente of lectura.presentes) {
      const numero = normalizarNumeroReloj(presente.numero);
      const empleado = porNumero.get(numero);
      if (empleado?.esDeTienda) omitidosTienda.push(empleado.nombre);
      else if (empleado) presentesConocidos.set(numero, empleado);
      else desconocidos.push({ numero, nombre: presente.nombre });
    }

    const contadores = { correctos: 0, ausencias: 0, pendientes: 0, feriados: 0, yaResueltos: 0, dias: 0 };

    const importacion = await this.dataSource.transaction(async (manager) => {
      const importacion = await manager.save(
        ImportacionMarcas,
        manager.create(ImportacionMarcas, {
          nombreArchivo,
          periodoDesde: desde,
          periodoHasta: hasta,
          mapeo: mapeo as unknown as Record<string, unknown>,
          resumen: {},
          usuarioId,
        }),
      );

      for (const [numero, empleado] of presentesConocidos) {
        for (const fecha of rango) {
          const marcas = marcasPor.get(numero)?.get(fecha) ?? [];
          const tipoDia = tipoDeDia(fecha, feriados);
          if (tipoDia === 'domingo' && marcas.length === 0) continue;

          const existente = await manager.findOneBy(DiaAsistencia, { empleadoId: empleado.id, fecha });
          // Lo que administración ya decidió no se pisa al volver a importar.
          if (existente?.resolucionTipo) {
            contadores.yaResueltos++;
            continue;
          }
          const emp = conHorario(empleado, base);
          const r = clasificarDia(marcas, tipoDia, p, undefined, esperadoMinutos(fecha, emp, p), opcionesEmpleado(emp, p, fecha));
          const dia = existente ?? manager.create(DiaAsistencia, { empleadoId: empleado.id, fecha });
          Object.assign(dia, aCampos(r, tipoDia), { marcas: r.marcas, importacionId: importacion.id });
          await manager.save(DiaAsistencia, dia);

          contadores.dias++;
          if (r.estado === EstadoDia.OK) contadores.correctos++;
          else if (r.estado === EstadoDia.AUSENCIA) contadores.ausencias++;
          else if (r.estado === EstadoDia.FERIADO) contadores.feriados++;
          else contadores.pendientes++;
        }
      }

      const sinArchivo = empleados
        .filter((e) => e.activo && !e.esDeTienda && e.marcaReloj && !presentesConocidos.has(e.numeroReloj))
        .map((e) => ({ numero: e.numeroReloj, nombre: e.nombre }));

      importacion.resumen = {
        ...contadores,
        empleados: presentesConocidos.size,
        marcas: lectura.marcas.length,
        filasIgnoradas: lectura.filasIgnoradas,
        desconocidos,
        activosSinArchivo: sinArchivo,
        omitidosTienda,
      };
      return manager.save(ImportacionMarcas, importacion);
    });

    return importacion;
  }

  listarImportaciones(): Promise<ImportacionMarcas[]> {
    return this.importacionRepo.find({ order: { creadoEn: 'DESC' }, take: 20 });
  }

  listarDias(f: FiltrosDias): Promise<DiaAsistencia[]> {
    const qb = this.diaRepo
      .createQueryBuilder('dia')
      .innerJoinAndSelect('dia.empleado', 'empleado')
      .orderBy('dia.fecha', 'ASC')
      .addOrderBy('empleado.nombre', 'ASC')
      .take(1500);
    if (f.desde) qb.andWhere('dia.fecha >= :desde', { desde: f.desde });
    if (f.hasta) qb.andWhere('dia.fecha <= :hasta', { hasta: f.hasta });
    if (f.empleadoId) qb.andWhere('dia.empleado_id = :empleadoId', { empleadoId: f.empleadoId });
    if (f.estado === 'revisar') {
      qb.andWhere('(dia.estado IN (:...estados) OR dia.minutos_descontar > 0)', {
        estados: [EstadoDia.AUSENCIA, EstadoDia.MARCA_FALTANTE, EstadoDia.MARCAS_AMBIGUAS],
      });
    } else if (f.estado === 'almuerzo') {
      // Días con solo entrada y salida en los que se descontó un almuerzo estimado.
      qb.andWhere('dia.almuerzo_estimado = true');
    } else if (f.estado) {
      qb.andWhere('dia.estado = :estado', { estado: f.estado });
    }
    return qb.getMany();
  }

  // Días con marcas faltantes o ambiguas dentro del período: mientras
  // existan, no se puede aprobar una planilla (no se sabe cuánto trabajó).
  async contarPendientes(desde: string, hasta: string, empleadoIds: string[]): Promise<number> {
    if (empleadoIds.length === 0) return 0;
    return this.diaRepo
      .createQueryBuilder('dia')
      .where('dia.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .andWhere('dia.empleado_id IN (:...ids)', { ids: empleadoIds })
      .andWhere('dia.estado IN (:...estados)', { estados: [EstadoDia.MARCA_FALTANTE, EstadoDia.MARCAS_AMBIGUAS] })
      .getCount();
  }

  private diaEnPlanillaCerrada(empleadoId: string, fecha: string): Promise<boolean> {
    return this.lineaRepo
      .createQueryBuilder('linea')
      .innerJoin('linea.planilla', 'planilla')
      .where('linea.empleado_id = :empleadoId', { empleadoId })
      .andWhere(':fecha BETWEEN planilla.fecha_desde AND planilla.fecha_hasta', { fecha })
      .andWhere('planilla.estado IN (:...vigentes)', { vigentes: ESTADOS_VIGENTES })
      .getExists();
  }

  // Horas que se meten a mano día por día (personal de tienda). Cada día queda
  // como una decisión de administración en la bitácora, igual que las demás, y
  // un nuevo archivo del reloj no lo pisa.
  async registrarHorasManuales(dto: RegistrarHorasManualesDto, usuarioId: string): Promise<DiaAsistencia[]> {
    const empleado = await this.empleadoRepo.findOneBy({ id: dto.empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    const fechas = dto.dias.map((d) => d.fecha);
    if (new Set(fechas).size !== fechas.length) throw new BadRequestException('Hay un día repetido.');
    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    const empleadoEf = conHorario(empleado, await this.parametros.horarioBase());

    // Todo se valida antes de guardar, para no dejar la semana a medias.
    const preparados: Array<{ fecha: string; tipoDia: TipoDia; resultado: ResultadoDia; tipo: TipoResolucionDia; motivo: string; datos: Record<string, unknown> }> = [];
    for (const d of [...dto.dias].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      if (Number.isNaN(Date.parse(d.fecha))) throw new BadRequestException(`La fecha ${d.fecha} no es válida.`);
      if (await this.diaEnPlanillaCerrada(empleado.id, d.fecha)) {
        throw new BadRequestException(`El ${d.fecha} ya está en una planilla aprobada: no se puede cambiar.`);
      }
      const tipoDia = tipoDeDia(d.fecha, feriados);
      let tipo: TipoResolucionDia;
      let motivo: string;
      if (d.tipo === 'trabajo') {
        if (!d.entrada || !d.salida) throw new BadRequestException(`Falta la entrada o la salida del ${d.fecha}.`);
        tipo = TipoResolucionDia.HORA_MANUAL;
        motivo = d.motivo?.trim() || 'Horas de tienda ingresadas a mano';
      } else if (d.tipo === 'libre') {
        tipo = TipoResolucionDia.AUSENCIA_JUSTIFICADA;
        motivo = d.motivo?.trim() || 'Día libre (se paga)';
      } else {
        tipo = TipoResolucionDia.AUSENCIA_INJUSTIFICADA;
        motivo = d.motivo?.trim() || 'Ausencia (tienda)';
      }
      let resultado: ResultadoDia;
      try {
        resultado = aplicarResolucion(tipo, { entrada: d.entrada, salida: d.salida, almuerzoMinutos: d.almuerzoMinutos ?? undefined }, d.fecha, tipoDia, empleadoEf, p);
      } catch (err) {
        throw new BadRequestException(`${d.fecha}: ${err instanceof Error ? err.message : 'las horas no son válidas.'}`);
      }
      preparados.push({ fecha: d.fecha, tipoDia, resultado, tipo, motivo, datos: { entrada: d.entrada, salida: d.salida, almuerzoMinutos: d.almuerzoMinutos } });
    }

    return this.dataSource.transaction(async (manager) => {
      const guardados: DiaAsistencia[] = [];
      for (const x of preparados) {
        const existente = await manager.findOneBy(DiaAsistencia, { empleadoId: empleado.id, fecha: x.fecha });
        const dia = existente ?? manager.create(DiaAsistencia, { empleadoId: empleado.id, fecha: x.fecha });
        const antes = existente ? { estado: existente.estado, minutosNetos: existente.minutosNetos, resolucionTipo: existente.resolucionTipo } : null;
        Object.assign(dia, aCampos(x.resultado, x.tipoDia), {
          marcas: x.resultado.marcas,
          importacionId: null,
          resolucionTipo: x.tipo,
          resolucionMotivo: x.motivo,
          justificante: null,
        });
        const salvado = await manager.save(DiaAsistencia, dia);
        await manager.save(
          ResolucionDia,
          manager.create(ResolucionDia, {
            diaId: salvado.id,
            tipo: x.tipo,
            motivo: x.motivo,
            usuarioId,
            detalle: { origen: 'horas_manuales', antes, datos: x.datos, despues: { minutosNetos: x.resultado.minutosNetos, minutosExtra: x.resultado.minutosExtra, descuenta: x.resultado.descuenta } },
          }),
        );
        guardados.push(salvado);
      }
      return guardados;
    });
  }

  async resolver(diaId: string, dto: ResolverDiaDto, usuarioId: string): Promise<DiaAsistencia> {
    const dia = await this.diaRepo.findOne({ where: { id: diaId }, relations: { empleado: true } });
    if (!dia) throw new NotFoundException('El día no existe.');

    const enPlanillaCerrada = await this.diaEnPlanillaCerrada(dia.empleadoId, dia.fecha);
    if (enPlanillaCerrada) {
      throw new BadRequestException('Este día ya está en una planilla aprobada: no se puede cambiar.');
    }

    if (dto.justificante && !existsSync(join(CARPETA_JUSTIFICANTES, dto.justificante))) {
      throw new BadRequestException('El comprobante no se encontró: subilo de nuevo.');
    }

    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    const tipoDia = tipoDeDia(dia.fecha, feriados);

    let resultado: ResultadoDia;
    try {
      resultado = aplicarResolucion(
        dto.tipo,
        {
          ...dto,
          marcas: dia.marcas,
          almuerzoMinutos:
            dto.tipo === TipoResolucionDia.ALMUERZO_MANUAL
              ? dto.almuerzoMinutos
              : (dto.almuerzoMinutos ?? (dia.almuerzoEstimado ? undefined : dia.minutosAlmuerzo)),
        },
        dia.fecha,
        tipoDia,
        conHorario(dia.empleado, await this.parametros.horarioBase()),
        p,
      );
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'La decisión no es válida.');
    }

    const antes = {
      estado: dia.estado,
      minutosNetos: dia.minutosNetos,
      minutosExtra: dia.minutosExtra,
      descuenta: dia.descuenta,
      minutosDescontar: dia.minutosDescontar,
      resolucionTipo: dia.resolucionTipo,
      resolucionMotivo: dia.resolucionMotivo,
    };

    await this.dataSource.transaction(async (manager) => {
      // Las marcas originales del reloj se conservan tal cual; solo cambia
      // lo que se paga.
      Object.assign(dia, aCampos(resultado, tipoDia), {
        resolucionTipo: dto.tipo,
        resolucionMotivo: dto.motivo.trim(),
        justificante: dto.justificante ?? null,
      });
      await manager.save(DiaAsistencia, dia);
      await manager.save(
        ResolucionDia,
        manager.create(ResolucionDia, {
          diaId: dia.id,
          tipo: dto.tipo,
          motivo: dto.motivo.trim(),
          usuarioId,
          detalle: {
            antes,
            datos: { entrada: dto.entrada, salida: dto.salida, almuerzoMinutos: dto.almuerzoMinutos, justificarHoras: dto.justificarHoras, justificante: dto.justificante },
            despues: { minutosNetos: resultado.minutosNetos, minutosExtra: resultado.minutosExtra, descuenta: resultado.descuenta, minutosDescontar: resultado.minutosDescontar },
          },
        }),
      );
    });
    return dia;
  }

  // Resumen por empleado en un rango: cuánto trabajó contra lo que le toca
  // según su jornada (para decidir un día raro viendo cómo le fue en la semana).
  async resumenPeriodo(desde: string, hasta: string) {
    const p = await this.parametros.mapa();
    const base = await this.parametros.horarioBase();
    const dias = await this.diaRepo
      .createQueryBuilder('dia')
      .innerJoinAndSelect('dia.empleado', 'empleado')
      .where('dia.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .getMany();
    const porEmpleado = new Map<string, { empleadoId: string; nombre: string; horasSemanaOrdinarias: number; trabajadoMin: number; esperadoMin: number; diasTrabajados: number; diasSinMarcas: number; esConfianza: boolean }>();
    for (const d of dias) {
      const e = d.empleado;
      const r =
        porEmpleado.get(e.id) ??
        { empleadoId: e.id, nombre: e.nombre, horasSemanaOrdinarias: e.horasSemana != null ? Number(e.horasSemana) : p.HORAS_SEMANA_PAGADAS, trabajadoMin: 0, esperadoMin: 0, diasTrabajados: 0, diasSinMarcas: 0, esConfianza: e.esConfianza };
      r.trabajadoMin += d.minutosNetos;
      if (d.tipoDia === 'ordinario') r.esperadoMin += esperadoMinutos(d.fecha, conHorario(e, base), p);
      if (d.minutosNetos > 0) r.diasTrabajados++;
      if (d.marcas.length === 0) r.diasSinMarcas++;
      porEmpleado.set(e.id, r);
    }
    return [...porEmpleado.values()];
  }

  // Después de cambiar el horario de la fábrica: se vuelven a leer los días
  // pendientes de todos los empleados.
  async recalcularTodos(): Promise<number> {
    let cambiados = 0;
    for (const e of await this.empleadoRepo.find({ select: { id: true } })) cambiados += await this.recalcularPendientes(e.id);
    return cambiados;
  }

  // Vuelve a interpretar las marcas guardadas de un empleado con su
  // configuración actual (horas por semana, almuerzo, horario). Solo toca los
  // días que nadie ha resuelto a mano ni están en una planilla ya aprobada.
  async recalcularPendientes(empleadoId: string): Promise<number> {
    const empleado = await this.empleadoRepo.findOneBy({ id: empleadoId });
    if (!empleado) return 0;
    const p = await this.parametros.mapa();
    const base = await this.parametros.horarioBase();
    const emp = conHorario(empleado, base);
    const cerradas = await this.lineaRepo
      .createQueryBuilder('l')
      .innerJoin('l.planilla', 'pl')
      .select(['pl.fecha_desde AS desde', 'pl.fecha_hasta AS hasta'])
      .where('l.empleado_id = :id', { id: empleadoId })
      .andWhere('pl.estado IN (:...vigentes)', { vigentes: ESTADOS_VIGENTES })
      .getRawMany<{ desde: string; hasta: string }>();
    const dias = await this.diaRepo.find({ where: { empleadoId } });
    let cambiados = 0;
    for (const dia of dias) {
      if (dia.resolucionTipo) continue;
      if (cerradas.some((c) => dia.fecha >= String(c.desde).slice(0, 10) && dia.fecha <= String(c.hasta).slice(0, 10))) continue;
      const tipoDia = dia.tipoDia as TipoDia;
      const r = clasificarDia(dia.marcas, tipoDia, p, undefined, esperadoMinutos(dia.fecha, emp, p), opcionesEmpleado(emp, p, dia.fecha));
      const nuevo = aCampos(r, tipoDia);
      const igual = (Object.keys(nuevo) as Array<keyof typeof nuevo>).every((k) => dia[k as keyof DiaAsistencia] === nuevo[k]);
      if (igual) continue;
      Object.assign(dia, nuevo);
      await this.diaRepo.save(dia);
      cambiados++;
    }
    return cambiados;
  }

  listarResoluciones(diaId: string): Promise<ResolucionDia[]> {
    return this.resolucionRepo.find({
      where: { diaId },
      relations: { usuario: true },
      select: { usuario: { id: true, nombre: true } },
      order: { creadoEn: 'DESC' },
    });
  }

  diasDeEmpleados(desde: string, hasta: string, empleadoIds: string[]): Promise<DiaAsistencia[]> {
    if (empleadoIds.length === 0) return Promise.resolve([]);
    return this.diaRepo.find({ where: { empleadoId: In(empleadoIds), fecha: Between(desde, hasta) } });
  }
}
