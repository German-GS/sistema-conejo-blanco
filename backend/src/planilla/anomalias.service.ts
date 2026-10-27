import { join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type EntityManager, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { AnomaliaEmpleado, ETIQUETAS_ANOMALIA, type EstadoAnomalia, type TipoAnomalia } from './anomalia-empleado.entity.js';
import { Empleado } from './empleado.entity.js';
import { detectarAnomaliasAlmuerzo } from './anomalias.js';
import type { Parametros } from './calculo.js';

const FUENTE = join(process.cwd(), 'assets', 'fonts', 'DejaVuSansCondensed.ttf');
const FUENTE_NEGRITA = join(process.cwd(), 'assets', 'fonts', 'DejaVuSansCondensed-Bold.ttf');
const TIPOS = Object.keys(ETIQUETAS_ANOMALIA) as TipoAnomalia[];

const fechaCorta = (iso: string): string => iso.split('-').reverse().join('/');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso: string): string => {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

export interface FiltrosAnomalias {
  empleadoId?: string;
  estado?: EstadoAnomalia;
}

@Injectable()
export class AnomaliasService {
  constructor(
    @InjectRepository(AnomaliaEmpleado) private readonly repo: Repository<AnomaliaEmpleado>,
    @InjectRepository(Empleado) private readonly empleadoRepo: Repository<Empleado>,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Deja registradas (o quita, si ya no aplican) las anomalías de almuerzo de un día, según sus marcas. Solo toca las automáticas
  // que siguen pendientes: lo que una persona ya decidió (carta emitida, descartada) se respeta.
  async sincronizarAlmuerzo(empleado: Empleado, fecha: string, marcas: string[], p: Parametros, dentroDe?: EntityManager): Promise<void> {
    const repo = dentroDe ? dentroDe.getRepository(AnomaliaEmpleado) : this.repo;
    const esperado = empleado.almuerzoMarca === false ? 0 : (empleado.almuerzoMinutos ?? p.ALMUERZO_MINUTOS);
    const detectadas = detectarAnomaliasAlmuerzo(marcas, p, esperado);
    const existentes = await repo.find({ where: { empleadoId: empleado.id, fecha, origen: 'automatica', tipo: In(['almuerzo_corto', 'almuerzo_largo'] as TipoAnomalia[]) } });
    for (const e of existentes) {
      const sigue = detectadas.find((d) => d.tipo === e.tipo);
      if (!sigue && e.estado === 'pendiente') await repo.delete({ id: e.id });
      else if (sigue && e.estado === 'pendiente') await repo.update({ id: e.id }, { detalle: sigue.detalle, minutos: sigue.minutos });
    }
    for (const d of detectadas) {
      if (!existentes.some((e) => e.tipo === d.tipo)) {
        await repo.save(repo.create({ empleadoId: empleado.id, fecha, tipo: d.tipo, detalle: d.detalle, minutos: d.minutos, origen: 'automatica', estado: 'pendiente' }));
      }
    }
  }

  listar(f: FiltrosAnomalias): Promise<AnomaliaEmpleado[]> {
    return this.repo.find({
      where: { ...(f.empleadoId ? { empleadoId: f.empleadoId } : {}), ...(f.estado ? { estado: f.estado } : {}) },
      relations: { empleado: true },
      order: { fecha: 'DESC', creadoEn: 'DESC' },
      take: 1000,
    });
  }

  async crear(dto: { empleadoId: string; fecha: string; tipo: TipoAnomalia; detalle: string; minutos?: number }, usuarioId: string): Promise<AnomaliaEmpleado> {
    if (!(await this.empleadoRepo.existsBy({ id: dto.empleadoId }))) throw new NotFoundException('El empleado no existe.');
    if (!TIPOS.includes(dto.tipo)) throw new BadRequestException('El tipo de anomalía no es válido.');
    return this.repo.save(
      this.repo.create({ empleadoId: dto.empleadoId, fecha: dto.fecha, tipo: dto.tipo, detalle: dto.detalle.trim(), minutos: dto.minutos ?? null, origen: 'manual', estado: 'pendiente', usuarioId }),
    );
  }

  async cambiarEstado(id: string, estado: EstadoAnomalia, nota: string | undefined, usuarioId: string): Promise<AnomaliaEmpleado> {
    const a = await this.repo.findOneBy({ id });
    if (!a) throw new NotFoundException('La anomalía no existe.');
    if (estado === 'descartada' && !(nota ?? '').trim()) throw new BadRequestException('Anote por qué se descarta.');
    a.estado = estado;
    a.nota = estado === 'pendiente' ? null : (nota?.trim() || a.nota);
    a.usuarioId = usuarioId;
    return this.repo.save(a);
  }

  // Cuántas anomalías pendientes tiene cada empleado (para el aviso en la lista de empleados).
  async pendientesPorEmpleado(): Promise<Record<string, number>> {
    const filas = await this.repo.createQueryBuilder('a').select('a.empleado_id', 'id').addSelect('COUNT(*)::int', 'n').where("a.estado = 'pendiente'").groupBy('a.empleado_id').getRawMany<{ id: string; n: number }>();
    return Object.fromEntries(filas.map((f) => [f.id, Number(f.n)]));
  }

  // Borrador de carta de amonestación con los hechos elegidos. Es un borrador: debe revisarlo el asesor legal antes de entregarlo.
  async generarCarta(empleadoId: string, ids: string[], marcarEmitida: boolean, usuarioId: string): Promise<{ nombre: string; buffer: Buffer }> {
    const empleado = await this.empleadoRepo.findOneBy({ id: empleadoId });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    const hechos = (await this.repo.find({ where: { empleadoId, id: In(ids) }, order: { fecha: 'ASC' } })).filter((a) => a.estado !== 'descartada');
    if (hechos.length === 0) throw new BadRequestException('Elija al menos una anomalía para la carta.');
    const empresa = await this.configuracion.obtenerFactura();
    const hoy = new Date();
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const doc = new PDFDocument({ size: 'LETTER', margin: 64, info: { Title: 'Carta de amonestación', Author: empresa.razonSocial || 'Conejo Blanco' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    const terminado = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    doc.font(FUENTE_NEGRITA).fontSize(13).text(empresa.razonSocial || 'Conejo Dorado SRL');
    doc.font(FUENTE).fontSize(9).fillColor('#555').text([empresa.cedulaJuridica && `Cédula jurídica ${empresa.cedulaJuridica}`, empresa.telefono, empresa.correo].filter(Boolean).join('  ·  '));
    doc.moveDown(0.3).fontSize(8).fillColor('#B45309').text('BORRADOR — revisar con el asesor legal antes de entregar.');
    doc.moveDown(1.5).fillColor('#000').font(FUENTE).fontSize(10.5).text(fechaLarga(hoyIso), { align: 'right' });
    doc.moveDown(1).font(FUENTE_NEGRITA).fontSize(14).text('CARTA DE AMONESTACIÓN', { align: 'center' });
    doc.moveDown(1.2).font(FUENTE).fontSize(10.5);
    doc.text('Señor(a):');
    doc.font(FUENTE_NEGRITA).text(empleado.nombre);
    doc.font(FUENTE).text(`Cédula: ${empleado.cedula ?? '—'}${empleado.puesto ? `  ·  Puesto: ${empleado.puesto}` : ''}`);
    doc.moveDown(1);
    doc.text('Estimado(a) colaborador(a):', { align: 'left' });
    doc.moveDown(0.6);
    doc.text('Por este medio se le hace de su conocimiento que, según los registros de asistencia de la empresa, se constataron los siguientes hechos:', { align: 'justify' });
    doc.moveDown(0.6);
    for (const h of hechos) {
      doc.font(FUENTE_NEGRITA).text(`${fechaCorta(h.fecha)} — ${ETIQUETAS_ANOMALIA[h.tipo]}`, { continued: false });
      doc.font(FUENTE).text(h.detalle, { indent: 14, align: 'justify' });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);
    doc.text(
      'Se le recuerda que debe cumplir el horario de trabajo y el tiempo de almuerzo establecidos, conforme a su contrato y al Reglamento Interno de Trabajo. Se le exhorta a corregir esta conducta; de reiterarse, la empresa podrá aplicar las medidas disciplinarias que contemplan el Reglamento Interno de Trabajo y el Código de Trabajo.',
      { align: 'justify' },
    );
    doc.moveDown(0.6).text('Sin otro particular, se despide atentamente,');
    doc.moveDown(3);
    const y = doc.y;
    doc.moveTo(64, y).lineTo(260, y).moveTo(330, y).lineTo(548, y).strokeColor('#777').lineWidth(0.7).stroke();
    doc.fontSize(9).fillColor('#444').text('Representante del patrono', 64, y + 4, { width: 196 });
    doc.text('Recibí conforme (nombre, cédula y firma)', 330, y + 4, { width: 218 });
    doc.moveDown(2).text('Fecha de recibido: ____ / ____ / ________        ☐ Se negó a firmar. Testigo: ____________________________', 64);
    doc.end();
    await terminado;

    if (marcarEmitida) {
      for (const h of hechos) {
        if (h.estado === 'pendiente') {
          h.estado = 'carta_emitida';
          h.nota = `Carta generada el ${fechaCorta(hoyIso)}`;
          h.usuarioId = usuarioId;
        }
      }
      await this.repo.save(hechos);
    }
    const nombre = `carta-amonestacion-${empleado.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${hoyIso}.pdf`;
    return { nombre, buffer: Buffer.concat(trozos) };
  }
}
