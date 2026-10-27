import { ESTADOS_VIGENTES } from './planilla.enums.js';
import { redondear } from '../common/utils/dinero.util.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
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
import { Rol } from '../common/enums/rol.enum.js';
import { ausentesDelArchivo, leerEmpleadosExcel, planificarImportacion, type ResultadoFila } from './importar-empleados.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import type { ActualizarEmpleadoDto, CesarEmpleadoDto, CrearDeudaDto, CrearEmpleadoDto } from './dto/empleado.dto.js';

export interface DecisionAusente {
  accion: 'conservar' | 'eliminar' | 'eliminar_todo' | 'cesar';
  fechaCese?: string;
  tipoCese?: 'renuncia' | 'despido_con_responsabilidad' | 'despido_sin_responsabilidad' | 'mutuo_acuerdo' | 'fin_contrato';
  motivo?: string;
}

const ORIGEN_DEUDA = 'deuda_empleado';
const ORIGEN_DEUDA_BAJA = 'deuda_empleado_baja';

@Injectable()
export class EmpleadosService implements OnModuleInit {
  private readonly logger = new Logger(EmpleadosService.name);

  // En comercio la semana se paga sobre 56 horas (7 días de 8 h, con el día libre pagado) y eso ya lo hace el sector «comercio»:
  // un «contrato especial de 56 horas» explícito solo estorbaba (movía el día ordinario a 9 h 20 min). Se limpia.
  async onModuleInit() {
    try {
      const limpiados: Array<{ id: string }> = await this.dataSource.query("UPDATE planilla_empleados SET horas_semana = NULL WHERE sector = 'comercio' AND horas_semana = 56 RETURNING id");
      if (limpiados.length) this.logger.log(`Se quitó el «contrato especial de 56 horas» a ${limpiados.length} empleado(s) de comercio.`);
    } catch (err) {
      this.logger.warn(`No se pudo limpiar el contrato especial de comercio: ${err instanceof Error ? err.message : err}`);
    }
  }

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
    private readonly bitacora: BitacoraService,
  ) {}

  // Qué tiene registrado un empleado en el sistema (planillas, días de asistencia, deudas, cuenta de usuario…). Con algo
  // registrado no se puede borrar sin perder historial laboral y contable: se le da de baja (cese) en su lugar.
  async historialDe(id: string): Promise<{ total: number; detalle: Array<{ tabla: string; cantidad: number }> }> {
    const refs: Array<{ tabla: string; columna: string }> = await this.dataSource.query(
      `SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'planilla_empleados'::regclass`,
    );
    const detalle: Array<{ tabla: string; cantidad: number }> = [];
    for (const r of refs) {
      const ident = (t: string) => `"${t.replace(/"/g, '""')}"`;
      const tabla = r.tabla.replace(/^"|"$/g, '');
      const [fila] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM ${ident(tabla)} WHERE ${ident(r.columna)} = $1`, [id]);
      if (fila.n > 0) detalle.push({ tabla, cantidad: fila.n });
    }
    return { total: detalle.reduce((a, d) => a + d.cantidad, 0), detalle };
  }

  // Planillas ya aprobadas o pagadas en las que sale el empleado: con asientos contables hechos, sus líneas no se pueden quitar
  // sin descuadrar los libros. Hay que anular primero esas planillas.
  async bloqueosParaEliminar(id: string): Promise<string[]> {
    const filas: Array<{ fecha_desde: string; fecha_hasta: string; estado: string }> = await this.dataSource.query(
      `SELECT to_char(p.fecha_desde, 'DD/MM/YYYY') AS fecha_desde, to_char(p.fecha_hasta, 'DD/MM/YYYY') AS fecha_hasta, p.estado FROM planilla_lineas l JOIN planilla_planillas p ON p.id = l.planilla_id
        WHERE l.empleado_id = $1 AND p.estado IN ('aprobada', 'pagada') ORDER BY p.fecha_desde`,
      [id],
    );
    return filas.map((f) => `planilla del ${f.fecha_desde} al ${f.fecha_hasta} (${f.estado})`);
  }

  // Borra al empleado CON todo su historial (asistencia, líneas de planillas en borrador o anuladas, deudas). Solo el administrador
  // del sistema. Pensado para datos de prueba cargados antes de que el sistema se usara de verdad. No toca planillas aprobadas o pagadas.
  async eliminarConHistorial(id: string, usuario: UsuarioAutenticado): Promise<{ nombre: string }> {
    if (usuario.rol !== 'sistema') throw new ForbiddenException('Solo el administrador del sistema puede eliminar a un empleado con su historial.');
    const empleado = await this.buscarOFallar(id);
    const bloqueos = await this.bloqueosParaEliminar(id);
    if (bloqueos.length) {
      throw new BadRequestException(`No se puede eliminar a ${empleado.nombre}: sale en planillas ya aprobadas o pagadas (${bloqueos.join('; ')}). Anule esas planillas primero (Planillas → Anular).`);
    }
    // Los préstamos con saldo se cierran bien (revierte o da de baja el asiento) antes de borrar la deuda.
    for (const d of await this.deudaRepo.find({ where: { empleadoId: id } })) {
      if (d.activa || Number(d.saldo) > 0) await this.desactivarDeuda(d.id);
    }
    await this.dataSource.transaction(async (manager) => {
      const afectadas: Array<{ planilla_id: string }> = await manager.query('SELECT DISTINCT planilla_id FROM planilla_lineas WHERE empleado_id = $1', [id]);
      await manager.query('DELETE FROM planilla_lineas WHERE empleado_id = $1', [id]);
      if (afectadas.length) {
        await manager.query(
          `UPDATE planilla_planillas p SET
             total_bruto = COALESCE((SELECT SUM(bruto) FROM planilla_lineas WHERE planilla_id = p.id), 0),
             total_deducciones = COALESCE((SELECT SUM(total_deducciones) FROM planilla_lineas WHERE planilla_id = p.id), 0),
             total_neto = COALESCE((SELECT SUM(neto) FROM planilla_lineas WHERE planilla_id = p.id), 0),
             total_cargas_patronales = COALESCE((SELECT SUM(cargas_patronales) FROM planilla_lineas WHERE planilla_id = p.id), 0),
             total_provisiones = COALESCE((SELECT SUM(provisiones) FROM planilla_lineas WHERE planilla_id = p.id), 0)
           WHERE p.id = ANY($1::uuid[])`,
          [afectadas.map((a) => a.planilla_id)],
        );
      }
      await manager.query('DELETE FROM planilla_dias WHERE empleado_id = $1', [id]);
      await manager.query('DELETE FROM planilla_deudas WHERE empleado_id = $1', [id]);
      await manager.query('UPDATE usuarios SET activo = false, version_token = version_token + 1 WHERE empleado_id = $1 AND rol <> $2', [id, 'sistema']);
      await manager.query('DELETE FROM planilla_empleados WHERE id = $1', [id]);
    });
    await this.bitacora.registrar({ accion: 'empleado_eliminado', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: empleado.nombre, detalle: `Empleado eliminado con todo su historial (cédula ${empleado.cedula ?? 'sin cédula'}).` });
    return { nombre: empleado.nombre };
  }

  // Importar empleados desde Excel. Sin aplicar, solo dice qué haría (crear, cambiar, errores);
  // al aplicar se hace lo mismo y se niega si alguna fila tiene error.
  async importarDesdeExcel(buffer: Buffer, aplicar: boolean, usuario: UsuarioAutenticado, decisiones: Record<string, DecisionAusente> = {}) {
    let filas;
    try {
      filas = await leerEmpleadosExcel(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
    if (filas.length === 0) throw new BadRequestException('El archivo no trae empleados.');
    const todos = await this.empleadoRepo.find();
    // El empleado de prueba no es del Excel: no se compara ni se propone como «ausente».
    const existentes = todos.filter((e) => !e.esPrueba);
    const plan = planificarImportacion(filas, existentes);
    const resumen = (p: ResultadoFila[]) => ({
      total: p.length,
      crear: p.filter((x) => x.accion === 'crear').length,
      actualizar: p.filter((x) => x.accion === 'actualizar').length,
      sinCambios: p.filter((x) => x.accion === 'sin_cambios').length,
      errores: p.filter((x) => x.accion === 'error').length,
    });
    const ausentes = await Promise.all(
      ausentesDelArchivo(plan, existentes).map(async (a) => {
        const h = await this.historialDe(a.id);
        const bloqueos = await this.bloqueosParaEliminar(a.id);
        return { ...a, historial: h, bloqueos, sugerencia: h.total === 0 ? 'eliminar' : 'cesar' };
      }),
    );
    if (!aplicar) return { aplicado: false, resumen: resumen(plan), filas: plan, ausentes };
    if (plan.some((x) => x.accion === 'error')) throw new BadRequestException('Hay filas con errores: corríjalas y vuelva a subir el archivo. No se cambió nada.');

    // Las decisiones sobre quien no está en el archivo se validan ANTES de tocar nada.
    const porId = new Map(ausentes.map((a) => [a.id, a]));
    for (const [id, d] of Object.entries(decisiones)) {
      const a = porId.get(id);
      if (!a) throw new BadRequestException('Una de las decisiones no corresponde a un empleado que falte en el archivo.');
      if (d.accion === 'eliminar' && a.historial.total > 0) {
        throw new BadRequestException(`${a.nombre} tiene historial (${a.historial.detalle.map((x) => `${x.cantidad} en ${x.tabla}`).join(', ')}): no se puede borrar sin perderlo. Désele de baja.`);
      }
      if (d.accion === 'eliminar_todo') {
        if (usuario.rol !== 'sistema') throw new ForbiddenException('Solo el administrador del sistema puede eliminar a un empleado con su historial.');
        if (a.bloqueos.length) throw new BadRequestException(`${a.nombre} sale en planillas ya aprobadas o pagadas (${a.bloqueos.join('; ')}): anúlelas primero para poder eliminarlo.`);
      }
      if (d.accion === 'cesar' && (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaCese ?? '') || !d.tipoCese || (d.motivo ?? '').trim().length < 3)) {
        throw new BadRequestException(`Para dar de baja a ${a.nombre} indique la fecha, el tipo y el motivo del cese.`);
      }
    }

    const usados = new Set(todos.map((e) => e.numeroReloj));
    for (const x of plan) {
      const f = x.fila;
      if (x.accion === 'crear') {
        let numeroReloj = f.numeroReloj;
        if (!numeroReloj) {
          const base = `SIN-${(f.cedula ?? String(f.fila)).slice(-12)}`;
          numeroReloj = base;
          for (let i = 2; usados.has(numeroReloj); i++) numeroReloj = `${base}-${i}`;
        }
        usados.add(numeroReloj);
        await this.crear({
          numeroReloj,
          nombre: f.nombre,
          cedula: f.cedula ?? undefined,
          puesto: f.puesto ?? undefined,
          departamento: f.departamento ?? undefined,
          fechaIngreso: f.fechaIngreso ?? undefined,
          tipoSalario: f.tipoSalario as TipoSalario,
          montoSalario: f.monto as number,
          frecuenciaPago: f.frecuenciaPago as FrecuenciaPago,
          horasSemana: f.horasSemana ?? undefined,
          sector: f.sector ?? undefined,
          esDeTienda: f.esDeTienda ?? undefined,
          esConfianza: f.esConfianza ?? undefined,
          marcaReloj: f.marcaReloj ?? undefined,
          cotizaIvm: f.cotizaIvm ?? undefined,
          formaPago: f.formaPago ?? undefined,
          iban: f.iban ?? undefined,
          identificadorBp: f.identificadorBp ?? undefined,
        } as CrearEmpleadoDto, usuario);
      } else if (x.accion === 'actualizar' && x.existente) {
        const dto: Record<string, unknown> = {};
        for (const c of x.cambios) {
          if (c.campo === 'monto') dto.montoSalario = f.monto;
          else dto[c.campo] = (f as unknown as Record<string, unknown>)[c.campo];
        }
        await this.actualizar(x.existente.id, dto as ActualizarEmpleadoDto, usuario);
      }
    }
    const bajas: string[] = [];
    const borrados: string[] = [];
    for (const [id, d] of Object.entries(decisiones)) {
      const a = porId.get(id)!;
      if (d.accion === 'eliminar') {
        await this.dataSource.query('DELETE FROM planilla_empleados WHERE id = $1', [id]);
        borrados.push(a.nombre);
        await this.bitacora.registrar({ accion: 'empleado_eliminado', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: a.nombre, detalle: `Empleado eliminado al importar empleados (cédula ${a.cedula ?? 'sin cédula'}).` });
      } else if (d.accion === 'eliminar_todo') {
        await this.eliminarConHistorial(id, usuario);
        borrados.push(a.nombre);
      } else if (d.accion === 'cesar') {
        await this.cesar(id, { fechaCese: d.fechaCese!, tipoCese: d.tipoCese!, motivo: d.motivo! });
        bajas.push(a.nombre);
      }
    }
    await this.bitacora.registrar({
      accion: 'empleados_importados',
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      objetivo: 'planilla_empleados',
      detalle: `Creados ${resumen(plan).crear}, actualizados ${resumen(plan).actualizar}, dados de baja ${bajas.length}, eliminados ${borrados.length}.`,
    });
    return { aplicado: true, resumen: resumen(plan), filas: plan, ausentes, bajas, borrados };
  }

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

  // Solo el administrador del sistema crea o convierte empleados de prueba: así nadie esconde a un empleado real de la planilla.
  private async validarEsPrueba(dto: { esPrueba?: boolean }, usuario: Pick<UsuarioAutenticado, 'rol'>, empleado?: Empleado) {
    if (dto.esPrueba === undefined || dto.esPrueba === (empleado?.esPrueba ?? false)) return;
    if (usuario.rol !== Rol.SISTEMA) throw new ForbiddenException('Solo el administrador del sistema puede marcar o desmarcar un empleado de prueba.');
    if (dto.esPrueba && empleado && (await this.dataSource.getRepository(PlanillaLinea).count({ where: { empleadoId: empleado.id } })) > 0) {
      throw new BadRequestException('Este empleado ya tiene planillas pagadas: no puede ser de prueba.');
    }
  }

  // Una jornada ordinaria de más de 48 horas por semana es un acuerdo especial (sus horas extra se cuentan desde las suyas):
  // solo el administrador del sistema o la gerencia general pueden pactarla, para que nadie pierda extras por accidente.
  private validarJornadaEspecial(dto: { horasSemana?: number | null }, usuario: Pick<UsuarioAutenticado, 'rol'>, empleado?: Empleado) {
    if (dto.horasSemana == null || dto.horasSemana <= 48) return;
    if (empleado?.horasSemana != null && Number(empleado.horasSemana) === dto.horasSemana) return;
    if (usuario.rol !== Rol.SISTEMA && usuario.rol !== Rol.GERENTE_GENERAL) {
      throw new ForbiddenException('Una jornada ordinaria de más de 48 horas por semana solo la puede pactar el administrador del sistema o la gerencia general.');
    }
  }

  async crear(dto: CrearEmpleadoDto, usuario: Pick<UsuarioAutenticado, 'rol'>): Promise<Empleado> {
    await this.validarEsPrueba(dto, usuario);
    this.validarJornadaEspecial(dto, usuario);
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
        departamento: dto.departamento?.trim() || null,
        esConfianza: dto.esConfianza ?? puestoElegido?.esConfianza ?? false,
        esPrueba: dto.esPrueba === true,
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

  async actualizar(id: string, dto: ActualizarEmpleadoDto, usuario: Pick<UsuarioAutenticado, 'rol'>): Promise<Empleado> {
    const empleado = await this.buscarOFallar(id);
    await this.validarEsPrueba(dto, usuario, empleado);
    this.validarJornadaEspecial(dto, usuario, empleado);
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
    if (dto.departamento !== undefined) empleado.departamento = dto.departamento.trim() || null;
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
