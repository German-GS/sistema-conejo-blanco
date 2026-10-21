import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { Bitacora } from './bitacora.entity.js';

export type AccionBitacora =
  | 'login_ok'
  | 'login_fallido'
  | 'login_bloqueado'
  | 'cuenta_bloqueada'
  | 'clave_cambiada'
  | 'usuario_creado'
  | 'usuario_editado'
  | 'rol_cambiado'
  | 'usuario_activado'
  | 'usuario_desactivado'
  | 'clave_restablecida'
  | 'usuario_desbloqueado'
  | 'sesiones_cerradas'
  | 'permisos_cambiados'
  | 'dos_pasos_activado'
  | 'dos_pasos_desactivado'
  | 'dos_pasos_reiniciado'
  | 'dos_pasos_fallido'
  | 'ip_no_permitida'
  | 'analisis_enlace_generado'
  | 'analisis_enlace_revocado'
  | 'asiento_eliminado';

export interface EntradaBitacora {
  accion: AccionBitacora;
  usuarioId?: string | null;
  usuarioEmail?: string;
  objetivo?: string;
  detalle?: string;
  ip?: string | null;
}

@Injectable()
export class BitacoraService {
  private readonly logger = new Logger(BitacoraService.name);

  constructor(
    @InjectRepository(Bitacora)
    private readonly repo: Repository<Bitacora>,
  ) {}

  // Nunca interrumpe la operación que la llama: si no se puede registrar, queda en el log del servidor.
  async registrar(e: EntradaBitacora): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          accion: e.accion,
          usuarioId: e.usuarioId ?? null,
          usuarioEmail: (e.usuarioEmail ?? '').slice(0, 160),
          objetivo: (e.objetivo ?? '').slice(0, 160),
          detalle: (e.detalle ?? '').slice(0, 500),
          ip: e.ip ? e.ip.slice(0, 64) : null,
        }),
      );
    } catch (err) {
      this.logger.error(`No se pudo registrar en la bitácora (${e.accion}): ${err instanceof Error ? err.message : err}`);
    }
  }

  listar(filtros: { limite?: number; accion?: string; texto?: string }): Promise<Bitacora[]> {
    const qb = this.repo.createQueryBuilder('b').orderBy('b.creado_en', 'DESC').take(Math.min(Math.max(filtros.limite ?? 200, 1), 1000));
    if (filtros.accion) qb.andWhere('b.accion = :accion', { accion: filtros.accion });
    if (filtros.texto?.trim()) {
      qb.andWhere('(LOWER(b.usuario_email) LIKE :t OR LOWER(b.objetivo) LIKE :t OR LOWER(b.detalle) LIKE :t)', {
        t: `%${filtros.texto.trim().toLowerCase().replace(/[%_]/g, '')}%`,
      });
    }
    return qb.getMany();
  }

  // Excel con todo el historial de accesos (filtrable) para auditoría.
  async exportar(filtros: { accion?: string; texto?: string }): Promise<Buffer> {
    const filas = await this.listar({ ...filtros, limite: 1000 });
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Conejo Blanco';
    const hoja = libro.addWorksheet('Bitácora de accesos');
    hoja.addRow(['BITÁCORA DE ACCESOS']).font = { bold: true, size: 13 };
    hoja.addRow([]);
    hoja.addRow(['Fecha y hora', 'Acción', 'Usuario', 'Sobre', 'Detalle', 'IP']).font = { bold: true };
    for (const f of filas) hoja.addRow([f.creadoEn.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }), f.accion, f.usuarioEmail, f.objetivo, f.detalle, f.ip ?? '']);
    [22, 24, 32, 32, 60, 18].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
    hoja.views = [{ state: 'frozen', ySplit: 3 }];
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
