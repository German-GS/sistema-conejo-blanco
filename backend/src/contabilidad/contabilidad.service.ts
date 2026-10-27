import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CuentaContable } from './cuenta-contable.entity.js';
import { AsientoContable } from './asiento-contable.entity.js';
import { LineaAsiento } from './linea-asiento.entity.js';
import { PeriodoCerrado } from './periodo-cerrado.entity.js';
import { CATALOGO_CUENTAS } from './catalogo-cuentas.js';
import { NaturalezaCuenta, TipoCuentaContable } from '../common/enums/tipo-cuenta-contable.enum.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import type { ActualizarCuentaContableDto, CrearAsientoManualDto, CrearCuentaContableDto } from './dto/contabilidad.dto.js';

export const CUENTA = {
  CAJA: '1100',
  CUENTAS_POR_COBRAR: '1200',
  CUENTAS_POR_COBRAR_EMPLEADOS: '1250',
  INVENTARIO: '1300',
  INVENTARIO_TIENDAS: '1305',
  PERDIDA_MERMAS: '5440',
  DIFERENCIA_COSTO_TRASLADOS: '5460',
  SALARIOS_POR_PAGAR: '2100',
  CARGAS_SOCIALES_POR_PAGAR: '2110',
  RENTA_SALARIOS_POR_PAGAR: '2120',
  PROVISIONES_POR_PAGAR: '2130',
  INS_POR_PAGAR: '2140',
  DEDUCCIONES_TERCEROS_POR_PAGAR: '2160',
  IVA_CREDITO: '1400',
  RETENCIONES_RENTA_A_FAVOR: '1410',
  RENTA_POR_PAGAR: '2150',
  UTILIDADES_ACUMULADAS: '3300',
  GASTO_RENTA: '5500',
  IVA_POR_PAGAR: '2200',
  VENTAS: '4100',
  OTROS_INGRESOS: '4200',
  COSTO_VENTAS: '5100',
  SUELDOS_Y_SALARIOS: '5200',
  CARGAS_SOCIALES_PATRONALES: '5210',
  GASTO_PROVISIONES: '5220',
  VIATICOS: '5230',
  GASTOS_DIVERSOS: '5900',
} as const;

interface LineaAsientoInput {
  codigoCuenta: string;
  debe?: number;
  haber?: number;
}

interface RegistrarAsientoInput {
  fecha: string;
  descripcion: string;
  origenTipo?: string;
  origenId?: string;
  lineas: LineaAsientoInput[];
  // Solo para reversas de un período ya cerrado (ver reversarEnTransaccion).
  ignorarCierre?: boolean;
}

@Injectable()
export class ContabilidadService implements OnModuleInit {
  constructor(
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    @InjectRepository(AsientoContable)
    private readonly asientoRepo: Repository<AsientoContable>,
    @InjectRepository(PeriodoCerrado)
    private readonly periodoRepo: Repository<PeriodoCerrado>,
    private readonly dataSource: DataSource,
  ) {}

  // Siembra el catálogo de cuentas al arrancar — mismo criterio que
  // Conejo Aquatics (catalogo-cuentas.ts fijo, no editable desde la app
  // todavía). Idempotente por código: si el catálogo crece más adelante
  // (ej. se agregó Inventario/Costo de Ventas), las cuentas nuevas se
  // siembran solas en el próximo arranque sin tocar las que ya existen.
  async onModuleInit() {
    await this.prepararNumeracion();
    const existentes = await this.cuentaRepo.find({ select: { codigo: true } });
    const codigosExistentes = new Set(existentes.map((c) => c.codigo));
    const faltantes = CATALOGO_CUENTAS.filter((c) => !codigosExistentes.has(c.codigo));
    if (faltantes.length > 0) {
      await this.cuentaRepo.save(this.cuentaRepo.create(faltantes.map((c) => ({ ...c, sistema: c.sistema ?? false }))));
    }
    // Las cuentas que ya existían antes de que el catálogo tuviera
    // descripción o la marca "sistema" las reciben ahora (sin pisar lo
    // que alguien haya escrito a mano).
    for (const def of CATALOGO_CUENTAS) {
      if (!codigosExistentes.has(def.codigo)) continue;
      await this.cuentaRepo.update({ codigo: def.codigo, descripcion: '' }, { descripcion: def.descripcion });
      if (def.sistema) await this.cuentaRepo.update({ codigo: def.codigo }, { sistema: true });
    }
  }

