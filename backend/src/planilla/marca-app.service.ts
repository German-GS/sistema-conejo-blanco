import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Between, Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { hoyISO, sumarDias } from '../common/utils/fecha.util.js';
import { AccesoMarcaService } from './acceso-marca.service.js';
import { AsistenciaService } from './asistencia.service.js';
import type { GuardarPuntoMarcaDto, IdentificarDto } from './dto/acceso-marca.dto.js';
import { MarcaApp } from './marca-app.entity.js';
import {
  codigoQr,
  codigoQrValido,
  evaluarUbicacion,
  fechaHoraCostaRica,
  MINUTOS_ENTRE_MARCAS,
  nuevoSecreto,
  nuevoTokenPantalla,
  segundosRestantes,
  ventanaDe,
} from './marca-punto.js';
import { PuntoMarca } from './punto-marca.entity.js';

const huella = (token: string): string => createHash('sha256').update(token).digest('hex');
type Actor = { id: string; email?: string };

@Injectable()
export class MarcaAppService {
  constructor(
    @InjectRepository(PuntoMarca) private readonly puntos: Repository<PuntoMarca>,
    @InjectRepository(MarcaApp) private readonly marcas: Repository<MarcaApp>,
    private readonly acceso: AccesoMarcaService,
    private readonly asistencia: AsistenciaService,
    private readonly bitacora: BitacoraService,
  ) {}

  // ---- Puntos de marca (administrador del sistema) ----

  listarPuntos() {
    return this.puntos.find({ order: { tipo: 'ASC', nombre: 'ASC' } });
  }

