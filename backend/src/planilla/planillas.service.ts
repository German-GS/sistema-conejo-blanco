import { exentoDeReloj } from './exento-reloj.js';
import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { CuentasBancariasService } from '../pagos/cuentas-bancarias.service.js';
import { AsientoContable } from '../contabilidad/asiento-contable.entity.js';
import type { PagarPlanillaDto } from './dto/otros.dto.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { Planilla } from './planilla.entity.js';
import { PlanillaLinea } from './planilla-linea.entity.js';
import { Empleado } from './empleado.entity.js';
import { DeudaEmpleado } from './deuda-empleado.entity.js';
import { ParametrosService } from './parametros.service.js';
import { AsistenciaService } from './asistencia.service.js';
import { calcularLinea, diaSemana, diasLaborables, type DiaParaPago } from './calculo.js';
import { EstadoPlanilla, FrecuenciaPago } from './planilla.enums.js';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO, sumarDias } from '../common/utils/fecha.util.js';
import type { AprobarPlanillaDto, CrearPlanillaDto } from './dto/otros.dto.js';

const REFERENCIA_PLANILLA = 'planilla';
const REFERENCIA_PLANILLA_PAGO = 'planilla_pago';

// Rango de la planilla a partir de una fecha: semanal = 7 días desde ahí;
// quincenal = la mitad del mes que contiene la fecha; mensual = el mes.
export function rangoDePlanilla(frecuencia: FrecuenciaPago, fecha: string): { desde: string; hasta: string } {
  if (frecuencia === FrecuenciaPago.SEMANAL) return { desde: fecha, hasta: sumarDias(fecha, 6) };
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const pref = `${anio}-${String(mes).padStart(2, '0')}`;
  if (frecuencia === FrecuenciaPago.MENSUAL) return { desde: `${pref}-01`, hasta: `${pref}-${String(ultimo).padStart(2, '0')}` };
  return dia <= 15 ? { desde: `${pref}-01`, hasta: `${pref}-15` } : { desde: `${pref}-16`, hasta: `${pref}-${String(ultimo).padStart(2, '0')}` };
}

@Injectable()
export class PlanillasService {
  constructor(
    @InjectRepository(Planilla)
    private readonly planillaRepo: Repository<Planilla>,
    @InjectRepository(PlanillaLinea)
    private readonly lineaRepo: Repository<PlanillaLinea>,
    @InjectRepository(Empleado)
    private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(DeudaEmpleado)
    private readonly deudaRepo: Repository<DeudaEmpleado>,
    private readonly parametros: ParametrosService,
    private readonly asistencia: AsistenciaService,
    private readonly contabilidad: ContabilidadService,
    private readonly cuentasBancarias: CuentasBancariasService,
    private readonly dataSource: DataSource,
  ) {}

  listar(): Promise<Planilla[]> {
    return this.planillaRepo.find({ order: { fechaDesde: 'DESC', creadoEn: 'DESC' } });
  }

  async buscarOFallar(id: string): Promise<Planilla> {
    const planilla = await this.planillaRepo.findOne({
      where: { id },
      relations: { lineas: true },
      order: { lineas: { empleadoNombre: 'ASC' } },
    });
    if (!planilla) throw new NotFoundException('La planilla no existe.');
    return planilla;
  }

  // Lo que la pantalla necesita para decidir si se puede aprobar.
  async detalle(id: string) {
    const planilla = await this.buscarOFallar(id);
    const ids = planilla.lineas.map((l) => l.empleadoId);
    const pendientes = await this.asistencia.contarPendientes(planilla.fechaDesde, planilla.fechaHasta, ids);
    const conDiasSinDatos = planilla.lineas
      .filter((l) => Number((l.detalle as { diasSinDatos?: number }).diasSinDatos ?? 0) > 0)
      .map((l) => ({
        empleadoId: l.empleadoId,
        deTienda: (l.detalle as { deTienda?: boolean }).deTienda === true,
        empleado: l.empleadoNombre,
        dias: (l.detalle as { diasSinDatos: number }).diasSinDatos,
        fechas: (l.detalle as { fechasSinDatos?: string[] }).fechasSinDatos ?? [],
      }));
    return { planilla, pendientes, conDiasSinDatos };
  }

