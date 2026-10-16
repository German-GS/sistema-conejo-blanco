import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { redondear } from '../common/utils/dinero.util.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import { CuentasBancariasService } from '../pagos/cuentas-bancarias.service.js';
import { AsientoContable } from '../contabilidad/asiento-contable.entity.js';
import { Empleado } from './empleado.entity.js';
import { DeudaEmpleado } from './deuda-empleado.entity.js';
import { FrecuenciaPago, TipoSalario } from './planilla.enums.js';
import { normalizarNumeroReloj } from './calculo.js';
import { AsistenciaService } from './asistencia.service.js';
import { validarHorarioSemanal } from './horario.js';
import { PuestosService } from './puestos.service.js';
import { ParametrosService } from './parametros.service.js';
import { PlanillaLinea } from './planilla-linea.entity.js';
import { EstadoPlanilla } from './planilla.enums.js';
import { estimarLiquidacion, ETIQUETAS_CESE, type TipoCese } from './liquidacion.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import type { ActualizarEmpleadoDto, CesarEmpleadoDto, CrearDeudaDto, CrearEmpleadoDto } from './dto/empleado.dto.js';

const ORIGEN_DEUDA = 'deuda_empleado';
const ORIGEN_DEUDA_BAJA = 'deuda_empleado_baja';

@Injectable()
export class EmpleadosService {
  constructor(
    @InjectRepository(Empleado)
    private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(DeudaEmpleado)
    private readonly deudaRepo: Repository<DeudaEmpleado>,
    private readonly asistencia: AsistenciaService,
    private readonly parametros: ParametrosService,
    private readonly puestos: PuestosService,
    private readonly contabilidad: ContabilidadService,
    private readonly cuentasBancarias: CuentasBancariasService,
    private readonly dataSource: DataSource,
  ) {}

  listar(): Promise<Empleado[]> {
    return this.empleadoRepo.find({ order: { activo: 'DESC', nombre: 'ASC' } });
  }

  async buscarOFallar(id: string): Promise<Empleado> {
    const empleado = await this.empleadoRepo.findOneBy({ id });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    return empleado;
  }

  // Un salario semanal solo tiene sentido pagado por semana: el monto ya
  // es el de la semana.
  private validarSalario(tipo: TipoSalario, frecuencia: FrecuenciaPago) {
    if (tipo === TipoSalario.SEMANAL && frecuencia !== FrecuenciaPago.SEMANAL) {
      throw new BadRequestException('Un salario semanal solo se puede pagar por semana.');
    }
  }

  private async validarNumeroLibre(numeroReloj: string, exceptoId?: string) {
    const otro = await this.empleadoRepo.findOneBy({ numeroReloj });
    if (otro && otro.id !== exceptoId) {
      throw new ConflictException(`El número de reloj ${numeroReloj} ya lo tiene ${otro.nombre}.`);
    }
  }

  async crear(dto: CrearEmpleadoDto): Promise<Empleado> {
    this.validarSalario(dto.tipoSalario, dto.frecuenciaPago);
    const horarioSemanal = this.validarHorario(dto.horarioSemanal);
    const numeroReloj = normalizarNumeroReloj(dto.numeroReloj);
    await this.validarNumeroLibre(numeroReloj);
    // Al elegir un puesto, su nombre y su indicador de confianza pasan al empleado.
    const puestoElegido = dto.puestoId ? await this.puestos.buscarOFallar(dto.puestoId) : null;
    return this.empleadoRepo.save(
      this.empleadoRepo.create({
        ...dto,
        numeroReloj,
        nombre: dto.nombre.trim(),
        montoSalario: dto.montoSalario.toFixed(2),
        cedula: dto.cedula?.trim() || null,
        puesto: puestoElegido?.nombre ?? (dto.puesto?.trim() || null),
        esConfianza: dto.esConfianza ?? puestoElegido?.esConfianza ?? false,
        // El personal de tienda es de comercio, salvo que se indique otra cosa.
        sector: dto.sector ?? (dto.esDeTienda ? 'comercio' : (puestoElegido?.sector ?? 'industria')),
        fechaIngreso: dto.fechaIngreso ?? null,
        iban: dto.iban?.replace(/\s+/g, '') || null,
        horasSemana: dto.horasSemana != null ? dto.horasSemana.toFixed(2) : null,
        horarioSemanal,
        almuerzoMinutos: dto.almuerzoMinutos ?? null,
      }),
    );
  }

