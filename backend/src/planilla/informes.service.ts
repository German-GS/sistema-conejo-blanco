import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { PlanillaLinea } from './planilla-linea.entity.js';
import { DiaAsistencia } from './dia-asistencia.entity.js';
import { ResolucionDia } from './resolucion-dia.entity.js';
import { DeudaEmpleado } from './deuda-empleado.entity.js';
import { EstadoDia, EstadoPlanilla, TipoResolucionDia } from './planilla.enums.js';
import { redondear } from '../common/utils/dinero.util.js';

export type TipoInforme = 'asientos' | 'libro' | 'cargas' | 'renta' | 'provisiones' | 'asistencia' | 'irregularidades' | 'deudas';
export const TIPOS_INFORME: TipoInforme[] = ['asientos', 'libro', 'cargas', 'renta', 'provisiones', 'asistencia', 'irregularidades', 'deudas'];

type TipoColumna = 'texto' | 'moneda' | 'numero';
export interface Informe {
  tipo: TipoInforme;
  titulo: string;
  descripcion: string;
  columnas: Array<{ clave: string; etiqueta: string; tipo: TipoColumna }>;
  filas: Array<Record<string, string | number>>;
  totales: Record<string, number>;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Etiquetas legibles para los conceptos que guarda el cálculo.
const ETIQUETA_CARGA: Record<string, string> = {
  APORTE_PATRONAL_SEM: 'SEM (patronal)',
  APORTE_PATRONAL_IVM: 'IVM (patronal)',
  APORTE_PATRONAL_FODESAF: 'Asignaciones Familiares (FODESAF)',
  APORTE_PATRONAL_INA: 'INA',
  APORTE_PATRONAL_IMAS: 'IMAS',
  APORTE_PATRONAL_BANCO_POPULAR_CUOTA: 'Banco Popular (cuota patronal)',
  APORTE_PATRONAL_ROP: 'Pensión complementaria (ROP)',
  APORTE_PATRONAL_FCL: 'Fondo de Capitalización Laboral (FCL)',
  APORTE_PATRONAL_INS_RIESGOS: 'Riesgos del Trabajo (INS)',
  APORTE_PATRONAL_BANCO_POPULAR_LEY: 'Banco Popular (aporte patronal de ley)',
};

const sumar = (filas: Array<Record<string, string | number>>, clave: string) =>
  redondear(filas.reduce((a, f) => a + Number(f[clave] ?? 0), 0));

@Injectable()
export class InformesService {
  constructor(
    @InjectRepository(PlanillaLinea)
    private readonly lineaRepo: Repository<PlanillaLinea>,
    @InjectRepository(DiaAsistencia)
    private readonly diaRepo: Repository<DiaAsistencia>,
    @InjectRepository(DeudaEmpleado)
    private readonly deudaRepo: Repository<DeudaEmpleado>,
    @InjectRepository(ResolucionDia)
    private readonly resolRepo: Repository<ResolucionDia>,
    private readonly dataSource: DataSource,
  ) {}

