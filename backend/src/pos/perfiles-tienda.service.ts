import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosTiendaPerfil } from './pos-tienda-perfil.entity.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { TipoUbicacion } from '../common/enums/tipo-ubicacion.enum.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { ActualizarPerfilTiendaDto } from './dto/pos.dto.js';
import { ActividadTiendaService } from '../actividad-tienda/actividad-tienda.service.js';

export const LEYENDA_SIMPLIFICADO = 'Documento emitido bajo el régimen simplificado. No es factura electrónica.';
const ETIQUETAS = { razonSocial: 'razón social', nombreComercial: 'nombre comercial', cedulaJuridica: 'cédula jurídica', telefono: 'teléfono', correo: 'correo', direccion: 'dirección', pieTiquete: 'pie del tiquete', leyenda: 'leyenda' } as const;
const CAMPOS = ['razonSocial', 'nombreComercial', 'cedulaJuridica', 'telefono', 'correo', 'direccion', 'pieTiquete', 'leyenda'] as const;

@Injectable()
export class PerfilesTiendaService {
  constructor(
    @InjectRepository(PosTiendaPerfil) private readonly repo: Repository<PosTiendaPerfil>,
    @InjectRepository(Ubicacion) private readonly ubicaciones: Repository<Ubicacion>,
    private readonly configuracion: ConfiguracionService,
    private readonly actividad: ActividadTiendaService,
  ) {}

  // Todas las tiendas con lo que tienen configurado (vacío si aún no se llenó) y los datos generales de la empresa como referencia.
  async listar() {
    const [tiendas, perfiles, empresa] = await Promise.all([
      this.ubicaciones.find({ where: { tipo: TipoUbicacion.TIENDA, activa: true }, order: { codigo: 'ASC' } }),
      this.repo.find(),
      this.configuracion.obtenerFactura(),
    ]);
    const porId = new Map(perfiles.map((p) => [p.ubicacionId, p]));
    return {
      empresa: { razonSocial: empresa.razonSocial, cedulaJuridica: empresa.cedulaJuridica, telefono: empresa.telefono, correo: empresa.correo, direccion: empresa.direccion },
      tiendas: tiendas.map((t) => {
        const p = porId.get(t.id);
        return { ubicacionId: t.id, nombre: t.nombre, codigo: t.codigo, ...Object.fromEntries(CAMPOS.map((c) => [c, p?.[c] ?? ''])) };
      }),
    };
  }

  async actualizar(ubicacionId: string, dto: ActualizarPerfilTiendaDto, usuarioId?: string) {
    const tienda = await this.ubicaciones.findOneBy({ id: ubicacionId });
    if (!tienda || tienda.tipo !== TipoUbicacion.TIENDA) throw new BadRequestException('Esa ubicación no es una tienda.');
    const perfil = (await this.repo.findOneBy({ ubicacionId })) ?? this.repo.create({ ubicacionId });
    const cambios: string[] = [];
    for (const c of CAMPOS) {
      if (dto[c] === undefined) continue;
      const nuevo = dto[c].trim();
      if ((perfil[c] ?? '') !== nuevo) cambios.push(`${ETIQUETAS[c]}: «${perfil[c] ?? ''}» → «${nuevo}»`);
      perfil[c] = nuevo;
    }
    await this.repo.save(perfil);
    if (cambios.length) await this.actividad.registrarPanel({ ubicacionId, usuarioId, tipo: 'datos_tienda', detalle: `Datos del tiquete de ${tienda.nombre}: ${cambios.join('; ')}` });
    return (await this.listar()).tiendas.find((t) => t.ubicacionId === ubicacionId);
  }

  // Lo que sale impreso en el tiquete de esa tienda: sus datos y, donde estén vacíos, los de la empresa.
  async encabezado(ubicacionId: string, piePorDefecto: string) {
    const [p, empresa] = await Promise.all([this.repo.findOneBy({ ubicacionId }), this.configuracion.obtenerFactura()]);
    const o = (propio: string | undefined, general: string): string => (propio?.trim() ? propio.trim() : general);
    return {
      razonSocial: o(p?.razonSocial, empresa.razonSocial),
      nombreComercial: p?.nombreComercial?.trim() ?? '',
      cedulaJuridica: o(p?.cedulaJuridica, empresa.cedulaJuridica),
      telefono: o(p?.telefono, empresa.telefono),
      correo: o(p?.correo, empresa.correo),
      direccion: o(p?.direccion, empresa.direccion),
      pie: o(p?.pieTiquete, piePorDefecto),
      leyenda: o(p?.leyenda, LEYENDA_SIMPLIFICADO),
    };
  }
}
