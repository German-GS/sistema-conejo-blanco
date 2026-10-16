import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionDescuento } from './configuracion-descuento.entity.js';
import { ConfiguracionFactura } from './configuracion-factura.entity.js';
import type { ActualizarConfiguracionFacturaDto } from './dto/actualizar-configuracion-factura.dto.js';
import type { ActualizarConfiguracionDescuentoDto } from './dto/actualizar-configuracion-descuento.dto.js';

const CONFIG_ID = 'general';
const DESCUENTO_MAXIMO_POR_DEFECTO = 10;

@Injectable()
export class ConfiguracionService {
  constructor(
    @InjectRepository(ConfiguracionDescuento)
    private readonly repo: Repository<ConfiguracionDescuento>,
    @InjectRepository(ConfiguracionFactura)
    private readonly facturaRepo: Repository<ConfiguracionFactura>,
  ) {}

  // Crea la fila con el valor por defecto la primera vez que se pide —
  // así no hace falta sembrarla a mano en cada entorno nuevo.
  async obtenerDescuento(): Promise<ConfiguracionDescuento> {
    const existente = await this.repo.findOneBy({ id: CONFIG_ID });
    if (existente) return existente;

    const nueva = this.repo.create({
      id: CONFIG_ID,
      descuentoMaximoVendedorPorcentaje: DESCUENTO_MAXIMO_POR_DEFECTO.toFixed(2),
    });
    return this.repo.save(nueva);
  }

  async actualizarDescuento(dto: ActualizarConfiguracionDescuentoDto): Promise<ConfiguracionDescuento> {
    const config = await this.obtenerDescuento();
    config.descuentoMaximoVendedorPorcentaje = dto.descuentoMaximoVendedorPorcentaje.toFixed(2);
    return this.repo.save(config);
  }

  // Encabezado y textos fijos de las facturas hechas a mano. Se crea con
  // los datos de la empresa conocidos la primera vez que se pide.
  async obtenerFactura(): Promise<ConfiguracionFactura> {
    const existente = await this.facturaRepo.findOneBy({ id: CONFIG_ID });
    if (existente) return existente;
    return this.facturaRepo.save(this.facturaRepo.create({ id: CONFIG_ID, logoUrl: null }));
  }

  async actualizarFactura(dto: ActualizarConfiguracionFacturaDto): Promise<ConfiguracionFactura> {
    const config = await this.obtenerFactura();
    Object.assign(config, dto);
    return this.facturaRepo.save(config);
  }

  async guardarLogo(url: string): Promise<ConfiguracionFactura> {
    const config = await this.obtenerFactura();
    config.logoUrl = url;
    return this.facturaRepo.save(config);
  }

  async quitarLogo(): Promise<ConfiguracionFactura> {
    const config = await this.obtenerFactura();
    config.logoUrl = null;
    return this.facturaRepo.save(config);
  }
}
