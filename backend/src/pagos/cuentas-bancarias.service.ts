import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CuentaBancaria } from './cuenta-bancaria.entity.js';
import { CuentaContable } from '../contabilidad/cuenta-contable.entity.js';
import { ContabilidadService, CUENTA } from '../contabilidad/contabilidad.service.js';
import type { ActualizarCuentaBancariaDto, CrearCuentaBancariaDto } from './dto/pagos.dto.js';

@Injectable()
export class CuentasBancariasService {
  constructor(
    @InjectRepository(CuentaBancaria)
    private readonly repo: Repository<CuentaBancaria>,
    private readonly contabilidad: ContabilidadService,
    private readonly dataSource: DataSource,
  ) {}

  // La caja general (efectivo) existe siempre: es la cuenta 1100 que ya
  // usan las ventas de contado. Se crea la primera vez que se necesita.
  private async asegurarCaja(): Promise<void> {
    if (await this.repo.exists({ where: { esCaja: true } })) return;
    const cuenta = await this.dataSource.getRepository(CuentaContable).findOneByOrFail({ codigo: CUENTA.CAJA });
    await this.repo.save(
      this.repo.create({
        nombre: 'Caja general (efectivo)',
        numeroCuenta: '',
        esCaja: true,
        mostrarEnFactura: false,
        cuentaContableId: cuenta.id,
      }),
    );
  }

  async listar(soloActivas = false): Promise<CuentaBancaria[]> {
    await this.asegurarCaja();
    return this.repo.find({
      where: soloActivas ? { activa: true } : {},
      relations: { cuentaContable: true },
      order: { esCaja: 'DESC', nombre: 'ASC' },
    });
  }

  async buscarActivaOFallar(id: string): Promise<CuentaBancaria> {
    const cuenta = await this.repo.findOne({ where: { id }, relations: { cuentaContable: true } });
    if (!cuenta) throw new NotFoundException('La cuenta bancaria no existe.');
    if (!cuenta.activa) throw new BadRequestException('Esa cuenta bancaria está desactivada.');
    return cuenta;
  }

  async crear(dto: CrearCuentaBancariaDto): Promise<CuentaBancaria> {
    const numero = dto.numeroCuenta.trim();
    if (await this.repo.exists({ where: { numeroCuenta: numero } })) {
      throw new BadRequestException('Ya hay una cuenta con ese número.');
    }
    return this.dataSource.transaction(async (manager) => {
      const contable = await this.contabilidad.crearCuentaActivoEnTransaccion(manager, `Banco — ${dto.nombre.trim()}`);
      return manager.save(
        CuentaBancaria,
        manager.create(CuentaBancaria, {
          nombre: dto.nombre.trim(),
          numeroCuenta: numero,
          titular: dto.titular?.trim() ?? '',
          mostrarEnFactura: dto.mostrarEnFactura ?? true,
          cuentaContableId: contable.id,
        }),
      );
    });
  }

  async actualizar(id: string, dto: ActualizarCuentaBancariaDto): Promise<CuentaBancaria> {
    const cuenta = await this.repo.findOne({ where: { id } });
    if (!cuenta) throw new NotFoundException('La cuenta bancaria no existe.');
    if (cuenta.esCaja) throw new BadRequestException('La caja general no se edita.');
    if (dto.numeroCuenta && dto.numeroCuenta.trim() !== cuenta.numeroCuenta) {
      if (await this.repo.exists({ where: { numeroCuenta: dto.numeroCuenta.trim() } })) {
        throw new BadRequestException('Ya hay una cuenta con ese número.');
      }
    }
    return this.dataSource.transaction(async (manager) => {
      if (dto.nombre !== undefined) cuenta.nombre = dto.nombre.trim();
      if (dto.numeroCuenta !== undefined) cuenta.numeroCuenta = dto.numeroCuenta.trim();
      if (dto.titular !== undefined) cuenta.titular = dto.titular.trim();
      if (dto.mostrarEnFactura !== undefined) cuenta.mostrarEnFactura = dto.mostrarEnFactura;
      if (dto.activa !== undefined) cuenta.activa = dto.activa;
      await this.contabilidad.renombrarCuentaEnTransaccion(manager, cuenta.cuentaContableId, `Banco — ${cuenta.nombre}`);
      return manager.save(CuentaBancaria, cuenta);
    });
  }

  // Líneas "BANCO … número" que salen impresas en las facturas.
  async textoParaFactura(): Promise<string> {
    const cuentas = await this.repo.find({ where: { activa: true, esCaja: false, mostrarEnFactura: true }, order: { nombre: 'ASC' } });
    return cuentas.map((c) => `${c.nombre.toUpperCase()} ${c.numeroCuenta}${c.titular ? ` — ${c.titular}` : ''}`).join('\n');
  }
}