  async crear(dto: CrearPlanillaDto, usuarioId: string): Promise<Planilla> {
    if (Number.isNaN(Date.parse(dto.fechaDesde))) throw new BadRequestException('La fecha no es válida.');
    const { desde, hasta } = rangoDePlanilla(dto.frecuencia, dto.fechaDesde);

    const traslape = await this.planillaRepo
      .createQueryBuilder('p')
      .where('p.frecuencia = :f', { f: dto.frecuencia })
      .andWhere('p.fecha_desde <= :hasta AND p.fecha_hasta >= :desde', { desde, hasta })
      .andWhere('p.estado != :anulada', { anulada: EstadoPlanilla.ANULADA })
      .getOne();
    if (traslape) {
      throw new ConflictException(`Ya existe una planilla ${dto.frecuencia} del ${traslape.fechaDesde} al ${traslape.fechaHasta}.`);
    }

    const planilla = await this.planillaRepo.save(
      this.planillaRepo.create({ frecuencia: dto.frecuencia, fechaDesde: desde, fechaHasta: hasta, creadaPorId: usuarioId }),
    );
    try {
      await this.calcular(planilla);
    } catch (err) {
      await this.planillaRepo.delete({ id: planilla.id });
      throw err;
    }
    return this.buscarOFallar(planilla.id);
  }

  async recalcular(id: string): Promise<Planilla> {
    const planilla = await this.buscarOFallar(id);
    if (planilla.estado !== EstadoPlanilla.BORRADOR) {
      throw new BadRequestException('Solo se puede recalcular una planilla en borrador.');
    }
    await this.calcular(planilla);
    return this.buscarOFallar(id);
  }

  async eliminarBorrador(id: string): Promise<void> {
    const planilla = await this.buscarOFallar(id);
    if (planilla.estado !== EstadoPlanilla.BORRADOR) {
      throw new BadRequestException('Solo se puede eliminar una planilla en borrador.');
    }
    await this.planillaRepo.delete({ id });
  }