  // Secuencia del número de asiento. Los asientos anteriores a esta función se
  // numeran una sola vez, en el orden en que se crearon.
  private async prepararNumeracion(): Promise<void> {
    await this.dataSource.query('CREATE SEQUENCE IF NOT EXISTS asientos_numero_seq');
    const [{ pendientes }] = await this.dataSource.query('SELECT COUNT(*)::int AS pendientes FROM asientos_contables WHERE numero IS NULL');
    if (pendientes > 0) {
      await this.dataSource.query(`
        WITH base AS (SELECT COALESCE(MAX(numero), 0) AS m FROM asientos_contables),
        ordenados AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY creado_en, id) AS rn FROM asientos_contables WHERE numero IS NULL
        )
        UPDATE asientos_contables a SET numero = base.m + ordenados.rn
        FROM ordenados, base WHERE a.id = ordenados.id`);
    }
    await this.dataSource.query(
      `SELECT setval('asientos_numero_seq', GREATEST((SELECT COALESCE(MAX(numero), 0) FROM asientos_contables), 1), (SELECT COUNT(*) > 0 FROM asientos_contables))`,
    );
  }

  async listarCuentas(): Promise<Array<CuentaContable & { saldo: string }>> {
    const cuentas = await this.cuentaRepo.find({ order: { codigo: 'ASC' } });
    const resultado = [];
    for (const cuenta of cuentas) {
      const { debe, haber } = await this.asientoRepo.manager
        .createQueryBuilder(LineaAsiento, 'linea')
        .select('COALESCE(SUM(linea.debe), 0)', 'debe')
        .addSelect('COALESCE(SUM(linea.haber), 0)', 'haber')
        .where('linea.cuenta_id = :id', { id: cuenta.id })
        .getRawOne();

      const saldo =
        cuenta.naturaleza === NaturalezaCuenta.DEUDORA
          ? redondear(Number(debe) - Number(haber))
          : redondear(Number(haber) - Number(debe));

      resultado.push({ ...cuenta, saldo: saldo.toFixed(2) });
    }
    return resultado;
  }

  listarAsientos(limite = 100): Promise<AsientoContable[]> {
    return this.asientoRepo.find({
      relations: { lineas: true },
      order: { fecha: 'DESC', creadoEn: 'DESC' },
      take: limite,
    });
  }

  // Crea una cuenta de activo nueva (ej. una cuenta bancaria) con el
  // siguiente código libre del rango 1110–1199, que queda reservado para
  // bancos. Dentro de la transacción de quien la necesita.
  async crearCuentaActivoEnTransaccion(manager: EntityManager, nombre: string): Promise<CuentaContable> {
    const usadas = new Set((await manager.find(CuentaContable, { select: { codigo: true } })).map((c) => c.codigo));
    for (let n = 1110; n <= 1199; n++) {
      const codigo = String(n);
      if (usadas.has(codigo)) continue;
      return manager.save(
        CuentaContable,
        manager.create(CuentaContable, {
          codigo,
          nombre,
          tipo: TipoCuentaContable.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          sistema: true,
          descripcion: 'Cuenta bancaria (se administra en Configuración → Cuentas bancarias).',
        }),
      );
    }
    throw new BadRequestException('No quedan códigos de cuenta libres para bancos (1110–1199).');
  }

  async renombrarCuentaEnTransaccion(manager: EntityManager, id: string, nombre: string, activa?: boolean): Promise<void> {
    await manager.update(CuentaContable, id, { nombre, ...(activa !== undefined ? { activa } : {}) });
  }

  // Se llama SIEMPRE dentro de una transacción ya abierta por quien
  // origina el asiento (facturación, registro de pago) — nunca abre la
  // suya propia, para que el asiento quede atómico junto con el hecho de
  // negocio que lo generó (ver FacturacionService.facturarPedido).
  async registrarAsientoEnTransaccion(manager: EntityManager, input: RegistrarAsientoInput): Promise<AsientoContable> {
    const totalDebe = redondear(input.lineas.reduce((acc, l) => acc + (l.debe ?? 0), 0));
    const totalHaber = redondear(input.lineas.reduce((acc, l) => acc + (l.haber ?? 0), 0));
    if (totalDebe !== totalHaber) {
      throw new BadRequestException(
        `El asiento no cuadra: debe ${totalDebe} ≠ haber ${totalHaber} (${input.descripcion}).`,
      );
    }

    if (!input.ignorarCierre) await this.exigirPeriodoAbierto(manager, input.fecha);

    const codigos = [...new Set(input.lineas.map((l) => l.codigoCuenta))];
    const cuentas = await manager.find(CuentaContable, { where: codigos.map((codigo) => ({ codigo })) });
    const cuentaPorCodigo = new Map(cuentas.map((c) => [c.codigo, c]));

    const [{ n }] = await manager.query(`SELECT nextval('asientos_numero_seq') AS n`);
    const asiento = manager.create(AsientoContable, {
      numero: Number(n),
      fecha: input.fecha,
      descripcion: input.descripcion,
      origenTipo: input.origenTipo ?? null,
      origenId: input.origenId ?? null,
      lineas: input.lineas.map((l) => {
        const cuenta = cuentaPorCodigo.get(l.codigoCuenta);
        if (!cuenta) {
          throw new Error(`No existe la cuenta contable ${l.codigoCuenta} — revisar CATALOGO_CUENTAS.`);
        }
        return Object.assign(new LineaAsiento(), {
          cuentaId: cuenta.id,
          debe: (l.debe ?? 0).toFixed(2),
          haber: (l.haber ?? 0).toFixed(2),
        });
      }),
    });

    return manager.save(AsientoContable, asiento);
  }

