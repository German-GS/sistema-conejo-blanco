import { exentoDeReloj } from './exento-reloj.js';
import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import type { HorarioSemanal } from './horario.js';
import { unirMarcas } from './marca-punto.js';
import { join } from 'node:path';
import { Between, DataSource, In, Repository } from 'typeorm';
import { DiaAsistencia } from './dia-asistencia.entity.js';
import { ImportacionMarcas } from './importacion-marcas.entity.js';
import { ResolucionDia } from './resolucion-dia.entity.js';
import { AnomaliasService } from './anomalias.service.js';
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
import type { RegistrarMarcasManualesDto } from './dto/horas-manuales.dto.js';
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
// Las horas de tienda se digitan a mano: quien las registra las verifica.
const SUPERVISOR_TIENDA = 'Registro de tienda';

export const CARPETA_JUSTIFICANTES = './uploads/justificantes';

// Al empleado se le aplica su horario por día; si no tiene uno propio ni un
// contrato especial de horas por semana, el de la fábrica.
export function conHorario<T extends Empleado>(e: T, base: HorarioSemanal): T & { horarioSemanal: HorarioSemanal | null } {
  return Object.assign(Object.create(Object.getPrototypeOf(e)), e, {
    horarioSemanal: e.horarioSemanal ?? (e.horasSemana != null && Number(e.horasSemana) > 0 ? null : base),
  });
}

// Un domingo es descanso (día especial) salvo que el horario del empleado lo traiga como día de trabajo.
export function tipoDeDia(fecha: string, feriados: Map<string, Feriado>, horarioSemanal?: HorarioSemanal | null): TipoDia {
  if (feriados.has(fecha)) return 'feriado';
  if (diaSemana(fecha) !== 0) return 'ordinario';
  return horarioSemanal?.dom ? 'ordinario' : 'domingo';
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
    verificado: r.verificado,
    estimacion: r.estimacion,
    supervisor: null as string | null,
  };
}

