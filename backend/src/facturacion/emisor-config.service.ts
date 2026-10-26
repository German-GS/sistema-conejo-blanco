import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmisorConfig } from './emisor-config.entity.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

const ID = 'general';
const CAMPOS_TEXTO = [
  'razonSocial', 'nombreComercial', 'tipoIdentificacion', 'actividadEconomica', 'proveedorSistemas', 'provincia', 'canton',
  'distrito', 'otrasSenas', 'telefono', 'correo', 'cabysPredeterminado',
] as const;

export type CamposEmisor = Partial<Pick<EmisorConfig, (typeof CAMPOS_TEXTO)[number] | 'cedula' | 'emisionDesde'>>;

const digitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

@Injectable()
export class EmisorConfigService {
  constructor(
    @InjectRepository(EmisorConfig) private readonly repo: Repository<EmisorConfig>,
    private readonly config: ConfigService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async obtener(): Promise<EmisorConfig> {
    const existente = await this.repo.findOneBy({ id: ID });
    if (existente) return existente;
    // Primera vez: se parte de lo que ya está configurado para las facturas.
    const f = await this.configuracion.obtenerFactura();
    const actividad = /\d{6}/.exec(f.actividadEconomica ?? '')?.[0] ?? '';
    return this.repo.save(
      this.repo.create({
        id: ID,
        razonSocial: f.razonSocial ?? '',
        nombreComercial: '',
        cedula: digitos(f.cedulaJuridica || this.config.get('EMISOR_CEDULA')),
        tipoIdentificacion: '02',
        actividadEconomica: actividad,
        otrasSenas: (f.direccion ?? '').slice(0, 250),
        telefono: f.telefono ?? '',
        correo: f.correo ?? '',
      }),
    );
  }

  async actualizar(cambios: CamposEmisor): Promise<EmisorConfig> {
    const fila = await this.obtener();
    for (const campo of CAMPOS_TEXTO) {
      if (cambios[campo] !== undefined && cambios[campo] !== null) fila[campo] = String(cambios[campo]).trim();
    }
    if (cambios.cedula !== undefined) fila.cedula = digitos(cambios.cedula);
    fila.actividadEconomica = digitos(fila.actividadEconomica);
    fila.proveedorSistemas = digitos(fila.proveedorSistemas);
    fila.cabysPredeterminado = digitos(fila.cabysPredeterminado);
    if (cambios.emisionDesde !== undefined) fila.emisionDesde = cambios.emisionDesde || null;
    return this.repo.save(fila);
  }

  // Lo que falta para poder armar un comprobante, en palabras para administración.
  faltantes(e: EmisorConfig): string[] {
    const f: string[] = [];
    if (!e.razonSocial.trim()) f.push('Razón social del emisor');
    if (e.cedula.length < 9) f.push('Cédula jurídica del emisor');
    if (!/^\d{6}$/.test(e.actividadEconomica)) f.push('Código de actividad económica (6 dígitos)');
    if (e.proveedorSistemas.length < 9) f.push('Cédula del proveedor de sistemas');
    if (!e.otrasSenas.trim()) f.push('Dirección del emisor');
    if (!e.correo.trim()) f.push('Correo del emisor');
    if (!/^\d{13}$/.test(e.cabysPredeterminado)) f.push('CABYS predeterminado (13 dígitos) para productos sin uno propio');
    return f;
  }
}