  // ---- Catálogo editable ----

  async crearCuenta(dto: CrearCuentaContableDto): Promise<CuentaContable> {
    const prefijoTipo: Record<TipoCuentaContable, string[]> = {
      [TipoCuentaContable.ACTIVO]: ['1'],
      [TipoCuentaContable.PASIVO]: ['2'],
      [TipoCuentaContable.PATRIMONIO]: ['3'],
      [TipoCuentaContable.INGRESO]: ['4'],
      [TipoCuentaContable.GASTO]: ['5'],
    };
    if (!prefijoTipo[dto.tipo].includes(dto.codigo[0])) {
      throw new BadRequestException('El primer dígito del código no coincide con el tipo de cuenta.');
    }
    if (await this.cuentaRepo.exists({ where: { codigo: dto.codigo } })) {
      throw new BadRequestException(`Ya existe la cuenta ${dto.codigo}.`);
    }
    if (dto.codigo >= '1110' && dto.codigo <= '1199') {
      throw new BadRequestException('Los códigos 1110–1199 están reservados para cuentas bancarias (se crean en Configuración).');
    }
    const naturaleza =
      dto.naturaleza ??
      (dto.tipo === TipoCuentaContable.ACTIVO || dto.tipo === TipoCuentaContable.GASTO ? NaturalezaCuenta.DEUDORA : NaturalezaCuenta.ACREEDORA);
    return this.cuentaRepo.save(
      this.cuentaRepo.create({ codigo: dto.codigo, nombre: dto.nombre.trim(), tipo: dto.tipo, naturaleza, descripcion: dto.descripcion?.trim() ?? '' }),
    );
  }

  async actualizarCuenta(id: string, dto: ActualizarCuentaContableDto): Promise<CuentaContable> {
    const cuenta = await this.cuentaRepo.findOneBy({ id });
    if (!cuenta) throw new NotFoundException('La cuenta no existe.');
    if (dto.activa === false && cuenta.sistema) {
      throw new BadRequestException('Esta cuenta la usa el sistema: no se puede desactivar.');
    }
    if (dto.activa === false) {
      const { debe, haber } = await this.dataSource
        .createQueryBuilder(LineaAsiento, 'l')
        .select('COALESCE(SUM(l.debe), 0)', 'debe')
        .addSelect('COALESCE(SUM(l.haber), 0)', 'haber')
        .where('l.cuenta_id = :id', { id })
        .getRawOne();
      if (Math.abs(Number(debe) - Number(haber)) > 0.004) {
        throw new BadRequestException('La cuenta tiene saldo: no se puede desactivar.');
      }
    }
    if (dto.nombre !== undefined) cuenta.nombre = dto.nombre.trim();
    if (dto.descripcion !== undefined) cuenta.descripcion = dto.descripcion.trim();
    if (dto.activa !== undefined) cuenta.activa = dto.activa;
    return this.cuentaRepo.save(cuenta);
  }

  // ---- Asientos manuales ----

  async crearAsientoManual(dto: CrearAsientoManualDto, usuarioId: string): Promise<AsientoContable> {
    if (Number.isNaN(Date.parse(dto.fecha))) throw new BadRequestException('La fecha no es válida.');
    const ids = [...new Set(dto.lineas.map((l) => l.cuentaId))];
    const cuentas = await this.cuentaRepo.find({ where: ids.map((id) => ({ id })) });
    const porId = new Map(cuentas.map((c) => [c.id, c]));
    for (const [i, l] of dto.lineas.entries()) {
      const cuenta = porId.get(l.cuentaId);
      if (!cuenta) throw new BadRequestException(`La cuenta de la línea ${i + 1} no existe.`);
      if (!cuenta.activa) throw new BadRequestException(`La cuenta ${cuenta.codigo} está desactivada.`);
      const debe = l.debe ?? 0;
      const haber = l.haber ?? 0;
      if ((debe > 0) === (haber > 0)) {
        throw new BadRequestException(`La línea ${i + 1} debe tener un monto en Débito o en Crédito (no en ambos ni en ninguno).`);
      }
    }
    return this.dataSource.transaction(async (manager) => {
      const asiento = await this.registrarAsientoEnTransaccion(manager, {
        fecha: dto.fecha,
        descripcion: dto.descripcion.trim(),
        origenTipo: 'manual',
        lineas: dto.lineas.map((l) => ({ codigoCuenta: porId.get(l.cuentaId)!.codigo, debe: l.debe, haber: l.haber })),
      });
      await manager.update(AsientoContable, asiento.id, { creadoPorId: usuarioId });
      return asiento;
    });
  }