  async crearPunto(dto: GuardarPuntoMarcaDto, actor: Actor) {
    const punto = await this.puntos.save(
      this.puntos.create({ nombre: dto.nombre.trim(), tipo: dto.tipo, latitud: dto.latitud ?? null, longitud: dto.longitud ?? null, radioMetros: dto.radioMetros, requiereQr: dto.requiereQr, activo: dto.activo ?? true, secreto: nuevoSecreto() }),
    );
    await this.bitacora.registrar({ accion: 'marca_punto_guardado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: punto.nombre, detalle: 'creado' });
    return this.sinSecretos(punto);
  }

  async actualizarPunto(id: string, dto: GuardarPuntoMarcaDto, actor: Actor) {
    const punto = await this.puntos.findOneBy({ id });
    if (!punto) throw new NotFoundException('El punto de marca no existe.');
    Object.assign(punto, { nombre: dto.nombre.trim(), tipo: dto.tipo, latitud: dto.latitud ?? null, longitud: dto.longitud ?? null, radioMetros: dto.radioMetros, requiereQr: dto.requiereQr, activo: dto.activo ?? punto.activo });
    await this.puntos.save(punto);
    await this.bitacora.registrar({ accion: 'marca_punto_guardado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: punto.nombre, detalle: 'editado' });
    return this.sinSecretos(punto);
  }

  private sinSecretos(p: PuntoMarca) {
    const { secreto: _s, pantallaHuella: _h, ...resto } = p;
    return resto;
  }

  // Token de la tablet que muestra el QR. Se ve una sola vez; generar otro deja sin servicio a la tablet anterior.
  async nuevaPantalla(id: string, actor: Actor) {
    const punto = await this.puntos.findOneBy({ id });
    if (!punto) throw new NotFoundException('El punto de marca no existe.');
    const token = nuevoTokenPantalla();
    await this.puntos.update(id, { pantallaHuella: huella(token), pantallaUltimaVez: null });
    await this.bitacora.registrar({ accion: 'marca_pantalla_generada', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: punto.nombre });
    return { puntoId: id, token, nombre: punto.nombre };
  }

  // La tablet pide el QR vigente (con su token). Devuelve solo el código de ahora, nunca el secreto.
  async qrActual(puntoId: string, token: string) {
    const punto = await this.puntos.findOne({ where: { id: puntoId.match(/^[0-9a-f-]{36}$/i) ? puntoId : '00000000-0000-0000-0000-000000000000' }, select: { id: true, nombre: true, activo: true, secreto: true, pantallaHuella: true, requiereQr: true } });
    if (!punto || !punto.activo || !punto.pantallaHuella || punto.pantallaHuella !== huella(token)) throw new UnauthorizedException('Esta pantalla ya no está autorizada. Pida un enlace nuevo al administrador del sistema.');
    const ahora = Date.now();
    await this.puntos.update(punto.id, { pantallaUltimaVez: new Date(ahora) });
    return { nombre: punto.nombre, codigo: codigoQr(punto.secreto, punto.id, ventanaDe(ahora)), segundosRestantes: segundosRestantes(ahora) };
  }

  // ---- Marcar (celular del empleado) ----

  async marcar(dto: IdentificarDto, ip?: string) {
    const { empleado, datos } = await this.acceso.identificar(dto, ip);
    const d = (datos ?? {}) as { accion?: string; puntoId?: string; codigo?: string; latitud?: number; longitud?: number; precision?: number };
    if (d.accion !== 'marcar') throw new BadRequestException('Acción no válida.');
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const lat = num(d.latitud);
    const lon = num(d.longitud);
    const precision = num(d.precision);

    // 1. ¿En qué punto marca? Con QR, el del QR (y el código tiene que estar vigente); sin QR, una tienda cuya ubicación coincida.
    let punto: PuntoMarca | null = null;
    let conQr = false;
    if (d.codigo) {
      punto = await this.puntos.findOne({ where: { id: String(d.puntoId ?? '').match(/^[0-9a-f-]{36}$/i) ? String(d.puntoId) : '00000000-0000-0000-0000-000000000000' }, select: { id: true, nombre: true, activo: true, secreto: true, latitud: true, longitud: true, radioMetros: true, requiereQr: true, tipo: true } });
      if (!punto || !punto.activo || !codigoQrValido(punto.secreto, punto.id, String(d.codigo))) throw new BadRequestException('El código QR venció. Escanee de nuevo el QR de la pantalla.');
      conQr = true;
    } else {
      const sinQr = (await this.puntos.find({ where: { activo: true, requiereQr: false } })).filter((p) => evaluarUbicacion(p, { latitud: lat, longitud: lon, precision }).verificada);
      punto = sinQr[0] ?? null;
      if (!punto) throw new BadRequestException('Escanee el código QR de la pantalla de la empresa para marcar (o acérquese a su tienda y active la ubicación).');
    }

    // 2. Dos toques seguidos son uno solo.
    const ahora = new Date();
    const { fecha, hora } = fechaHoraCostaRica(ahora);
    const previa = await this.marcas.findOne({ where: { empleadoId: empleado.id }, order: { instante: 'DESC' } });
    if (previa && ahora.getTime() - previa.instante.getTime() < MINUTOS_ENTRE_MARCAS * 60_000) {
      throw new ConflictException(`Ya marcó hace un momento (${previa.hora}). Espere ${MINUTOS_ENTRE_MARCAS} minutos para volver a marcar.`);
    }

    // 3. Ubicación: no bloquea, solo decide si queda verificada o por revisar.
    const ubicacion = evaluarUbicacion(punto, { latitud: lat, longitud: lon, precision });

    // 4. Se suma a las marcas del día con las mismas reglas del reloj.
    const suma = await this.asistencia.sumarMarcaDelCelular(empleado, fecha, hora);
    const registro = await this.marcas.save(
      this.marcas.create({
        empleadoId: empleado.id,
        puntoId: punto.id,
        instante: ahora,
        fecha,
        hora,
        latitud: lat,
        longitud: lon,
        precisionM: precision === null ? null : Math.round(precision),
        distanciaM: ubicacion.distanciaM,
        conQr,
        verificada: ubicacion.verificada,
        motivo: (ubicacion.motivo ?? (suma.sumada ? null : suma.motivo ?? null))?.slice(0, 200) ?? null,
        enDia: suma.sumada,
        ip: ip?.slice(0, 64) ?? null,
      }),
    );
    return {
      ok: true,
      empleado: { nombre: empleado.nombre },
      hora,
      fecha,
      punto: punto.nombre,
      verificada: registro.verificada,
      aviso: ubicacion.motivo ?? (suma.sumada ? null : suma.motivo ?? null),
      marcasDelDia: suma.marcas,
    };
  }

  // ---- Consulta (supervisión) ----

  async listar(desde?: string, hasta?: string, soloPorRevisar = false) {
    const fin = hasta ?? hoyISO();
    const ini = desde ?? sumarDias(fin, -6);
    const filas = await this.marcas.find({ where: { fecha: Between(ini, fin), ...(soloPorRevisar ? { verificada: false } : {}) }, relations: { empleado: true, punto: true }, order: { instante: 'DESC' }, take: 1000 });
    return filas.map((m) => ({
      id: m.id,
      empleadoId: m.empleadoId,
      nombre: m.empleado.nombre,
      punto: m.punto?.nombre ?? null,
      fecha: m.fecha,
      hora: m.hora,
      conQr: m.conQr,
      verificada: m.verificada,
      distanciaM: m.distanciaM,
      precisionM: m.precisionM,
      motivo: m.motivo,
      enDia: m.enDia,
    }));
  }
}
