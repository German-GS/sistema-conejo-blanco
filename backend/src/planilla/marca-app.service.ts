import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Between, Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { hoyISO, sumarDias } from '../common/utils/fecha.util.js';
import { AccesoMarcaService } from './acceso-marca.service.js';
import { AsistenciaService } from './asistencia.service.js';
import { ParametrosService } from './parametros.service.js';
import type { GuardarPuntoMarcaDto, IdentificarDto } from './dto/acceso-marca.dto.js';
import { MarcaApp } from './marca-app.entity.js';
import {
  codigoQr,
  codigoQrValido,
  fechaHoraCostaRica,
  MINUTOS_ENTRE_MARCAS,
  nuevoSecreto,
  nuevoTokenPantalla,
  resumenDeDia,
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
    private readonly parametros: ParametrosService,
    private readonly bitacora: BitacoraService,
  ) {}

  // ---- Puntos de marca (administrador del sistema) ----

  listarPuntos() {
    return this.puntos.find({ order: { tipo: 'ASC', nombre: 'ASC' } });
  }

  async crearPunto(dto: GuardarPuntoMarcaDto, actor: Actor) {
    const punto = await this.puntos.save(
      this.puntos.create({ nombre: dto.nombre.trim(), tipo: dto.tipo, activo: dto.activo ?? true, secreto: nuevoSecreto() }),
    );
    await this.bitacora.registrar({ accion: 'marca_punto_guardado', usuarioId: actor.id, usuarioEmail: actor.email, objetivo: punto.nombre, detalle: 'creado' });
    return this.sinSecretos(punto);
  }

  async actualizarPunto(id: string, dto: GuardarPuntoMarcaDto, actor: Actor) {
    const punto = await this.puntos.findOneBy({ id });
    if (!punto) throw new NotFoundException('El punto de marca no existe.');
    Object.assign(punto, { nombre: dto.nombre.trim(), tipo: dto.tipo, activo: dto.activo ?? punto.activo });
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
    const punto = await this.puntos.findOne({ where: { id: puntoId.match(/^[0-9a-f-]{36}$/i) ? puntoId : '00000000-0000-0000-0000-000000000000' }, select: { id: true, nombre: true, activo: true, secreto: true, pantallaHuella: true } });
    if (!punto || !punto.activo || !punto.pantallaHuella || punto.pantallaHuella !== huella(token)) throw new UnauthorizedException('Esta pantalla ya no está autorizada. Pida un enlace nuevo al administrador del sistema.');
    const ahora = Date.now();
    await this.puntos.update(punto.id, { pantallaUltimaVez: new Date(ahora) });
    return { nombre: punto.nombre, codigo: codigoQr(punto.secreto, punto.id, ventanaDe(ahora)), segundosRestantes: segundosRestantes(ahora) };
  }

  // ---- Marcar (celular del empleado) ----

  async marcar(dto: IdentificarDto, ip?: string) {
    const { empleado, datos } = await this.acceso.identificar(dto, ip);
    const d = (datos ?? {}) as { accion?: string; puntoId?: string; codigo?: string; intento?: string };
    if (d.accion !== 'marcar') throw new BadRequestException('Acción no válida.');

    // Reintento de un toque que ya se guardó (la respuesta se perdió en el camino): se devuelve esa misma marca, sin pedir un QR nuevo.
    const intento = typeof d.intento === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(d.intento) ? d.intento : null;
    if (intento) {
      const previa = await this.marcas.findOne({ where: { empleadoId: empleado.id, intento }, relations: { punto: true } });
      if (previa) return this.respuestaDeMarca(empleado.nombre, previa, (await this.horasDe(empleado.id, previa.fecha)), true);
    }

    // 1. ¿En qué punto marca? En el del QR, y el código tiene que estar vigente: el QR solo se ve en el lugar, así que escanearlo prueba que está ahí.
    if (!d.codigo) throw new BadRequestException('Escanee el código QR de la pantalla de la empresa para marcar.');
    const punto = await this.puntos.findOne({ where: { id: String(d.puntoId ?? '').match(/^[0-9a-f-]{36}$/i) ? String(d.puntoId) : '00000000-0000-0000-0000-000000000000' }, select: { id: true, nombre: true, activo: true, secreto: true } });
    if (!punto || !punto.activo || !codigoQrValido(punto.secreto, punto.id, String(d.codigo))) throw new BadRequestException('El código QR venció. Escanee de nuevo el QR de la pantalla.');

    // 2. Dos toques seguidos son uno solo.
    const ahora = new Date();
    const { fecha, hora } = fechaHoraCostaRica(ahora);
    const previa = await this.marcas.findOne({ where: { empleadoId: empleado.id }, order: { instante: 'DESC' } });
    if (previa && ahora.getTime() - previa.instante.getTime() < MINUTOS_ENTRE_MARCAS * 60_000) {
      throw new ConflictException(`Ya marcó hace un momento (${previa.hora}). Espere ${MINUTOS_ENTRE_MARCAS} minutos para volver a marcar.`);
    }

    // 3. Se suma a las marcas del día con las mismas reglas del reloj.
    const suma = await this.asistencia.sumarMarcaDelCelular(empleado, fecha, hora);
    const registro = await this.marcas.save(
      this.marcas.create({
        empleadoId: empleado.id,
        puntoId: punto.id,
        instante: ahora,
        fecha,
        hora,
        motivo: (suma.sumada ? null : suma.motivo ?? null)?.slice(0, 200) ?? null,
        enDia: suma.sumada,
        ip: ip?.slice(0, 64) ?? null,
        intento,
      }),
    );
    registro.punto = punto as PuntoMarca;
    return this.respuestaDeMarca(empleado.nombre, registro, suma.marcas, false);
  }

  private respuestaDeMarca(nombre: string, m: MarcaApp, marcasDelDia: string[], repetida: boolean) {
    return { ok: true, empleado: { nombre }, hora: m.hora, fecha: m.fecha, punto: m.punto?.nombre ?? null, aviso: m.motivo, marcasDelDia, repetida };
  }

  // Las horas que la persona ha marcado con el celular en ese día, de la más temprana a la más tarde.
  private async horasDe(empleadoId: string, fecha: string): Promise<string[]> {
    const filas = await this.marcas.find({ where: { empleadoId, fecha }, order: { hora: 'ASC' } });
    return [...new Set(filas.map((f) => f.hora))];
  }

  // Historial del empleado en su celular (solo de lectura): por cada día, su entrada y su salida y, si está activado, si fueron a tiempo.
  // Pide el PIN como todo lo demás. Los días que muestra y la tolerancia salen de los parámetros de planilla.
  async historico(dto: IdentificarDto, ip?: string) {
    const { empleado, datos } = await this.acceso.identificar(dto, ip);
    if (((datos ?? {}) as { accion?: string }).accion !== 'historico') throw new BadRequestException('Acción no válida.');
    const p = await this.parametros.mapa();
    const dias = Math.min(60, Math.max(1, Math.round(p.MARCA_HISTORICO_DIAS ?? 14)));
    const toleranciaEntrada = p.TOLERANCIA_ENTRADA_MINUTOS ?? 10;
    const toleranciaSalida = p.TOLERANCIA_SALIDA_MINUTOS ?? 10;
    const puntualidad = (p.MARCA_HISTORICO_PUNTUALIDAD ?? 1) === 1;
    const { fecha: hoy, hora: ahora } = fechaHoraCostaRica(new Date());
    const desde = sumarDias(hoy, -(dias - 1));

    // Lo marcado con el celular cuenta aunque no se haya sumado al día (día ya decidido, personal de tienda, empleado de prueba).
    const delCelular = new Map<string, string[]>();
    for (const m of await this.marcas.find({ where: { empleadoId: empleado.id, fecha: Between(desde, hoy) }, order: { hora: 'ASC' } })) {
      delCelular.set(m.fecha, [...(delCelular.get(m.fecha) ?? []), m.hora]);
    }
    const filas = await this.asistencia.historialDeMarcas(empleado, desde, hoy, delCelular);
    return {
      empleado: { nombre: empleado.nombre },
      hoy,
      toleranciaEntrada,
      toleranciaSalida,
      puntualidad,
      dias: filas.map((d) => ({
        fecha: d.fecha,
        horario: d.tramo && d.tipoDia === 'ordinario' ? `${d.tramo.entrada} a ${d.tramo.salida}` : null,
        marcas: d.marcas,
        ...resumenDeDia(d.marcas, { tramo: d.tramo, tipoDia: d.tipoDia, esHoy: d.fecha === hoy, toleranciaEntrada, toleranciaSalida, puntualidad, ahora }),
      })),
    };
  }

  // ---- Consulta (supervisión) ----

  async listar(desde?: string, hasta?: string, soloNoSumadas = false) {
    const fin = hasta ?? hoyISO();
    const ini = desde ?? sumarDias(fin, -6);
    const filas = await this.marcas.find({ where: { fecha: Between(ini, fin), ...(soloNoSumadas ? { enDia: false } : {}) }, relations: { empleado: true, punto: true }, order: { instante: 'DESC' }, take: 1000 });
    return filas.map((m) => ({
      id: m.id,
      empleadoId: m.empleadoId,
      nombre: m.empleado.nombre,
      punto: m.punto?.nombre ?? null,
      fecha: m.fecha,
      hora: m.hora,
      motivo: m.motivo,
      enDia: m.enDia,
    }));
  }
}