  // Líneas de planillas aprobadas o pagadas cuyo período termina en el rango.
  private lineas(desde: string, hasta: string): Promise<PlanillaLinea[]> {
    return this.lineaRepo
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.planilla', 'p')
      .where('p.estado IN (:...vigentes)', { vigentes: ESTADOS_VIGENTES })
      .andWhere('p.fecha_hasta BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('p.fecha_hasta', 'ASC')
      .addOrderBy('l.empleadoNombre', 'ASC')
      .getMany();
  }

  async generar(tipo: string, desde: string, hasta: string): Promise<Informe> {
    if (!TIPOS_INFORME.includes(tipo as TipoInforme)) throw new BadRequestException('Ese informe no existe.');
    if (tipo !== 'deudas') {
      if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new BadRequestException('Indique las fechas desde y hasta (YYYY-MM-DD).');
      if (desde > hasta) throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
    }
    switch (tipo as TipoInforme) {
      case 'asientos':
        return this.asientos(desde, hasta);
      case 'libro':
        return this.libro(desde, hasta);
      case 'cargas':
        return this.cargas(desde, hasta);
      case 'renta':
        return this.renta(desde, hasta);
      case 'provisiones':
        return this.provisiones(desde, hasta);
      case 'asistencia':
        return this.asistencia(desde, hasta);
      case 'irregularidades':
        return this.irregularidades(desde, hasta);
      default:
        return this.deudas();
    }
  }

  private async libro(desde: string, hasta: string): Promise<Informe> {
    const lineas = await this.lineas(desde, hasta);
    const filas = lineas.map((l) => ({
      periodo: `${l.planilla.fechaDesde} al ${l.planilla.fechaHasta}`,
      empleado: l.empleadoNombre,
      cedula: l.empleadoCedula ?? '',
      base: Number(l.salarioBase),
      descAusencias: Number(l.descuentoAusencias),
      descHoras: Number(l.descuentoHoras),
      horasExtra: Number(l.horasExtra),
      montoExtra: Number(l.montoExtra),
      montoEspeciales: Number(l.montoEspeciales),
      bruto: Number(l.bruto),
      sem: Number(l.sem),
      ivm: Number(l.ivm),
      bancoPopular: Number(l.bancoPopular),
      renta: Number(l.renta),
      deudas: Number(l.deudasDescontadas),
      neto: Number(l.neto),
    }));
    const claves = ['base', 'descAusencias', 'descHoras', 'montoExtra', 'montoEspeciales', 'bruto', 'sem', 'ivm', 'bancoPopular', 'renta', 'deudas', 'neto'];
    return {
      tipo: 'libro',
      titulo: 'Libro de salarios',
      descripcion: 'Una fila por empleado y planilla (aprobadas y pagadas) con todo el detalle de lo devengado y rebajado.',
      columnas: [
        { clave: 'periodo', etiqueta: 'Período', tipo: 'texto' },
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
        { clave: 'base', etiqueta: 'Salario base', tipo: 'moneda' },
        { clave: 'descAusencias', etiqueta: 'Desc. ausencias', tipo: 'moneda' },
        { clave: 'descHoras', etiqueta: 'Desc. horas faltantes', tipo: 'moneda' },
        { clave: 'horasExtra', etiqueta: 'Hrs extra', tipo: 'numero' },
        { clave: 'montoExtra', etiqueta: 'Monto extra', tipo: 'moneda' },
        { clave: 'montoEspeciales', etiqueta: 'Feriado/domingo', tipo: 'moneda' },
        { clave: 'bruto', etiqueta: 'Bruto', tipo: 'moneda' },
        { clave: 'sem', etiqueta: 'SEM', tipo: 'moneda' },
        { clave: 'ivm', etiqueta: 'IVM', tipo: 'moneda' },
        { clave: 'bancoPopular', etiqueta: 'Banco Popular', tipo: 'moneda' },
        { clave: 'renta', etiqueta: 'Renta', tipo: 'moneda' },
        { clave: 'deudas', etiqueta: 'Deudas', tipo: 'moneda' },
        { clave: 'neto', etiqueta: 'Neto', tipo: 'moneda' },
      ],
      filas,
      totales: Object.fromEntries(claves.map((c) => [c, sumar(filas, c)])),
    };
  }

  // Lo que se debe a la CCSS y demás instituciones, por mes y concepto.
  private async cargas(desde: string, hasta: string): Promise<Informe> {
    const lineas = await this.lineas(desde, hasta);
    const acumulado = new Map<string, { mes: string; parte: string; concepto: string; monto: number }>();
    const sube = (mes: string, parte: string, concepto: string, monto: number) => {
      const clave = `${mes}|${parte}|${concepto}`;
      const actual = acumulado.get(clave) ?? { mes, parte, concepto, monto: 0 };
      actual.monto = redondear(actual.monto + monto);
      acumulado.set(clave, actual);
    };
    const bruto = new Map<string, number>();
    for (const l of lineas) {
      const mes = l.planilla.fechaHasta.slice(0, 7);
      bruto.set(mes, redondear((bruto.get(mes) ?? 0) + Number(l.bruto)));
      sube(mes, 'Obrero', 'SEM (obrero)', Number(l.sem));
      sube(mes, 'Obrero', 'IVM (obrero)', Number(l.ivm));
      sube(mes, 'Obrero', 'Banco Popular (obrero)', Number(l.bancoPopular));
      for (const [nombre, monto] of Object.entries(l.desgloseCargas ?? {})) {
        sube(mes, 'Patronal', ETIQUETA_CARGA[nombre] ?? nombre, Number(monto));
      }
    }
    const filas = [...acumulado.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes) || a.parte.localeCompare(b.parte) || a.concepto.localeCompare(b.concepto))
      .map((x) => ({ mes: x.mes, parte: x.parte, concepto: x.concepto, salarios: bruto.get(x.mes) ?? 0, monto: x.monto }));
    return {
      tipo: 'cargas',
      titulo: 'Cargas sociales',
      descripcion: 'Lo que se adeuda por mes: la parte retenida al trabajador y la parte patronal, por concepto.',
      columnas: [
        { clave: 'mes', etiqueta: 'Mes', tipo: 'texto' },
        { clave: 'parte', etiqueta: 'Parte', tipo: 'texto' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'salarios', etiqueta: 'Salarios del mes', tipo: 'moneda' },
        { clave: 'monto', etiqueta: 'Monto', tipo: 'moneda' },
      ],
      filas,
      totales: {
        monto: sumar(filas, 'monto'),
        obrero: redondear(filas.filter((f) => f.parte === 'Obrero').reduce((a, f) => a + Number(f.monto), 0)),
        patronal: redondear(filas.filter((f) => f.parte === 'Patronal').reduce((a, f) => a + Number(f.monto), 0)),
      },
    };
  }

