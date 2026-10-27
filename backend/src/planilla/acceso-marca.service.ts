import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { AccesoMarca } from './acceso-marca.entity.js';
import {
  crearReto,
  firmaValida,
  generarCodigoEnrolamiento,
  HORAS_VIGENCIA_CODIGO,
  huellaCodigo,
  LARGO_PIN,
  pinDebil,
  validarLlavePublica,
  validarReto,
} from './acceso-marca-cripto.js';
import type { EnrolarDispositivoDto, IdentificarDto } from './dto/acceso-marca.dto.js';
import { Empleado } from './empleado.entity.js';
import { exentoDeReloj } from './exento-reloj.js';

const INTENTOS_MAXIMOS = 5;
const MINUTOS_BLOQUEO = 15;
const FALLO_GENERICO = 'No se pudo verificar. Revise su PIN o pida ayuda al administrador del sistema.';

export type EstadoAcceso = 'sin_acceso' | 'codigo_pendiente' | 'registrado' | 'bloqueado';
type Actor = { id: string; email?: string };

@Injectable()
export class AccesoMarcaService {
  constructor(
    @InjectRepository(AccesoMarca) private readonly repo: Repository<AccesoMarca>,
    @InjectRepository(Empleado) private readonly empleados: Repository<Empleado>,
    private readonly bitacora: BitacoraService,
    private readonly config: ConfigService,
  ) {}

  private estado(a: AccesoMarca | undefined, ahora = new Date()): EstadoAcceso {
    if (!a) return 'sin_acceso';
    if (a.bloqueadoHasta && a.bloqueadoHasta > ahora) return 'bloqueado';
    if (a.llavePublica) return 'registrado';
    if (a.codigoHuella && a.codigoVence && a.codigoVence > ahora) return 'codigo_pendiente';
    return 'sin_acceso';
  }

  // ---- Administrador del sistema ----

  async listar() {
    const [empleados, accesos] = await Promise.all([this.empleados.find({ where: { activo: true }, order: { nombre: 'ASC' } }), this.repo.find()]);
    const porEmpleado = new Map(accesos.map((a) => [a.empleadoId, a]));
    return empleados
      .filter((e) => !e.fechaCese && !exentoDeReloj(e))
      .map((e) => {
        const a = porEmpleado.get(e.id);
        return {
          empleadoId: e.id,
          nombre: e.nombre,
          departamento: e.departamento,
          estado: this.estado(a),
          dispositivo: a?.llavePublica ? a.dispositivoEtiqueta : null,
          registradoEn: a?.llavePublica ? a.registradoEn : null,
          ultimoUsoEn: a?.ultimoUsoEn ?? null,
          codigoVence: this.estado(a) === 'codigo_pendiente' ? a?.codigoVence : null,
          bloqueadoHasta: this.estado(a) === 'bloqueado' ? a?.bloqueadoHasta : null,
        };
      });
  }

