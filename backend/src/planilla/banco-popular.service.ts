import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfiguracionBancoPopular } from './configuracion-banco-popular.entity.js';
import { Planilla } from './planilla.entity.js';
import { Empleado } from './empleado.entity.js';
import { EstadoPlanilla } from './planilla.enums.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { hoyISO } from '../common/utils/fecha.util.js';
import { armarArchivoBp, cuentaDeIban, ibanValido, limpiarTexto, type EmpresaBp, type PagoBp } from './banco-popular.js';
import type { ActualizarBancoPopularDto } from './dto/banco-popular.dto.js';

const CONFIG_ID = 'general';
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Qué se manda al banco con una planilla: la preparación dice si está todo
// listo (y qué falta, empleado por empleado) y generarTxt arma el archivo.
@Injectable()
export class BancoPopularService {
  constructor(
    @InjectRepository(ConfiguracionBancoPopular)
    private readonly configRepo: Repository<ConfiguracionBancoPopular>,
    @InjectRepository(Planilla)
    private readonly planillaRepo: Repository<Planilla>,
    @InjectRepository(Empleado)
    private readonly empleadoRepo: Repository<Empleado>,
    private readonly configuracionService: ConfiguracionService,
  ) {}

  async obtenerConfig(): Promise<ConfiguracionBancoPopular> {
    const existente = await this.configRepo.findOneBy({ id: CONFIG_ID });
    if (existente) return existente;
    // La primera vez se precarga con lo que ya se sabe de la empresa.
    const factura = await this.configuracionService.obtenerFactura();
    return this.configRepo.save(
      this.configRepo.create({
        id: CONFIG_ID,
        nombreEmpresa: factura.razonSocial,
        cedulaPatrono: factura.cedulaJuridica.replace(/\D/g, ''),
      }),
    );
  }

  async actualizarConfig(dto: ActualizarBancoPopularDto): Promise<ConfiguracionBancoPopular> {
    const config = await this.obtenerConfig();
    Object.assign(config, dto);
    if (dto.cuentaPatrono) config.cuentaPatrono = dto.cuentaPatrono.toUpperCase();
    return this.configRepo.save(config);
  }

  private sugerirDescripcion(p: Planilla): string {
    const [, m1, d1] = p.fechaDesde.split('-').map(Number);
    const [, m2, d2] = p.fechaHasta.split('-').map(Number);
    const freq = p.frecuencia.toUpperCase();
    return m1 === m2
      ? `${freq} ${d1} AL ${d2} ${MESES[m2 - 1]}`
      : `${freq} ${d1} ${MESES[m1 - 1]} AL ${d2} ${MESES[m2 - 1]}`;
  }

  async preparar(planillaId: string, descripcion?: string) {
    const planilla = await this.planillaRepo.findOne({ where: { id: planillaId }, relations: { lineas: true } });
    if (!planilla) throw new NotFoundException('La planilla no existe.');
    const config = await this.obtenerConfig();
    const problemas: string[] = [];

    if (planilla.estado === EstadoPlanilla.ANULADA) {
      problemas.push('La planilla está anulada: no se genera archivo del banco.');
    }
    if (planilla.estado === EstadoPlanilla.BORRADOR) {
      problemas.push('La planilla todavía es un borrador: aprobala antes de generar el archivo del banco.');
    }
    if (!config.nombreEmpresa.trim()) problemas.push('Falta el nombre de la empresa (Parámetros → Banco Popular).');
    if (!config.numeroPatrono) problemas.push('Falta el número de patrono (Parámetros → Banco Popular).');
    if (!config.cedulaPatrono) problemas.push('Falta la cédula jurídica (Parámetros → Banco Popular).');
    if (!config.identificadorCliente) problemas.push('Falta el identificador único de cliente de la empresa (Parámetros → Banco Popular).');
    if (!ibanValido(config.cuentaPatrono)) problemas.push('Falta el IBAN de la cuenta de la empresa, o no es válido (Parámetros → Banco Popular).');

    const empleados = await this.empleadoRepo.find({ where: { id: In(planilla.lineas.map((l) => l.empleadoId)) } });
    const porId = new Map(empleados.map((e) => [e.id, e]));

    const pagos: PagoBp[] = [];
    const efectivo: Array<{ nombre: string; monto: number }> = [];
    // Los socios: se calculan y se pagan sus cargas, pero no se les deposita (no van en el archivo ni se pagan en efectivo).
    const sinDeposito: Array<{ nombre: string; monto: number }> = [];
    const sinMonto: string[] = [];
    for (const linea of [...planilla.lineas].sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre))) {
      const monto = Number(linea.neto);
      const emp = porId.get(linea.empleadoId);
      if (monto <= 0) {
        sinMonto.push(linea.empleadoNombre);
        continue;
      }
      if (emp?.formaPago === 'sin_deposito') {
        sinDeposito.push({ nombre: linea.empleadoNombre, monto });
        continue;
      }
      if (!emp || emp.formaPago === 'efectivo') {
        efectivo.push({ nombre: linea.empleadoNombre, monto });
        continue;
      }
      const cedula = (emp.cedula ?? '').replace(/\D/g, '');
      const faltan: string[] = [];
      if (!emp.iban || !ibanValido(emp.iban)) faltan.push('IBAN válido');
      if (!emp.identificadorBp) faltan.push('identificador de cliente del Banco Popular');
      if (cedula.length < 9) faltan.push('cédula');
      if (faltan.length > 0) {
        problemas.push(`${emp.nombre}: falta ${faltan.join(', ')} (Planilla → Empleados).`);
        continue;
      }
      pagos.push({ nombre: emp.nombre, cedula, identificadorBp: emp.identificadorBp!, iban: emp.iban!, monto });
    }
    if (pagos.length === 0 && problemas.length === 0) {
      problemas.push('Ningún empleado de esta planilla se paga por el Banco Popular.');
    }

    const desc = descripcion?.trim() || this.sugerirDescripcion(planilla);
    const empresa: EmpresaBp = { ...config };
    let archivo: ReturnType<typeof armarArchivoBp> | null = null;
    if (problemas.length === 0) archivo = armarArchivoBp(empresa, pagos, desc, hoyISO());

    return {
      listo: problemas.length === 0,
      problemas,
      descripcion: limpiarTexto(desc, 25),
      nombreArchivo: archivo?.nombreArchivo ?? null,
      total: archivo?.total ?? 0,
      pagos: pagos.map((p) => ({ nombre: p.nombre, cuenta: cuentaDeIban(p.iban), monto: p.monto })),
      efectivo,
      sinDeposito,
      sinMonto,
      contenido: archivo?.contenido ?? null,
    };
  }

  async generarTxt(planillaId: string, descripcion?: string): Promise<{ nombre: string; contenido: string }> {
    const r = await this.preparar(planillaId, descripcion);
    if (!r.listo || !r.contenido || !r.nombreArchivo) {
      throw new BadRequestException(`No se puede generar el archivo: ${r.problemas.join(' ')}`);
    }
    return { nombre: r.nombreArchivo, contenido: r.contenido };
  }
}
