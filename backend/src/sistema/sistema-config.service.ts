import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionSistema } from './configuracion-sistema.entity.js';

export const MODULOS = ['planilla', 'contabilidad', 'facturacion', 'pagos', 'inventario'] as const;
export type ModuloSistema = (typeof MODULOS)[number];

export const ETIQUETA_MODULO: Record<ModuloSistema, string> = {
  planilla: 'Planilla y empleados',
  contabilidad: 'Contabilidad (diario, mayor, reportes, cierres)',
  facturacion: 'Facturación y notas de crédito',
  pagos: 'Pagos recibidos y cuentas bancarias',
  inventario: 'Bodega, traspasos e inventario',
};

// Valores por defecto de cada ajuste (se usan hasta que el sistema los cambie).
const DEFECTOS: Record<string, unknown> = {
  'seguridad.clave_largo_minimo': 10,
  'seguridad.intentos_maximos': 5,
  'seguridad.bloqueo_minutos': 15,
  'seguridad.sesion_horas': 8,
  // Cuántas horas sirve la clave temporal de una cuenta nueva o restablecida.
  'seguridad.clave_temporal_horas': 72,
  'seguridad.inactividad_minutos': 10,
  // Perfiles a los que se les exige verificación en dos pasos al entrar.
  'seguridad.dos_pasos_roles': [],
  // Lista (separada por comas) de IP desde las que puede entrar la cuenta del sistema; vacío = cualquiera.
  'seguridad.sistema_ips': '',
  'mantenimiento.activo': false,
  'mantenimiento.mensaje': 'El sistema está en mantenimiento. Volvé a intentar en unos minutos.',
  ...Object.fromEntries(MODULOS.map((m) => [`modulo.${m}`, true])),
  // Resultado de la última verificación automática de cálculos.
  'integridad.ultima': null,
};

const LIMITES: Record<string, [number, number]> = {
  'seguridad.clave_largo_minimo': [8, 64],
  'seguridad.intentos_maximos': [3, 20],
  'seguridad.bloqueo_minutos': [1, 1440],
  'seguridad.sesion_horas': [1, 72],
  'seguridad.clave_temporal_horas': [1, 720],
  'seguridad.inactividad_minutos': [2, 240],
};

@Injectable()
export class SistemaConfigService {
  private cache = new Map<string, unknown>();
  private cargadoEn = 0;

  constructor(
    @InjectRepository(ConfiguracionSistema)
    private readonly repo: Repository<ConfiguracionSistema>,
  ) {}

  private async refrescar(): Promise<void> {
    if (Date.now() - this.cargadoEn < 10_000) return;
    const filas = await this.repo.find();
    this.cache = new Map(filas.map((f) => [f.clave, f.valor]));
    this.cargadoEn = Date.now();
  }

  async get<T = unknown>(clave: string): Promise<T> {
    await this.refrescar();
    return (this.cache.has(clave) ? this.cache.get(clave) : DEFECTOS[clave]) as T;
  }

  async todos(): Promise<Record<string, unknown>> {
    await this.refrescar();
    return Object.fromEntries(Object.keys(DEFECTOS).map((k) => [k, this.cache.has(k) ? this.cache.get(k) : DEFECTOS[k]]));
  }

  async set(clave: string, valor: unknown): Promise<void> {
    if (!(clave in DEFECTOS) || clave === 'integridad.ultima') throw new BadRequestException('Ese ajuste no existe.');
    const rango = LIMITES[clave];
    if (rango) {
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < rango[0] || valor > rango[1]) {
        throw new BadRequestException(`El valor debe ser un entero entre ${rango[0]} y ${rango[1]}.`);
      }
    }
    if (clave.startsWith('modulo.') || clave === 'mantenimiento.activo') {
      if (typeof valor !== 'boolean') throw new BadRequestException('El valor debe ser verdadero o falso.');
    }
    if (clave === 'mantenimiento.mensaje' && (typeof valor !== 'string' || valor.length > 300)) {
      throw new BadRequestException('El mensaje debe ser texto de hasta 300 caracteres.');
    }
    if (clave === 'seguridad.sistema_ips') {
      if (typeof valor !== 'string' || valor.length > 300 || !/^[0-9a-fA-F:., ]*$/.test(valor)) throw new BadRequestException('Indicá direcciones IP separadas por comas.');
    }
    if (clave === 'seguridad.dos_pasos_roles') {
      const validos = ['sistema', 'gerente_general', 'administracion', 'contador', 'asistente', 'vendedor'];
      if (!Array.isArray(valor) || valor.some((r) => !validos.includes(r))) throw new BadRequestException('Perfiles no válidos.');
    }
    await this.guardar(clave, valor);
  }

  // Uso interno (sin validar contra las reglas de arriba): resultado de la verificación nocturna.
  async guardar(clave: string, valor: unknown): Promise<void> {
    await this.repo.save(this.repo.create({ clave, valor }));
    this.cache.set(clave, valor);
  }

  async moduloActivo(m: string): Promise<boolean> {
    return (await this.get<boolean>(`modulo.${m}`)) !== false;
  }

  async enMantenimiento(): Promise<{ activo: boolean; mensaje: string }> {
    return { activo: (await this.get<boolean>('mantenimiento.activo')) === true, mensaje: await this.get<string>('mantenimiento.mensaje') };
  }
}