  private async empleadoElegible(empleadoId: string): Promise<Empleado> {
    const empleado = await this.empleados.findOneBy({ id: empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    if (!empleado.activo || empleado.fechaCese) throw new BadRequestException('El empleado no está activo.');
    if (exentoDeReloj(empleado)) throw new BadRequestException('Este empleado no marca asistencia (puesto de confianza o sin reloj).');
    return empleado;
  }

  // Genera un código de activación de un solo uso. Si ya había celular o PIN, se borran: el empleado
  // vuelve a registrar su celular y a elegir su PIN. Es la única forma de cambiar de celular.
  async generarCodigo(empleadoId: string, actor: Actor, ip?: string) {
    const empleado = await this.empleadoElegible(empleadoId);
    const codigo = generarCodigoEnrolamiento();
    const vence = new Date(Date.now() + HORAS_VIGENCIA_CODIGO * 3_600_000);
    const previo = await this.repo.findOneBy({ empleadoId });
    const acceso = previo ?? this.repo.create({ empleadoId });
    const habiaCelular = !!acceso.llavePublica;
    Object.assign(acceso, {
      codigoHuella: huellaCodigo(codigo),
      codigoVence: vence,
      pinHash: null,
      pinIntentos: 0,
      bloqueadoHasta: null,
      llavePublica: null,
      dispositivoEtiqueta: null,
      registradoEn: null,
      generadoPorId: actor.id,
    });
    await this.repo.save(acceso);
    await this.bitacora.registrar({
      accion: 'marca_acceso_codigo',
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      objetivo: empleado.nombre,
      detalle: habiaCelular ? 'Código nuevo: se liberó el celular y el PIN anteriores.' : 'Código de activación nuevo.',
      ip,
    });
    return { codigo, vence, empleado: empleado.nombre };
  }

  // Quita el celular y el PIN sin dar un código nuevo (ej. el empleado perdió el celular o dejó la empresa).
  async liberar(empleadoId: string, motivo: string, actor: Actor, ip?: string) {
    const empleado = await this.empleados.findOneBy({ id: empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    const acceso = await this.repo.findOneBy({ empleadoId });
    if (!acceso) return { liberado: false };
    Object.assign(acceso, { codigoHuella: null, codigoVence: null, pinHash: null, pinIntentos: 0, bloqueadoHasta: null, llavePublica: null, dispositivoEtiqueta: null, registradoEn: null });
    await this.repo.save(acceso);
    await this.bitacora.registrar({ accion: 'marca_acceso_liberado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: empleado.nombre, detalle: motivo, ip });
    return { liberado: true };
  }

  // ---- Celular del empleado (sin sesión) ----

  async enrolar(dto: EnrolarDispositivoDto, ip?: string) {
    const invalido = new BadRequestException('El código no es válido o ya venció. Pida uno nuevo al administrador del sistema.');
    const acceso = await this.repo.findOne({ where: { codigoHuella: huellaCodigo(dto.codigo) }, relations: { empleado: true } });
    if (!acceso || !acceso.codigoVence || acceso.codigoVence < new Date() || acceso.llavePublica) throw invalido;
    if (!acceso.empleado.activo || acceso.empleado.fechaCese) throw invalido;
    if (pinDebil(dto.pin)) throw new BadRequestException(`El PIN debe tener ${LARGO_PIN} números y no ser evidente (no 123456, 111111, etc.).`);
    const llave = validarLlavePublica(dto.llavePublica);
    if (!llave) throw new BadRequestException('Este celular no pudo generar su llave de seguridad. Use un navegador actualizado.');

    acceso.pinHash = await bcrypt.hash(dto.pin, 10);
    acceso.llavePublica = llave;
    acceso.dispositivoEtiqueta = dto.etiqueta.trim().slice(0, 160) || 'Celular';
    acceso.registradoEn = new Date();
    acceso.codigoHuella = null; // un código sirve una sola vez
    acceso.codigoVence = null;
    acceso.pinIntentos = 0;
    acceso.bloqueadoHasta = null;
    acceso.ultimoReto = 0;
    await this.repo.save(acceso);
    await this.bitacora.registrar({ accion: 'marca_acceso_enrolado', objetivo: acceso.empleado.nombre, detalle: acceso.dispositivoEtiqueta, ip });
    return { accesoId: acceso.id, empleado: { nombre: acceso.empleado.nombre } };
  }

  // No revela si el identificador existe: siempre devuelve un reto.
  pedirReto() {
    return { reto: crearReto(this.config.getOrThrow<string>('JWT_SECRET')) };
  }

  // Comprueba que quien escribe es el empleado: su celular (firma) y su PIN. Es la puerta de toda acción de marca.
  async identificar(dto: IdentificarDto, ip?: string): Promise<{ acceso: AccesoMarca; empleado: Empleado; datos: unknown }> {
    const acceso = await this.repo.findOne({ where: { id: dto.accesoId.match(/^[0-9a-f-]{36}$/i) ? dto.accesoId : '00000000-0000-0000-0000-000000000000' }, relations: { empleado: true } });
    if (!acceso || !acceso.llavePublica || !acceso.empleado?.activo || acceso.empleado.fechaCese) throw new UnauthorizedException(FALLO_GENERICO);
    const nombre = acceso.empleado.nombre;

    if (acceso.bloqueadoHasta && acceso.bloqueadoHasta > new Date()) {
      throw new HttpException('Demasiados intentos fallidos. Pida ayuda al administrador del sistema.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const fallar = async (detalle: string): Promise<never> => {
      acceso.pinIntentos += 1;
      const bloquear = acceso.pinIntentos >= INTENTOS_MAXIMOS;
      if (bloquear) {
        acceso.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60_000);
        acceso.pinIntentos = 0;
      }
      await this.repo.save(acceso);
      await this.bitacora.registrar({ accion: bloquear ? 'marca_acceso_bloqueado' : 'marca_acceso_fallido', objetivo: nombre, detalle, ip });
      throw new UnauthorizedException(FALLO_GENERICO);
    };

    const marcaReto = validarReto(this.config.getOrThrow<string>('JWT_SECRET'), dto.reto);
    if (marcaReto === null || marcaReto <= acceso.ultimoReto) throw new UnauthorizedException('La verificación venció. Intente de nuevo.');
    if (!firmaValida(acceso.llavePublica, `${dto.reto}|${dto.datos}`, dto.firma)) return fallar('firma de un celular distinto al registrado');

    // El reto se quema de una vez (aun si el PIN falla) y de forma atómica: dos envíos iguales no pasan los dos.
    const quemado = await this.repo.createQueryBuilder().update(AccesoMarca).set({ ultimoReto: marcaReto }).where('id = :id AND ultimo_reto < :ts', { id: acceso.id, ts: marcaReto }).execute();
    if (quemado.affected !== 1) throw new UnauthorizedException('La verificación venció. Intente de nuevo.');

    const conPin = await this.repo.findOne({ where: { id: acceso.id }, select: { id: true, pinHash: true } });
    if (!conPin?.pinHash || !(await bcrypt.compare(dto.pin, conPin.pinHash))) return fallar('PIN incorrecto');

    acceso.pinIntentos = 0;
    acceso.ultimoUsoEn = new Date();
    acceso.ultimoReto = marcaReto;
    await this.repo.save(acceso);

    let datos: unknown = null;
    try {
      datos = JSON.parse(dto.datos);
    } catch {
      throw new BadRequestException('Los datos enviados no son válidos.');
    }
    return { acceso, empleado: acceso.empleado, datos };
  }
}