  async actualizar(id: string, dto: ActualizarEmpleadoDto): Promise<Empleado> {
    const empleado = await this.buscarOFallar(id);
    const tipo = dto.tipoSalario ?? empleado.tipoSalario;
    const frecuencia = dto.frecuenciaPago ?? empleado.frecuenciaPago;
    this.validarSalario(tipo, frecuencia);
    const horarioNuevo = dto.horarioSemanal === undefined ? undefined : this.validarHorario(dto.horarioSemanal);
    if (dto.puestoId && dto.puestoId !== empleado.puestoId) {
      const puesto = await this.puestos.buscarOFallar(dto.puestoId);
      empleado.puesto = puesto.nombre;
      if (dto.esConfianza === undefined) empleado.esConfianza = puesto.esConfianza;
      if (dto.sector === undefined) empleado.sector = puesto.sector;
    }
    if (dto.numeroReloj !== undefined) {
      const numero = normalizarNumeroReloj(dto.numeroReloj);
      await this.validarNumeroLibre(numero, id);
      empleado.numeroReloj = numero;
    }
    const eraDeTienda = empleado.esDeTienda;
    const { numeroReloj: _numero, montoSalario, cedula, puesto, iban, horasSemana, ...resto } = dto;
    const puestoManual = puesto;
    // Los campos que el DTO no trae vienen como undefined: no deben pisar lo ya calculado.
    Object.assign(empleado, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)));
    if (montoSalario !== undefined) empleado.montoSalario = montoSalario.toFixed(2);
    if (cedula !== undefined) empleado.cedula = cedula.trim() || null;
    if (dto.esDeTienda === true && !eraDeTienda && dto.sector === undefined && !dto.puestoId) empleado.sector = 'comercio';
    if (puestoManual !== undefined && !dto.puestoId) empleado.puesto = puestoManual.trim() || null;
    if (iban !== undefined) empleado.iban = iban.replace(/\s+/g, '') || null;
    if (horasSemana !== undefined) empleado.horasSemana = horasSemana != null ? horasSemana.toFixed(2) : null;
    if (dto.almuerzoMinutos === null) empleado.almuerzoMinutos = null;
    if (horarioNuevo !== undefined) empleado.horarioSemanal = horarioNuevo;
    const guardado = await this.empleadoRepo.save(empleado);
    // Si cambió algo que afecta cómo se leen las marcas (horas por semana,
    // almuerzo, horario), los días ya importados que nadie ha resuelto a mano
    // se vuelven a interpretar con la configuración nueva.
    const afectaMarcas = ['horasSemana', 'horarioSemanal', 'sector', 'esConfianza', 'puestoId', 'almuerzoMarca', 'almuerzoMinutos', 'horarioEntrada', 'horarioSalida', 'horarioSalidaSabado'].some(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    if (afectaMarcas) await this.asistencia.recalcularPendientes(id);
    return guardado;
  }

  listarDeudas(empleadoId: string): Promise<DeudaEmpleado[]> {
    return this.deudaRepo.find({ where: { empleadoId }, order: { creadoEn: 'DESC' } });
  }

  // Prestar dinero a un empleado: sale de caja/banco y queda como cuenta por
  // cobrar a empleados (1250), que luego se va rebajando con cada planilla.
  async crearDeuda(empleadoId: string, dto: CrearDeudaDto): Promise<DeudaEmpleado> {
    const empleado = await this.buscarOFallar(empleadoId);
    if (dto.cuotaPorPlanilla > dto.monto) {
      throw new BadRequestException('La cuota no puede ser mayor que el monto de la deuda.');
    }
    const hoy = hoyISO();
    const fecha = dto.fecha ?? hoy;
    if (fecha > hoy) throw new BadRequestException('La fecha no puede ser futura.');
    const cuenta = dto.cuentaBancariaId ? await this.cuentasBancarias.buscarActivaOFallar(dto.cuentaBancariaId) : null;

    return this.dataSource.transaction(async (manager) => {
      const deuda = await manager.save(
        DeudaEmpleado,
        manager.create(DeudaEmpleado, {
          empleadoId,
          descripcion: dto.descripcion.trim(),
          montoOriginal: dto.monto.toFixed(2),
          saldo: dto.monto.toFixed(2),
          cuotaPorPlanilla: dto.cuotaPorPlanilla.toFixed(2),
          autorizacionNota: dto.autorizacionNota.trim(),
        }),
      );
      await this.contabilidad.registrarAsientoEnTransaccion(manager, {
        fecha,
        descripcion: `Préstamo a empleado — ${empleado.nombre}: ${deuda.descripcion}`.slice(0, 255),
        origenTipo: ORIGEN_DEUDA,
        origenId: deuda.id,
        lineas: [
          { codigoCuenta: CUENTA.CUENTAS_POR_COBRAR_EMPLEADOS, debe: dto.monto },
          { codigoCuenta: cuenta?.cuentaContable.codigo ?? CUENTA.CAJA, haber: dto.monto },
        ],
      });
      return deuda;
    });
  }

  // Cerrar una deuda antes de cobrarla completa. Si todavía no se le descontó
  // nada, se trata como un error de registro y se reversa el préstamo; si ya
  // se le descontó algo, lo que queda sin cobrar se da de baja como gasto
  // (condonación) para que 1250 siga cuadrando con las deudas.
  async desactivarDeuda(id: string): Promise<DeudaEmpleado> {
    const deuda = await this.deudaRepo.findOne({ where: { id }, relations: { empleado: true } });
    if (!deuda) throw new NotFoundException('La deuda no existe.');
    const saldo = Number(deuda.saldo);
    if (!deuda.activa && saldo === 0) return deuda;

    await this.dataSource.transaction(async (manager) => {
      if (saldo > 0) {
        if (redondear(saldo) === redondear(Number(deuda.montoOriginal))) {
          await this.contabilidad.reversarPorOrigenEnTransaccion(manager, ORIGEN_DEUDA, deuda.id, 'deuda dada de baja sin descuentos', `Reversa del préstamo a ${deuda.empleado.nombre}: ${deuda.descripcion}`.slice(0, 255));
        } else {
          await this.contabilidad.registrarAsientoEnTransaccion(manager, {
            fecha: hoyISO(),
            descripcion: `Baja de saldo de préstamo — ${deuda.empleado.nombre}: ${deuda.descripcion}`.slice(0, 255),
            origenTipo: ORIGEN_DEUDA_BAJA,
            origenId: deuda.id,
            lineas: [
              { codigoCuenta: CUENTA.GASTOS_DIVERSOS, debe: saldo },
              { codigoCuenta: CUENTA.CUENTAS_POR_COBRAR_EMPLEADOS, haber: saldo },
            ],
          });
        }
      }
      await manager.update(DeudaEmpleado, id, { activa: false, saldo: '0.00' });
    });
    return this.deudaRepo.findOneByOrFail({ id });
  }

  // ---- Cese ----

  async cesar(id: string, dto: CesarEmpleadoDto): Promise<Empleado> {
    const empleado = await this.buscarOFallar(id);
    if (empleado.fechaCese) throw new BadRequestException('Este empleado ya está cesado.');
    if (empleado.fechaIngreso && dto.fechaCese < empleado.fechaIngreso) {
      throw new BadRequestException('La fecha de cese no puede ser anterior a su fecha de ingreso.');
    }
    if (dto.fechaCese > this.sumarAnio(hoyISO())) throw new BadRequestException('La fecha de cese es demasiado lejana.');
    empleado.activo = false;
    empleado.fechaCese = dto.fechaCese;
    empleado.tipoCese = dto.tipoCese;
    empleado.motivoCese = dto.motivo.trim();
    const guardado = await this.empleadoRepo.save(empleado);
    // Quien deja de trabajar en la empresa pierde también su acceso al sistema (y se le cierran las sesiones).
    await this.dataSource.query('UPDATE usuarios SET activo = false, version_token = version_token + 1 WHERE empleado_id = $1 AND rol <> $2', [id, 'sistema']);
    return guardado;
  }

  // null = usar el horario de la fábrica.
  private validarHorario(valor: unknown) {
    if (valor === undefined || valor === null) return null;
    try {
      return validarHorarioSemanal(valor);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'El horario no es válido.');
    }
  }

  private sumarAnio(fecha: string): string {
    const [a, m, d] = fecha.split('-');
    return `${Number(a) + 1}-${m}-${d}`;
  }

  async reactivar(id: string): Promise<Empleado> {
    const empleado = await this.buscarOFallar(id);
    empleado.activo = true;
    empleado.fechaCese = null;
    empleado.tipoCese = null;
    empleado.motivoCese = null;
    return this.empleadoRepo.save(empleado);
  }

  // Estimación de la liquidación (ver liquidacion.ts) más lo que el sistema
  // ya fue provisionando para este empleado en planillas aprobadas.
  async liquidacion(id: string, vacacionesTomadasDias = 0) {
    const empleado = await this.buscarOFallar(id);
    if (!empleado.fechaCese || !empleado.tipoCese) throw new BadRequestException('Primero hay que registrar el cese del empleado.');
    const p = await this.parametros.mapa();
    const estimacion = estimarLiquidacion({
      tipoSalario: empleado.tipoSalario,
      montoSalario: Number(empleado.montoSalario),
      horasSemana: empleado.horasSemana != null ? Number(empleado.horasSemana) : p.HORAS_SEMANA_PAGADAS,
      fechaIngreso: empleado.fechaIngreso,
      fechaCese: empleado.fechaCese,
      tipoCese: empleado.tipoCese as TipoCese,
      vacacionesTomadasDias,
    });

    const lineas = await this.dataSource
      .getRepository(PlanillaLinea)
      .createQueryBuilder('l')
      .innerJoin('l.planilla', 'pl')
      .where('l.empleado_id = :id', { id })
      .andWhere('pl.estado IN (:...vigentes)', { vigentes: ESTADOS_VIGENTES })
      .getMany();
    const suma = (clave: string) => lineas.reduce((a, l) => a + Number((l.desgloseProvisiones as Record<string, number>)?.[clave] ?? 0), 0);

    return {
      empleado: { id: empleado.id, nombre: empleado.nombre, cedula: empleado.cedula, fechaIngreso: empleado.fechaIngreso },
      fechaCese: empleado.fechaCese,
      tipoCese: empleado.tipoCese,
      etiquetaCese: ETIQUETAS_CESE[empleado.tipoCese as TipoCese] ?? empleado.tipoCese,
      motivo: empleado.motivoCese,
      vacacionesTomadasDias,
      ...estimacion,
      provisionadoEnElSistema: {
        aguinaldo: redondear(suma('PROVISION_AGUINALDO')),
        vacaciones: redondear(suma('PROVISION_VACACIONES')),
        cesantia: redondear(suma('PROVISION_CESANTIA')),
        planillas: lineas.length,
      },
    };
  }
}