@Injectable()
export class AsistenciaService implements OnModuleInit {
  // Al arrancar se vuelven a leer los días que nadie resolvió, para que las
  // reglas vigentes (tolerancia, almuerzo fijo, marcas estimadas) también
  // alcancen lo importado antes. No toca días resueltos ni de planillas cerradas.
  onModuleInit() {
    void this.recalcularTodos().catch((err) => new Logger(AsistenciaService.name).warn(`No se pudo recalcular la asistencia: ${err instanceof Error ? err.message : err}`));
  }

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
    private readonly anomalias: AnomaliasService,
    private readonly bitacoraGeneral: BitacoraService,
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
    const empleados = (await this.empleadoRepo.find({ where: { activo: true }, order: { nombre: 'ASC' } })).filter((e) => !e.esPrueba);
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
      throw new BadRequestException('Eligió al mismo empleado para dos números distintos del reloj.');
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
        'El mapeo de columnas está incompleto: indique la columna del número, la fecha y las columnas de horas (o de fecha y hora).',
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
      throw new BadRequestException('No se pudo leer ninguna fecha del archivo. Revise que sea el archivo correcto del reloj.');
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
    // Quien está exento del reloj (cargos de confianza o que no marcan): si aparece en el archivo se omite, no genera días por revisar.
    const omitidosSinReloj: string[] = [];
    for (const presente of lectura.presentes) {
      const numero = normalizarNumeroReloj(presente.numero);
      const empleado = porNumero.get(numero);
      if (empleado?.esPrueba) omitidosSinReloj.push(empleado.nombre);
      else if (empleado?.esDeTienda) omitidosTienda.push(empleado.nombre);
      else if (empleado && exentoDeReloj(empleado)) omitidosSinReloj.push(empleado.nombre);
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
          const emp = conHorario(empleado, base);
          const tipoDia = tipoDeDia(fecha, feriados, emp.horarioSemanal);
          if (tipoDia === 'domingo' && marcas.length === 0) continue;

          const existente = await manager.findOneBy(DiaAsistencia, { empleadoId: empleado.id, fecha });
          // Lo que administración ya decidió no se pisa al volver a importar.
          // Tampoco las marcas anotadas a mano (el archivo del reloj podría venir vacío si el aparato falló).
          if (existente?.resolucionTipo || existente?.origen === 'manual') {
            contadores.yaResueltos++;
            continue;
          }
          // Si el empleado también marcó desde el celular ese día, se juntan las dos fuentes (el reloj no borra lo del celular).
          const marcasDia = existente?.origen === 'app' ? unirMarcas(existente.marcas, marcas) : marcas;
          const r = clasificarDia(marcasDia, tipoDia, p, undefined, esperadoMinutos(fecha, emp, p), opcionesEmpleado(emp, p, fecha));
          const dia = existente ?? manager.create(DiaAsistencia, { empleadoId: empleado.id, fecha });
          Object.assign(dia, aCampos(r, tipoDia), { marcas: r.marcas, importacionId: importacion.id });
          await manager.save(DiaAsistencia, dia);
          // Un almuerzo fuera de lo normal no cambia el pago: queda anotado como anomalía del empleado.
          await this.anomalias.sincronizarAlmuerzo(empleado, fecha, r.estado === EstadoDia.OK ? r.marcas : [], p, manager);

          contadores.dias++;
          if (r.estado === EstadoDia.OK) contadores.correctos++;
          else if (r.estado === EstadoDia.AUSENCIA) contadores.ausencias++;
          else if (r.estado === EstadoDia.FERIADO) contadores.feriados++;
          else contadores.pendientes++;
        }
      }

      const sinArchivo = empleados
        .filter((e) => e.activo && !e.esPrueba && !e.esDeTienda && !exentoDeReloj(e) && !presentesConocidos.has(e.numeroReloj))
        .map((e) => ({ numero: e.numeroReloj, nombre: e.nombre }));

      importacion.resumen = {
        ...contadores,
        empleados: presentesConocidos.size,
        marcas: lectura.marcas.length,
        filasIgnoradas: lectura.filasIgnoradas,
        desconocidos,
        activosSinArchivo: sinArchivo,
        omitidosTienda,
        omitidosSinReloj,
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
      .where('empleado.marca_reloj = true AND empleado.es_confianza = false')
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
      .innerJoin('dia.empleado', 'empleado')
      .where('dia.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .andWhere('empleado.marca_reloj = true AND empleado.es_confianza = false')
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
      const tipoDia = tipoDeDia(d.fecha, feriados, empleadoEf.horarioSemanal);
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
        // Quien digita las horas de tienda es quien las verifica.
        resultado = aplicarResolucion(tipo, { entrada: d.entrada, salida: d.salida, almuerzoMinutos: d.almuerzoMinutos ?? undefined, supervisor: SUPERVISOR_TIENDA }, d.fecha, tipoDia, empleadoEf, p);
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
          supervisor: x.tipo === TipoResolucionDia.HORA_MANUAL ? SUPERVISOR_TIENDA : null,
        });
        const salvado = await manager.save(DiaAsistencia, dia);
        await manager.save(
          ResolucionDia,
          manager.create(ResolucionDia, {
            diaId: salvado.id,
            tipo: x.tipo,
            motivo: x.motivo,
            usuarioId,
            supervisor: x.tipo === TipoResolucionDia.HORA_MANUAL ? SUPERVISOR_TIENDA : null,
            detalle: { origen: 'horas_manuales', antes, datos: x.datos, despues: { minutosNetos: x.resultado.minutosNetos, minutosExtra: x.resultado.minutosExtra, descuenta: x.resultado.descuenta } },
          }),
        );
        guardados.push(salvado);
      }
      return guardados;
    });
  }

  // Marcas anotadas a mano mientras el reloj de huella no funciona. Pasan por las mismas reglas que las del reloj (tolerancia,
  // almuerzo fijo, marcas estimadas, anomalías de almuerzo). Quedan con su origen y quién las anotó. No pisa días ya decididos ni de
  // planillas aprobadas; devuelve qué pasó con cada día.
  async registrarMarcasManuales(dto: RegistrarMarcasManualesDto, usuario: { id: string; email?: string; rol?: string }) {
    if (usuario.rol !== 'sistema' && usuario.rol !== 'gerente_general') {
      throw new ForbiddenException('Solo el administrador del sistema y la gerencia general pueden anotar marcas a mano.');
    }
    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    const base = await this.parametros.horarioBase();
    const empleados = new Map((await this.empleadoRepo.find({ where: { id: In([...new Set(dto.dias.map((d) => d.empleadoId))]) } })).map((e) => [e.id, e]));
    const resultados: Array<{ empleadoId: string; nombre: string; fecha: string; resultado: 'guardado' | 'omitido'; motivo?: string; estado?: EstadoDia; minutosNetos?: number; minutosFaltantes?: number }> = [];

    for (const d of dto.dias) {
      const empleado = empleados.get(d.empleadoId);
      if (!empleado) throw new BadRequestException('Un empleado de la lista no existe.');
      const nombre = empleado.nombre;
      const omitir = (motivo: string) => resultados.push({ empleadoId: empleado.id, nombre, fecha: d.fecha, resultado: 'omitido', motivo });
      if (Number.isNaN(Date.parse(d.fecha))) throw new BadRequestException(`La fecha ${d.fecha} no es válida.`);
      if (exentoDeReloj(empleado) || empleado.esDeTienda || empleado.esPrueba) {
        omitir(empleado.esPrueba ? 'Es un empleado de prueba: no genera asistencia.' : 'No usa el reloj (personal de tienda o puesto de confianza).');
        continue;
      }
      if (d.marcas.length === 0 && !d.ausente) continue; // nada anotado ese día
      if (await this.diaEnPlanillaCerrada(empleado.id, d.fecha)) {
        omitir('Ya está en una planilla aprobada.');
        continue;
      }
      const existente = await this.diaRepo.findOneBy({ empleadoId: empleado.id, fecha: d.fecha });
      if (existente?.resolucionTipo) {
        omitir('Ya tiene una decisión de administración.');
        continue;
      }
      const emp = conHorario(empleado, base);
      const tipoDia = tipoDeDia(d.fecha, feriados, emp.horarioSemanal);
      const marcas = d.ausente ? [] : d.marcas;
      const r = clasificarDia(marcas, tipoDia, p, undefined, esperadoMinutos(d.fecha, emp, p), opcionesEmpleado(emp, p, d.fecha));
      const dia = existente ?? this.diaRepo.create({ empleadoId: empleado.id, fecha: d.fecha });
      Object.assign(dia, aCampos(r, tipoDia), { marcas: r.marcas, importacionId: null, origen: 'manual', registradoPorId: usuario.id, registradoEn: new Date() });
      await this.diaRepo.save(dia);
      await this.anomalias.sincronizarAlmuerzo(empleado, d.fecha, r.estado === EstadoDia.OK ? r.marcas : [], p);
      resultados.push({ empleadoId: empleado.id, nombre, fecha: d.fecha, resultado: 'guardado', estado: r.estado, minutosNetos: r.minutosNetos, minutosFaltantes: r.minutosFaltantes });
    }

    const guardados = resultados.filter((x) => x.resultado === 'guardado').length;
    if (guardados > 0) {
      const fechas = resultados.filter((x) => x.resultado === 'guardado').map((x) => x.fecha).sort();
      await this.bitacoraGeneral.registrar({
        accion: 'marcas_manuales',
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        objetivo: 'asistencia',
        detalle: `${guardados} día(s) anotados a mano, del ${fechas[0]} al ${fechas[fechas.length - 1]}.`,
      });
    }
    return { guardados, omitidos: resultados.length - guardados, resultados };
  }

  // Suma una marca hecha desde el celular a las del día y vuelve a interpretar el día con las mismas reglas del reloj.
  // No toca días ya decididos por administración ni de planillas aprobadas: en ese caso devuelve por qué.
  async sumarMarcaDelCelular(empleado: Empleado, fecha: string, hora: string): Promise<{ sumada: boolean; motivo?: string; marcas: string[] }> {
    const existente = await this.diaRepo.findOneBy({ empleadoId: empleado.id, fecha });
    const actuales = existente?.marcas ?? [];
    if (empleado.esPrueba) return { sumada: false, motivo: 'Empleado de prueba: la marca queda registrada pero no genera asistencia ni planilla.', marcas: actuales };
    if (empleado.esDeTienda) return { sumada: false, motivo: 'Personal de tienda: sus horas se anotan en «Horas de tienda».', marcas: actuales };
    if (existente?.resolucionTipo) return { sumada: false, motivo: 'Este día ya tiene una decisión de administración.', marcas: actuales };
    if (await this.diaEnPlanillaCerrada(empleado.id, fecha)) return { sumada: false, motivo: 'Este día ya está en una planilla aprobada.', marcas: actuales };

    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    const emp = conHorario(empleado, await this.parametros.horarioBase());
    const tipoDia = tipoDeDia(fecha, feriados, emp.horarioSemanal);
    const marcas = unirMarcas(actuales, [hora]);
    const r = clasificarDia(marcas, tipoDia, p, undefined, esperadoMinutos(fecha, emp, p), opcionesEmpleado(emp, p, fecha));
    const dia = existente ?? this.diaRepo.create({ empleadoId: empleado.id, fecha });
    // Un día anotado a mano sigue siendo «manual»: el archivo del reloj no lo pisa.
    Object.assign(dia, aCampos(r, tipoDia), { marcas: r.marcas, origen: existente?.origen === 'manual' ? 'manual' : 'app' });
    await this.diaRepo.save(dia);
    await this.anomalias.sincronizarAlmuerzo(empleado, fecha, r.estado === EstadoDia.OK ? r.marcas : [], p);
    return { sumada: true, marcas: r.marcas };
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
    const horarioEmpleado = conHorario(dia.empleado, await this.parametros.horarioBase());
    const tipoDia = tipoDeDia(dia.fecha, feriados, horarioEmpleado.horarioSemanal);

    let resultado: ResultadoDia;
    try {
      resultado = aplicarResolucion(
        dto.tipo,
        {
          ...dto,
          supervisor: dto.supervisor?.trim() || undefined,
          marcas: dia.marcas,
          almuerzoMinutos:
            dto.tipo === TipoResolucionDia.ALMUERZO_MANUAL
              ? dto.almuerzoMinutos
              : (dto.almuerzoMinutos ?? (dia.almuerzoEstimado ? undefined : dia.minutosAlmuerzo)),
        },
        dia.fecha,
        tipoDia,
        horarioEmpleado,
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
      marcas: dia.marcas,
      verificado: dia.verificado,
      estimacion: dia.estimacion,
      supervisor: dia.supervisor,
    };

    await this.dataSource.transaction(async (manager) => {
      // Las marcas originales del reloj se conservan tal cual; solo cambia
      // lo que se paga.
      Object.assign(dia, aCampos(resultado, tipoDia), {
        resolucionTipo: dto.tipo,
        resolucionMotivo: dto.motivo.trim(),
        justificante: dto.justificante ?? null,
        supervisor: dto.supervisor?.trim() || null,
      });
      await manager.save(DiaAsistencia, dia);
      await manager.save(
        ResolucionDia,
        manager.create(ResolucionDia, {
          diaId: dia.id,
          tipo: dto.tipo,
          motivo: dto.motivo.trim(),
          usuarioId,
          supervisor: dto.supervisor?.trim() || null,
          detalle: {
            antes,
            datos: { entrada: dto.entrada, salida: dto.salida, almuerzoMinutos: dto.almuerzoMinutos, justificarHoras: dto.justificarHoras, justificante: dto.justificante, supervisor: dto.supervisor?.trim() || undefined },
            despues: { estado: resultado.estado, minutosNetos: resultado.minutosNetos, minutosExtra: resultado.minutosExtra, descuenta: resultado.descuenta, minutosDescontar: resultado.minutosDescontar, verificado: resultado.verificado },
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
      .andWhere('empleado.marca_reloj = true AND empleado.es_confianza = false')
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
    const feriados = await this.parametros.mapaFeriados();
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
      const tipoDia = tipoDeDia(dia.fecha, feriados, emp.horarioSemanal);
      const r = clasificarDia(dia.marcas, tipoDia, p, undefined, esperadoMinutos(dia.fecha, emp, p), opcionesEmpleado(emp, p, dia.fecha));
      await this.anomalias.sincronizarAlmuerzo(empleado, dia.fecha, r.estado === EstadoDia.OK ? r.marcas : [], p);
      const nuevo = aCampos(r, tipoDia);
      const igual = (Object.keys(nuevo) as Array<keyof typeof nuevo>).every(
        (k) => JSON.stringify(dia[k as keyof DiaAsistencia] ?? null) === JSON.stringify(nuevo[k] ?? null),
      );
      if (igual) continue;
      Object.assign(dia, nuevo);
      await this.diaRepo.save(dia);
      cambiados++;
    }
    return cambiados;
  }

  // Bitácora de auditoría de correcciones: quién cambió qué día, cuándo, con
  // qué motivo y qué había antes. Nunca se edita ni se borra.
  async bitacora(f: { desde?: string; hasta?: string; empleadoId?: string }) {
    const qb = this.resolucionRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.dia', 'dia')
      .innerJoinAndSelect('dia.empleado', 'empleado')
      .innerJoinAndSelect('r.usuario', 'usuario')
      .orderBy('r.creadoEn', 'DESC')
      .take(500);
    if (f.desde) qb.andWhere('dia.fecha >= :desde', { desde: f.desde });
    if (f.hasta) qb.andWhere('dia.fecha <= :hasta', { hasta: f.hasta });
    if (f.empleadoId) qb.andWhere('dia.empleadoId = :empleadoId', { empleadoId: f.empleadoId });
    const filas = await qb.getMany();
    return filas.map((r) => ({
      id: r.id,
      creadoEn: r.creadoEn,
      tipo: r.tipo,
      motivo: r.motivo,
      supervisor: r.supervisor,
      usuario: { id: r.usuario.id, nombre: r.usuario.nombre },
      empleado: { id: r.dia.empleado.id, nombre: r.dia.empleado.nombre },
      fecha: r.dia.fecha,
      marcas: r.dia.marcas,
      detalle: r.detalle,
    }));
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
    // Quien está exento del reloj no tiene días registrados para el pago: se le paga la jornada completa.
    return this.diaRepo.find({ where: { empleadoId: In(empleadoIds), fecha: Between(desde, hasta), empleado: { marcaReloj: true, esConfianza: false } } });
  }
}