  private async renta(desde: string, hasta: string): Promise<Informe> {
    const lineas = await this.lineas(desde, hasta);
    const m = new Map<string, { mes: string; empleado: string; cedula: string; bruto: number; renta: number }>();
    for (const l of lineas) {
      const mes = l.planilla.fechaHasta.slice(0, 7);
      const clave = `${mes}|${l.empleadoId}`;
      const x = m.get(clave) ?? { mes, empleado: l.empleadoNombre, cedula: l.empleadoCedula ?? '', bruto: 0, renta: 0 };
      x.bruto = redondear(x.bruto + Number(l.bruto));
      x.renta = redondear(x.renta + Number(l.renta));
      m.set(clave, x);
    }
    const filas = [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes) || a.empleado.localeCompare(b.empleado));
    return {
      tipo: 'renta',
      titulo: 'Retenciones de renta',
      descripcion: 'Impuesto sobre el salario retenido a cada empleado por mes (para la declaración al Ministerio de Hacienda).',
      columnas: [
        { clave: 'mes', etiqueta: 'Mes', tipo: 'texto' },
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
        { clave: 'bruto', etiqueta: 'Salario bruto del mes', tipo: 'moneda' },
        { clave: 'renta', etiqueta: 'Renta retenida', tipo: 'moneda' },
      ],
      filas,
      totales: { bruto: sumar(filas, 'bruto'), renta: sumar(filas, 'renta') },
    };
  }