  // (Re)arma todas las líneas de una planilla en borrador a partir de las
  // marcas ya interpretadas, los parámetros vigentes y las deudas activas.
  private async calcular(planilla: Planilla): Promise<void> {
    const p = await this.parametros.mapa();
    const feriados = await this.parametros.mapaFeriados();
    // Entra a la planilla quien está activo, y quien cesó dentro (o después
    // del inicio) del período: a ese se le paga hasta el día del cese.
    const empleados = (
      await this.empleadoRepo.find({ where: { frecuenciaPago: planilla.frecuencia }, order: { nombre: 'ASC' } })
    )
      .filter((e) => (e.fechaCese ? e.fechaCese >= planilla.fechaDesde : e.activo))
      .filter((e) => !e.fechaIngreso || e.fechaIngreso <= planilla.fechaHasta);
    if (empleados.length === 0) {
      throw new BadRequestException(`No hay empleados activos con pago ${planilla.frecuencia}.`);
    }

    const dias = await this.asistencia.diasDeEmpleados(planilla.fechaDesde, planilla.fechaHasta, empleados.map((e) => e.id));
    const mes = planilla.fechaHasta.slice(0, 7);
    const laborables = diasLaborables(planilla.fechaDesde, planilla.fechaHasta);

    const lineas: PlanillaLinea[] = [];
    for (const empleado of empleados) {
      // Las marcas posteriores al cese no cuentan.
      const diasEmp = dias.filter((d) => d.empleadoId === empleado.id && (!empleado.fechaCese || d.fecha <= empleado.fechaCese));
      const porFecha = new Map(diasEmp.map((d) => [d.fecha, d]));
      const diasPago: DiaParaPago[] = diasEmp.map((d) => ({
        fecha: d.fecha,
        tipoDia: d.tipoDia as DiaParaPago['tipoDia'],
        estado: d.estado,
        descuenta: d.descuenta,
        minutosNetos: d.minutosNetos,
        minutosExtra: d.minutosExtra,
        minutosEspeciales: d.minutosEspeciales,
        minutosDescontar: d.minutosDescontar,
        feriadoPagoObligatorio: feriados.get(d.fecha)?.pagoObligatorio ?? true,
      }));
      // Feriados sin registro de marcas cuentan como feriado sin trabajar.
      for (const fecha of laborables) {
        const feriado = feriados.get(fecha);
        if (feriado && !porFecha.has(fecha)) {
          diasPago.push({
            fecha,
            tipoDia: 'feriado',
            estado: 'feriado' as DiaParaPago['estado'],
            descuenta: false,
            minutosNetos: 0,
            minutosExtra: 0,
            minutosEspeciales: 0,
            feriadoPagoObligatorio: feriado.pagoObligatorio,
          });
        }
      }
      // Días después del cese: no trabaja, no se le paga (se rebajan como los
      // días de ausencia, que proporciona el salario del período).
      if (empleado.fechaCese) {
        for (const fecha of laborables) {
          if (fecha > empleado.fechaCese && !porFecha.has(fecha)) {
            diasPago.push({
              fecha,
              tipoDia: 'ordinario',
              estado: 'ausencia' as DiaParaPago['estado'],
              descuenta: true,
              minutosNetos: 0,
              minutosExtra: 0,
              minutosEspeciales: 0,
              feriadoPagoObligatorio: true,
            });
          }
        }
      }
      // Quien no usa el reloj (ej. gerencia) no tiene días «sin datos»: se le paga completo.
      const fechasSinDatos = exentoDeReloj(empleado)
        ? []
        : laborables.filter(
            (f) =>
              !porFecha.has(f) &&
              !feriados.has(f) &&
              (!empleado.fechaIngreso || f >= empleado.fechaIngreso) &&
              (!empleado.fechaCese || f <= empleado.fechaCese),
          );
      const diasSinDatos = fechasSinDatos.length;

      const previo = await this.lineaRepo
        .createQueryBuilder('l')
        .innerJoin('l.planilla', 'pl')
        .select('COALESCE(SUM(l.bruto), 0)', 'bruto')
        .addSelect('COALESCE(SUM(l.renta), 0)', 'renta')
        .where('l.empleado_id = :id', { id: empleado.id })
        .andWhere('pl.estado IN (:...vigentes)', { vigentes: ESTADOS_VIGENTES })
        .andWhere('pl.id != :planilla', { planilla: planilla.id })
        .andWhere("to_char(pl.fecha_hasta, 'YYYY-MM') = :mes", { mes })
        .getRawOne<{ bruto: string; renta: string }>();

      const deudas = await this.deudaRepo.find({ where: { empleadoId: empleado.id, activa: true }, order: { creadoEn: 'ASC' } });

      const r = calcularLinea({
        empleado: {
          tipoSalario: empleado.tipoSalario,
          montoSalario: Number(empleado.montoSalario),
          horasSemana: empleado.horasSemana != null ? Number(empleado.horasSemana) : null,
          sector: empleado.sector,
          frecuenciaPago: empleado.frecuenciaPago,
          tieneConyuge: empleado.tieneConyuge,
          cantidadHijos: empleado.cantidadHijos,
        },
        dias: diasPago,
        desde: planilla.fechaDesde,
        hasta: planilla.fechaHasta,
        p,
        brutoPrevioMes: Number(previo?.bruto ?? 0),
        rentaPrevioMes: Number(previo?.renta ?? 0),
        deudas: deudas.filter((d) => Number(d.saldo) > 0).map((d) => ({
          id: d.id,
          descripcion: d.descripcion,
          cuota: Number(d.cuotaPorPlanilla),
          saldo: Number(d.saldo),
        })),
      });

      lineas.push(
        this.lineaRepo.create({
          planillaId: planilla.id,
          empleadoId: empleado.id,
          empleadoNombre: empleado.nombre,
          empleadoCedula: empleado.cedula,
          salarioBase: r.salarioBase.toFixed(2),
          tarifaHora: r.tarifaHora.toFixed(2),
          diasAusenciaDescontados: r.diasAusenciaDescontados,
          descuentoAusencias: r.descuentoAusencias.toFixed(2),
          horasAusentes: r.horasAusentes.toFixed(2),
          descuentoHoras: r.descuentoHoras.toFixed(2),
          horasExtra: r.horasExtra.toFixed(2),
          montoExtra: r.montoExtra.toFixed(2),
          horasEspeciales: r.horasEspeciales.toFixed(2),
          montoEspeciales: r.montoEspeciales.toFixed(2),
          bruto: r.bruto.toFixed(2),
          sem: r.sem.toFixed(2),
          ivm: r.ivm.toFixed(2),
          bancoPopular: r.bancoPopular.toFixed(2),
          renta: r.renta.toFixed(2),
          deudasDescontadas: r.deudasDescontadas.toFixed(2),
          totalDeducciones: r.totalDeducciones.toFixed(2),
          neto: r.neto.toFixed(2),
          cargasPatronales: r.cargasPatronales.toFixed(2),
          desgloseCargas: r.desgloseCargas,
          provisiones: r.provisiones.toFixed(2),
          desgloseProvisiones: r.desgloseProvisiones,
          detalle: {
            diasSinDatos,
            fechasSinDatos,
            deTienda: empleado.esDeTienda,
            deudas: r.detalleDeudas,
            brutoPrevioMes: Number(previo?.bruto ?? 0),
            rentaPrevioMes: Number(previo?.renta ?? 0),
            dias: diasPago
              .filter((d) => diaSemana(d.fecha) !== 0 || d.minutosEspeciales > 0)
              .sort((a, b) => a.fecha.localeCompare(b.fecha))
              .map((d) => ({
                fecha: d.fecha,
                estado: d.estado,
                tipoDia: d.tipoDia,
                netos: d.minutosNetos,
                extra: d.minutosExtra,
                especiales: d.minutosEspeciales,
                descontar: d.minutosDescontar ?? 0,
                descuenta: d.descuenta,
              })),
          },
        }),
      );
    }

    const suma = (campo: (l: PlanillaLinea) => string) => redondear(lineas.reduce((a, l) => a + Number(campo(l)), 0));
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PlanillaLinea, { planillaId: planilla.id });
      await manager.save(PlanillaLinea, lineas);
      await manager.update(Planilla, planilla.id, {
        totalBruto: suma((l) => l.bruto).toFixed(2),
        totalDeducciones: suma((l) => l.totalDeducciones).toFixed(2),
        totalNeto: suma((l) => l.neto).toFixed(2),
        totalCargasPatronales: suma((l) => l.cargasPatronales).toFixed(2),
        totalProvisiones: suma((l) => l.provisiones).toFixed(2),
      });
    });
  }

  async aprobar(id: string, dto: AprobarPlanillaDto, usuarioId: string): Promise<Planilla> {
    // Se recalcula justo antes de aprobar: lo que se congela es lo vigente
    // hoy, no lo de cuando se creó el borrador.
    let planilla = await this.buscarOFallar(id);
    if (planilla.estado !== EstadoPlanilla.BORRADOR) throw new BadRequestException('Esta planilla ya fue aprobada.');
    await this.calcular(planilla);
    const { planilla: fresca, pendientes, conDiasSinDatos } = await this.detalle(id);
    planilla = fresca;

    if (pendientes > 0) {
      throw new BadRequestException(
        `Hay ${pendientes} día(s) con marcas faltantes o ambiguas sin resolver. Resolvelos en Asistencia antes de aprobar.`,
      );
    }
    if (conDiasSinDatos.length > 0 && !dto.aceptarDiasSinDatos) {
      throw new BadRequestException(
        `Faltan marcas de algunos días para: ${conDiasSinDatos.map((c) => `${c.empleado} (${c.dias})`).join(', ')}. Importe el archivo del reloj o confirme que se pague igual.`,
      );
    }

    const lineas = planilla.lineas;
    const suma = (campo: (l: PlanillaLinea) => string) => redondear(lineas.reduce((a, l) => a + Number(campo(l)), 0));
    const bruto = suma((l) => l.bruto);
    const neto = suma((l) => l.neto);
    const obrero = redondear(suma((l) => l.sem) + suma((l) => l.ivm) + suma((l) => l.bancoPopular));
    const renta = suma((l) => l.renta);
    const deudas = suma((l) => l.deudasDescontadas);
    const patronal = suma((l) => l.cargasPatronales);
    const provisiones = suma((l) => l.provisiones);
    // La póliza de riesgos del trabajo se paga al INS, no a la CCSS: va a su propia cuenta por pagar.
    const ins = Math.min(
      patronal,
      redondear(lineas.reduce((a, l) => a + Number((l.desgloseCargas as Record<string, number>)?.APORTE_PATRONAL_INS_RIESGOS ?? 0), 0)),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Planilla, id, {
        estado: EstadoPlanilla.APROBADA,
        aprobadaEn: new Date(),
        aprobadaPorId: usuarioId,
      });

      // Las deudas descontadas bajan de saldo; al llegar a cero se cierran.
      for (const linea of lineas) {
        for (const d of (linea.detalle as { deudas?: Array<{ id: string; monto: number }> }).deudas ?? []) {
          const deuda = await manager.findOneByOrFail(DeudaEmpleado, { id: d.id });
          const saldo = redondear(Number(deuda.saldo) - d.monto);
          await manager.update(DeudaEmpleado, deuda.id, { saldo: saldo.toFixed(2), activa: saldo > 0 });
        }
      }

      const asientoLineas = [
        { codigoCuenta: CUENTA.SUELDOS_Y_SALARIOS, debe: bruto },
        { codigoCuenta: CUENTA.CARGAS_SOCIALES_PATRONALES, debe: patronal },
        { codigoCuenta: CUENTA.GASTO_PROVISIONES, debe: provisiones },
        { codigoCuenta: CUENTA.SALARIOS_POR_PAGAR, haber: neto },
        { codigoCuenta: CUENTA.CARGAS_SOCIALES_POR_PAGAR, haber: redondear(obrero + patronal - ins) },
        { codigoCuenta: CUENTA.INS_POR_PAGAR, haber: ins },
        { codigoCuenta: CUENTA.RENTA_SALARIOS_POR_PAGAR, haber: renta },
        { codigoCuenta: CUENTA.PROVISIONES_POR_PAGAR, haber: provisiones },
        { codigoCuenta: CUENTA.CUENTAS_POR_COBRAR_EMPLEADOS, haber: deudas },
      ].filter((l) => (l.debe ?? 0) > 0 || (l.haber ?? 0) > 0);

      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha: planilla.fechaHasta,
        descripcion: `Planilla ${planilla.frecuencia} del ${planilla.fechaDesde} al ${planilla.fechaHasta}`,
        origenTipo: REFERENCIA_PLANILLA,
        origenId: id,
        lineas: asientoLineas,
      });
    });
    return this.buscarOFallar(id);
  }

  async pagar(id: string, dto: PagarPlanillaDto = {}): Promise<Planilla> {
    const planilla = await this.buscarOFallar(id);
    if (planilla.estado !== EstadoPlanilla.APROBADA) {
      throw new BadRequestException('Solo se puede pagar una planilla aprobada.');
    }
    const hoy = hoyISO();
    const fecha = dto.fecha ?? hoy;
    if (fecha > hoy) throw new BadRequestException('La fecha del pago no puede ser futura.');
    if (fecha < planilla.fechaDesde) throw new BadRequestException('La fecha del pago no puede ser anterior al inicio de la planilla.');

    // El pago sale de la cuenta bancaria elegida (su cuenta contable propia) o,
    // sin elegir, de la caja general.
    const cuenta = dto.cuentaBancariaId ? await this.cuentasBancarias.buscarActivaOFallar(dto.cuentaBancariaId) : null;
    const codigoCuenta = cuenta?.cuentaContable.codigo ?? CUENTA.CAJA;
    const neto = redondear(planilla.lineas.reduce((a, l) => a + Number(l.neto), 0));
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Planilla, id, { estado: EstadoPlanilla.PAGADA, pagadaEn: new Date() });
      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha,
        descripcion: `Pago de planilla ${planilla.frecuencia} del ${planilla.fechaDesde} al ${planilla.fechaHasta}${cuenta ? ` — ${cuenta.nombre}` : ''}`,
        origenTipo: REFERENCIA_PLANILLA_PAGO,
        origenId: id,
        lineas: [
          { codigoCuenta: CUENTA.SALARIOS_POR_PAGAR, debe: neto },
          { codigoCuenta, haber: neto },
        ],
      });
    });
    return this.buscarOFallar(id);
  }

  // Asientos de la planilla separados por tipo. Los pagos hechos antes de existir
  // 'planilla_pago' quedaron con origen 'planilla' y descripción "Pago de planilla…".
  private async asientosDe(manager: EntityManager, id: string, cuales: 'aprobacion' | 'pago'): Promise<AsientoContable[]> {
    const todos = await manager.find(AsientoContable, {
      where: [{ origenTipo: REFERENCIA_PLANILLA, origenId: id }, { origenTipo: REFERENCIA_PLANILLA_PAGO, origenId: id }],
      relations: { lineas: { cuenta: true } },
      order: { numero: 'ASC' },
    });
    const esPago = (a: AsientoContable) => a.origenTipo === REFERENCIA_PLANILLA_PAGO || a.descripcion.startsWith('Pago de planilla');
    return todos.filter((a) => (cuales === 'pago' ? esPago(a) : !esPago(a)));
  }

  // El pago se registró mal (cuenta, monto, fecha): se reversa el asiento y la
  // planilla vuelve a "aprobada" para registrarlo de nuevo.
  async reversarPago(id: string, motivo: string): Promise<Planilla> {
    const planilla = await this.buscarOFallar(id);
    if (planilla.estado !== EstadoPlanilla.PAGADA) throw new BadRequestException('Solo se puede reversar el pago de una planilla pagada.');
    await this.dataSource.transaction(async (manager) => {
      const pagos = await this.asientosDe(manager, id, 'pago');
      await this.contabilidad.reversarAsientosEnTransaccion(manager, pagos, motivo, `Reversa del pago de planilla del ${planilla.fechaDesde} al ${planilla.fechaHasta} — ${motivo.trim()}`);
      await manager.update(Planilla, id, { estado: EstadoPlanilla.APROBADA, pagadaEn: null });
    });
    return this.buscarOFallar(id);
  }

  // Anula una planilla aprobada (y aún no pagada): reversa su asiento, devuelve
  // a las deudas de empleados lo que se les había descontado, y deja la planilla
  // en "anulada" para poder generar otra del mismo período. Nada se borra.
  async anular(id: string, motivo: string): Promise<Planilla> {
    const planilla = await this.buscarOFallar(id);
    if (planilla.estado === EstadoPlanilla.PAGADA) {
      throw new BadRequestException('La planilla ya está pagada: primero reverse el pago.');
    }
    if (planilla.estado !== EstadoPlanilla.APROBADA) {
      throw new BadRequestException('Solo se puede anular una planilla aprobada (un borrador se elimina).');
    }
    await this.dataSource.transaction(async (manager) => {
      const aprobaciones = await this.asientosDe(manager, id, 'aprobacion');
      await this.contabilidad.reversarAsientosEnTransaccion(manager, aprobaciones, motivo, `Anulación de planilla del ${planilla.fechaDesde} al ${planilla.fechaHasta} — ${motivo.trim()}`);

      for (const linea of planilla.lineas) {
        for (const d of (linea.detalle as { deudas?: Array<{ id: string; monto: number }> }).deudas ?? []) {
          const deuda = await manager.findOneBy(DeudaEmpleado, { id: d.id });
          if (!deuda) continue;
          await manager.update(DeudaEmpleado, deuda.id, { saldo: redondear(Number(deuda.saldo) + d.monto).toFixed(2), activa: true });
        }
      }
      await manager.update(Planilla, id, { estado: EstadoPlanilla.ANULADA, anuladaEn: new Date(), motivoAnulacion: motivo.trim() });
    });
    return this.buscarOFallar(id);
  }

  // Libro de salarios del período en Excel.
  async exportar(id: string): Promise<Buffer> {
    const planilla = await this.buscarOFallar(id);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet('Libro de salarios');
    hoja.addRow([`Planilla ${planilla.frecuencia} — del ${planilla.fechaDesde} al ${planilla.fechaHasta} — ${planilla.estado}`]);
    hoja.getRow(1).font = { bold: true, size: 13 };
    hoja.addRow([]);
    hoja.columns = [
      { key: 'nombre', width: 32 },
      { key: 'cedula', width: 16 },
      { key: 'base', width: 14 },
      { key: 'ausencias', width: 14 },
      { key: 'horasAus', width: 14 },
      { key: 'hExtra', width: 10 },
      { key: 'mExtra', width: 14 },
      { key: 'mEsp', width: 14 },
      { key: 'bruto', width: 14 },
      { key: 'sem', width: 12 },
      { key: 'ivm', width: 12 },
      { key: 'bp', width: 12 },
      { key: 'renta', width: 12 },
      { key: 'deudas', width: 12 },
      { key: 'neto', width: 14 },
      { key: 'patronal', width: 14 },
      { key: 'prov', width: 14 },
    ];
    const encabezado = hoja.addRow([
      'Empleado', 'Cédula', 'Salario base', 'Desc. ausencias', 'Desc. horas faltantes', 'Hrs extra', 'Monto extra', 'Feriado/domingo',
      'Bruto', 'SEM', 'IVM', 'Banco Popular', 'Renta', 'Deudas', 'Neto', 'Cargas patronales', 'Provisiones',
    ]);
    encabezado.font = { bold: true };
    for (const l of planilla.lineas) {
      hoja.addRow([
        l.empleadoNombre, l.empleadoCedula ?? '', Number(l.salarioBase), Number(l.descuentoAusencias), Number(l.descuentoHoras), Number(l.horasExtra),
        Number(l.montoExtra), Number(l.montoEspeciales), Number(l.bruto), Number(l.sem), Number(l.ivm), Number(l.bancoPopular),
        Number(l.renta), Number(l.deudasDescontadas), Number(l.neto), Number(l.cargasPatronales), Number(l.provisiones),
      ]);
    }
    const totales = hoja.addRow([
      'TOTAL', '', '', '', '', '', '', '',
      Number(planilla.totalBruto), '', '', '', '', '', Number(planilla.totalNeto), Number(planilla.totalCargasPatronales), Number(planilla.totalProvisiones),
    ]);
    totales.font = { bold: true };
    for (let c = 3; c <= 17; c++) if (c !== 6) hoja.getColumn(c).numFmt = '#,##0.00';
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