  // ---- Períodos cerrados ----

  private periodoDe(fecha: string): string {
    return fecha.slice(0, 7);
  }

  async listarPeriodosCerrados(): Promise<PeriodoCerrado[]> {
    return this.periodoRepo.find({ order: { periodo: 'DESC' } });
  }

  async estaCerrado(manager: EntityManager, fecha: string): Promise<boolean> {
    return manager.exists(PeriodoCerrado, { where: { periodo: this.periodoDe(fecha) } });
  }

  private async exigirPeriodoAbierto(manager: EntityManager, fecha: string): Promise<void> {
    if (await this.estaCerrado(manager, fecha)) {
      throw new BadRequestException(
        `El período contable ${this.periodoDe(fecha)} está cerrado: no se pueden registrar asientos con fecha en ese mes. Administración puede reabrirlo.`,
      );
    }
  }

  // ---- Reversas ----

  // Reversa un asiento con otro inverso (nunca se borra nada). La reversa se
  // fecha en el MISMO día que el asiento original, para que los dos se
  // cancelen dentro del mismo período — si se fecharan "hoy", una corrección
  // de un gasto de un mes anterior dejaría ese gasto en negativo este mes y
  // la utilidad de ambos meses saldría distorsionada. Si el período del
  // original ya está cerrado, la reversa se fecha hoy (ajuste del período abierto).
  async reversarEnTransaccion(
    manager: EntityManager,
    original: AsientoContable,
    motivo: string,
    descripcion?: string,
    // Para deshacer asientos de cierre: van en el mismo día y aunque el mes esté cerrado.
    mismaFecha = false,
  ): Promise<AsientoContable> {
    const cerrado = mismaFecha ? false : await this.estaCerrado(manager, original.fecha);
    return this.registrarAsientoEnTransaccion(manager, {
      ignorarCierre: mismaFecha,
      fecha: cerrado ? hoyISO() : original.fecha,
      descripcion: (descripcion ?? `Reversa de «${original.descripcion}» — ${motivo.trim()}`).slice(0, 255),
      origenTipo: 'reversa',
      origenId: original.id,
      lineas: original.lineas.map((l) => ({
        codigoCuenta: l.cuenta.codigo,
        debe: Number(l.haber),
        haber: Number(l.debe),
      })),
    });
  }

  // Reversa los asientos dados que aún no estén reversados.
  async reversarAsientosEnTransaccion(
    manager: EntityManager,
    asientos: AsientoContable[],
    motivo: string,
    descripcion?: string,
    mismaFecha = false,
  ): Promise<AsientoContable[]> {
    const reversas: AsientoContable[] = [];
    for (const original of asientos) {
      if (await manager.exists(AsientoContable, { where: { origenTipo: 'reversa', origenId: original.id } })) continue;
      reversas.push(await this.reversarEnTransaccion(manager, original, motivo, descripcion, mismaFecha));
    }
    return reversas;
  }

  // Reversa todos los asientos de un documento de origen (ej. el asiento de
  // un recibo de caja al anularlo).
  async reversarPorOrigenEnTransaccion(
    manager: EntityManager,
    origenTipo: string,
    origenId: string,
    motivo: string,
    descripcion?: string,
  ): Promise<AsientoContable[]> {
    const originales = await manager.find(AsientoContable, {
      where: { origenTipo, origenId },
      relations: { lineas: { cuenta: true } },
      order: { numero: 'ASC' },
    });
    return this.reversarAsientosEnTransaccion(manager, originales, motivo, descripcion);
  }

  // Un asiento manual no se edita ni se borra: se reversa con otro asiento
  // inverso, y los dos quedan en el libro diario.
  async reversarAsiento(id: string, motivo: string, usuarioId: string): Promise<AsientoContable> {
    const original = await this.asientoRepo.findOne({ where: { id }, relations: { lineas: { cuenta: true } } });
    if (!original) throw new NotFoundException('El asiento no existe.');
    if (original.origenTipo !== 'manual') {
      throw new BadRequestException('Solo se pueden reversar asientos manuales. Los automáticos se corrigen anulando el documento que los generó.');
    }
    if (await this.asientoRepo.exists({ where: { origenTipo: 'reversa', origenId: id } })) {
      throw new BadRequestException('Este asiento ya fue reversado.');
    }
    return this.dataSource.transaction(async (manager) => {
      const reversa = await this.reversarEnTransaccion(manager, original, motivo);
      await manager.update(AsientoContable, reversa.id, { creadoPorId: usuarioId });
      return reversa;
    });
  }
}