  private async provisiones(desde: string, hasta: string): Promise<Informe> {
    const lineas = await this.lineas(desde, hasta);
    const m = new Map<string, { empleado: string; bruto: number; aguinaldo: number; vacaciones: number; cesantia: number; total: number }>();
    for (const l of lineas) {
      const x = m.get(l.empleadoId) ?? { empleado: l.empleadoNombre, bruto: 0, aguinaldo: 0, vacaciones: 0, cesantia: 0, total: 0 };
      const d = (l.desgloseProvisiones ?? {}) as Record<string, number>;
      x.bruto = redondear(x.bruto + Number(l.bruto));
      x.aguinaldo = redondear(x.aguinaldo + Number(d.PROVISION_AGUINALDO ?? 0));
      x.vacaciones = redondear(x.vacaciones + Number(d.PROVISION_VACACIONES ?? 0));
      x.cesantia = redondear(x.cesantia + Number(d.PROVISION_CESANTIA ?? 0));
      x.total = redondear(x.total + Number(l.provisiones));
      m.set(l.empleadoId, x);
    }
    const filas = [...m.values()].sort((a, b) => a.empleado.localeCompare(b.empleado));
    return {
      tipo: 'provisiones',
      titulo: 'Provisiones laborales',
      descripcion: 'Lo reservado por empleado para aguinaldo, vacaciones y cesantía en el rango (lo que la empresa debe tener apartado).',
      columnas: [
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'bruto', etiqueta: 'Salarios del rango', tipo: 'moneda' },
        { clave: 'aguinaldo', etiqueta: 'Aguinaldo', tipo: 'moneda' },
        { clave: 'vacaciones', etiqueta: 'Vacaciones', tipo: 'moneda' },
        { clave: 'cesantia', etiqueta: 'Cesantía', tipo: 'moneda' },
        { clave: 'total', etiqueta: 'Total provisionado', tipo: 'moneda' },
      ],
      filas,
      totales: Object.fromEntries(['bruto', 'aguinaldo', 'vacaciones', 'cesantia', 'total'].map((c) => [c, sumar(filas, c)])),
    };
  }

  // Asistencia sale de los días importados, no de las planillas: sirve para
  // ver el comportamiento aunque todavía no se haya calculado la planilla.
  private async asistencia(desde: string, hasta: string): Promise<Informe> {
    const dias = await this.diaRepo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.empleado', 'e')
      .where('d.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('e.nombre', 'ASC')
      .getMany();
    const m = new Map<string, Record<string, string | number>>();
    for (const d of dias) {
      const x =
        m.get(d.empleadoId) ??
        {
          empleado: d.empleado.nombre,
          trabajados: 0,
          ausInjustificadas: 0,
          ausJustificadas: 0,
          horasExtra: 0,
          horasFaltantesDescontadas: 0,
          horasFaltantesJustificadas: 0,
          pendientes: 0,
        };
      const sube = (clave: string, valor: number) => (x[clave] = redondear(Number(x[clave]) + valor));
      if (d.estado === EstadoDia.OK && d.minutosNetos > 0) sube('trabajados', 1);
      if (d.estado === EstadoDia.AUSENCIA) {
        if (d.descuenta) sube('ausInjustificadas', 1);
        else if (d.resolucionTipo === TipoResolucionDia.AUSENCIA_JUSTIFICADA) sube('ausJustificadas', 1);
      }
      if (d.estado === EstadoDia.MARCA_FALTANTE || d.estado === EstadoDia.MARCAS_AMBIGUAS) sube('pendientes', 1);
      sube('horasExtra', d.minutosExtra / 60);
      if (d.estado === EstadoDia.OK && d.minutosFaltantes > 0) {
        if (d.minutosDescontar > 0) sube('horasFaltantesDescontadas', d.minutosFaltantes / 60);
        else if (d.resolucionTipo === TipoResolucionDia.HORAS_JUSTIFICADAS) sube('horasFaltantesJustificadas', d.minutosFaltantes / 60);
      }
      m.set(d.empleadoId, x);
    }
    const filas = [...m.values()];
    const claves = ['trabajados', 'ausInjustificadas', 'ausJustificadas', 'horasExtra', 'horasFaltantesDescontadas', 'horasFaltantesJustificadas', 'pendientes'];
    return {
      tipo: 'asistencia',
      titulo: 'Asistencia',
      descripcion: 'Por empleado: días trabajados, ausencias (injustificadas y justificadas), horas extra y horas faltantes, según las marcas importadas.',
      columnas: [
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'trabajados', etiqueta: 'Días trabajados', tipo: 'numero' },
        { clave: 'ausInjustificadas', etiqueta: 'Ausencias injustificadas', tipo: 'numero' },
        { clave: 'ausJustificadas', etiqueta: 'Ausencias justificadas', tipo: 'numero' },
        { clave: 'horasExtra', etiqueta: 'Horas extra', tipo: 'numero' },
        { clave: 'horasFaltantesDescontadas', etiqueta: 'Hrs faltantes descontadas', tipo: 'numero' },
        { clave: 'horasFaltantesJustificadas', etiqueta: 'Hrs faltantes justificadas', tipo: 'numero' },
        { clave: 'pendientes', etiqueta: 'Días por resolver', tipo: 'numero' },
      ],
      filas,
      totales: Object.fromEntries(claves.map((c) => [c, sumar(filas, c)])),
    };
  }

  // Todo lo que se salió de lo normal en el período: ausencias (justificadas
  // o no), horas descontadas o perdonadas, marcas resueltas a mano.
  private async irregularidades(desde: string, hasta: string): Promise<Informe> {
    const dias = await this.diaRepo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.empleado', 'e')
      .where('d.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('d.fecha', 'ASC')
      .addOrderBy('e.nombre', 'ASC')
      .getMany();
    const ids = dias.filter((d) => d.resolucionTipo).map((d) => d.id);
    const ultima = new Map<string, ResolucionDia>();
    if (ids.length > 0) {
      const resoluciones = await this.resolRepo.find({ where: { diaId: In(ids) }, relations: { usuario: true }, order: { creadoEn: 'DESC' } });
      for (const r of resoluciones) if (!ultima.has(r.diaId)) ultima.set(r.diaId, r);
    }
    const hhmm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;

    const filas: Array<Record<string, string | number>> = [];
    for (const d of dias) {
      let situacion = '';
      let descuento = '—';
      const tipo = d.resolucionTipo;
      if (d.estado === EstadoDia.AUSENCIA && d.descuenta) {
        situacion = tipo ? 'Ausencia injustificada' : 'Ausencia sin resolver (se descuenta)';
        descuento = 'Día completo';
      } else if (d.estado === EstadoDia.AUSENCIA && tipo === TipoResolucionDia.AUSENCIA_JUSTIFICADA) {
        situacion = 'Ausencia justificada';
        descuento = 'No se descuenta';
      } else if (d.estado === EstadoDia.MARCA_FALTANTE || d.estado === EstadoDia.MARCAS_AMBIGUAS) {
        situacion = 'Marcas por resolver';
      } else if (d.minutosDescontar > 0) {
        situacion = 'Horas faltantes descontadas';
        descuento = hhmm(d.minutosDescontar);
      } else if (tipo === TipoResolucionDia.HORAS_JUSTIFICADAS) {
        situacion = 'Horas faltantes justificadas';
        descuento = `No se descuenta (${hhmm(d.minutosFaltantes)})`;
      } else if (tipo === TipoResolucionDia.HORA_MANUAL || tipo === TipoResolucionDia.HORARIO_ESTANDAR) {
        situacion = tipo === TipoResolucionDia.HORA_MANUAL ? 'Marcas corregidas con hora manual' : 'Pagado con el horario estándar';
      } else if (tipo === TipoResolucionDia.ALMUERZO_MANUAL) {
        situacion = `Almuerzo ajustado a ${d.minutosAlmuerzo} min`;
      } else {
        continue;
      }
      const r = ultima.get(d.id);
      filas.push({
        fecha: d.fecha,
        empleado: d.empleado.nombre,
        situacion,
        marcas: d.marcas.length ? d.marcas.join(' · ') : 'ninguna',
        descuento,
        motivo: d.resolucionMotivo ?? '',
        comprobante: d.justificante ? 'Sí' : '',
        decidio: r ? `${r.usuario?.nombre ?? ''} ${r.creadoEn.toISOString().slice(0, 10)}`.trim() : '',
      });
    }
    return {
      tipo: 'irregularidades',
      titulo: 'Irregularidades de asistencia',
      descripcion: 'Ausencias (justificadas o no), horas faltantes, marcas corregidas y almuerzos ajustados en el período, con el motivo y quién lo decidió.',
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'texto' },
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'situacion', etiqueta: 'Situación', tipo: 'texto' },
        { clave: 'marcas', etiqueta: 'Marcas', tipo: 'texto' },
        { clave: 'descuento', etiqueta: 'Descuento', tipo: 'texto' },
        { clave: 'motivo', etiqueta: 'Motivo', tipo: 'texto' },
        { clave: 'comprobante', etiqueta: 'Comprobante', tipo: 'texto' },
        { clave: 'decidio', etiqueta: 'Decidió', tipo: 'texto' },
      ],
      filas,
      totales: {},
    };
  }

  // Asientos contables que generó la planilla (aprobación, pago, préstamos a
  // empleados) y sus reversas, línea por línea, con el número de asiento del
  // libro diario para poder cruzarlos.
  private async asientos(desde: string, hasta: string): Promise<Informe> {
    const ORIGENES = ['planilla', 'planilla_pago', 'deuda_empleado', 'deuda_empleado_baja', 'cierre_mensual'];
    const ETIQUETA: Record<string, string> = {
      planilla: 'Aprobación de planilla',
      planilla_pago: 'Pago de planilla',
      deuda_empleado: 'Préstamo a empleado',
      deuda_empleado_baja: 'Baja de préstamo',
      cierre_mensual: 'Cierre mensual (pago de obligaciones)',
      reversa: 'Reversa',
    };
    const filasBD: Array<{
      fecha: string | Date;
      numero: number | null;
      origen_tipo: string;
      descripcion: string;
      codigo: string;
      cuenta: string;
      debe: string;
      haber: string;
    }> = await this.dataSource.query(
      `SELECT a.fecha, a.numero, a.origen_tipo, a.descripcion, c.codigo, c.nombre AS cuenta, l.debe, l.haber
       FROM asientos_contables a
       JOIN lineas_asiento l ON l.asiento_id = a.id
       JOIN cuentas_contables c ON c.id = l.cuenta_id
       WHERE a.fecha BETWEEN $1 AND $2
         AND ((a.origen_tipo = ANY($3) AND a.descripcion NOT LIKE 'Liquidación de IVA%')
              OR (a.origen_tipo = 'reversa' AND a.origen_id IN (
                    SELECT id FROM asientos_contables WHERE origen_tipo = ANY($3) AND descripcion NOT LIKE 'Liquidación de IVA%')))
       ORDER BY a.fecha, a.numero, (l.debe::numeric = 0), c.codigo`,
      [desde, hasta, ORIGENES],
    );
    const filas = filasBD.map((f) => ({
      fecha: f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : String(f.fecha).slice(0, 10),
      asiento: f.numero ?? '',
      concepto: ETIQUETA[f.origen_tipo] ?? f.origen_tipo,
      descripcion: f.descripcion,
      codigo: f.codigo,
      cuenta: f.cuenta,
      debe: Number(f.debe),
      haber: Number(f.haber),
    }));
    return {
      tipo: 'asientos',
      titulo: 'Asientos contables de planilla',
      descripcion: 'Cada asiento que generó la planilla en la contabilidad (aprobación, pago, préstamos a empleados y sus reversas), por fecha del asiento.',
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'texto' },
        { clave: 'asiento', etiqueta: 'Asiento Nº', tipo: 'texto' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
        { clave: 'codigo', etiqueta: 'Código', tipo: 'texto' },
        { clave: 'cuenta', etiqueta: 'Cuenta', tipo: 'texto' },
        { clave: 'debe', etiqueta: 'Débito', tipo: 'moneda' },
        { clave: 'haber', etiqueta: 'Crédito', tipo: 'moneda' },
      ],
      filas,
      totales: { debe: sumar(filas, 'debe'), haber: sumar(filas, 'haber') },
    };
  }

  private async deudas(): Promise<Informe> {
    const deudas = await this.deudaRepo.find({ where: { activa: true }, relations: { empleado: true }, order: { creadoEn: 'ASC' } });
    const filas = deudas
      .map((d) => ({
        empleado: d.empleado.nombre,
        descripcion: d.descripcion,
        original: Number(d.montoOriginal),
        cuota: Number(d.cuotaPorPlanilla),
        saldo: Number(d.saldo),
        autorizacion: d.autorizacionNota,
      }))
      .sort((a, b) => a.empleado.localeCompare(b.empleado));
    return {
      tipo: 'deudas',
      titulo: 'Deudas de empleados',
      descripcion: 'Saldos vigentes que los empleados tienen con la empresa (no depende de fechas).',
      columnas: [
        { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto' },
        { clave: 'descripcion', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'original', etiqueta: 'Monto original', tipo: 'moneda' },
        { clave: 'cuota', etiqueta: 'Cuota por planilla', tipo: 'moneda' },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'moneda' },
        { clave: 'autorizacion', etiqueta: 'Autorización', tipo: 'texto' },
      ],
      filas,
      totales: { original: sumar(filas, 'original'), saldo: sumar(filas, 'saldo') },
    };
  }

  async exportar(tipo: string, desde: string, hasta: string): Promise<Buffer> {
    const informe = await this.generar(tipo, desde, hasta);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet(informe.titulo.slice(0, 30));
    hoja.addRow([tipo === 'deudas' ? informe.titulo : `${informe.titulo} — del ${desde} al ${hasta}`]).font = { bold: true, size: 13 };
    hoja.addRow([]);
    hoja.addRow(informe.columnas.map((c) => c.etiqueta)).font = { bold: true };
    for (const f of informe.filas) hoja.addRow(informe.columnas.map((c) => f[c.clave] ?? ''));
    if (Object.keys(informe.totales).length > 0) {
      const fila = hoja.addRow(informe.columnas.map((c, i) => (i === 0 ? 'TOTAL' : (informe.totales[c.clave] ?? ''))));
      fila.font = { bold: true };
    }
    informe.columnas.forEach((c, i) => {
      const col = hoja.getColumn(i + 1);
      col.width = c.clave === 'descripcion' ? 60 : c.tipo === 'texto' ? 30 : 16;
      if (c.tipo === 'moneda') col.numFmt = '#,##0.00';
      if (c.tipo === 'numero') col.numFmt = '0.##';
    });
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
