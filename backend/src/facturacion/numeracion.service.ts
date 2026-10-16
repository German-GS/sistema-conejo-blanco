import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { FacturaContador } from './factura-contador.entity.js';

export interface DatosConsecutivo {
  sucursal: string; // 3 dígitos
  terminal: string; // 5 dígitos
  tipo: string; // 2 dígitos
  secuencial: number | string; // 10 dígitos
}

export interface DatosClave {
  cedulaEmisor: string; // se rellena a 12 dígitos
  consecutivo: string; // 20 dígitos
  fecha?: Date;
  situacion?: '1' | '2' | '3'; // 1 normal, 2 contingencia, 3 sin internet
}

// Genera la clave numérica (50) y el consecutivo (20) oficiales de
// Hacienda Costa Rica — mismo patrón que NumeracionService de
// facturación en Conejo Motors. Es puro/determinista salvo por el
// código de seguridad (aleatorio, no criptográfico: Hacienda solo exige
// que sea un número de 8 dígitos que ayude a evitar colisiones, no que
// esté firmado). La FIRMA digital real del comprobante es un paso
// aparte que sí necesita la llave .p12 — ver HaciendaClient.
//
// Consecutivo (20) = sucursal(3) + terminal(5) + tipo(2) + secuencial(10)
// Clave (50)       = 506 + DDMMAA + cédula(12) + consecutivo(20) + situación(1) + seguridad(8)
@Injectable()
export class NumeracionService {
  constructor(
    @InjectRepository(FacturaContador)
    private readonly contadoresRepo: Repository<FacturaContador>,
    private readonly dataSource: DataSource,
  ) {}

  private soloDigitos(s: string): string {
    return String(s ?? '').replace(/\D/g, '');
  }

  private padLeft(s: string | number, len: number): string {
    const limpio = this.soloDigitos(String(s));
    if (limpio.length > len) return limpio.slice(-len);
    return limpio.padStart(len, '0');
  }

  armarConsecutivo(datos: DatosConsecutivo): string {
    return (
      this.padLeft(datos.sucursal, 3) +
      this.padLeft(datos.terminal, 5) +
      this.padLeft(datos.tipo, 2) +
      this.padLeft(datos.secuencial, 10)
    );
  }

  generarCodigoSeguridad(): string {
    return this.padLeft(randomInt(0, 100_000_000), 8);
  }

  armarClave(datos: DatosClave): { clave: string; codigoSeguridad: string; situacion: string } {
    const fecha = datos.fecha ?? new Date();
    const ddmmaa =
      String(fecha.getDate()).padStart(2, '0') +
      String(fecha.getMonth() + 1).padStart(2, '0') +
      String(fecha.getFullYear()).slice(-2);

    const cedula = this.padLeft(datos.cedulaEmisor, 12);
    const consecutivo = this.padLeft(datos.consecutivo, 20);
    const situacion = datos.situacion ?? '1';
    const codigoSeguridad = this.generarCodigoSeguridad();

    const clave = `506${ddmmaa}${cedula}${consecutivo}${situacion}${codigoSeguridad}`;
    if (clave.length !== 50) {
      throw new Error(`Clave numérica inválida: longitud ${clave.length} (esperado 50).`);
    }
    return { clave, codigoSeguridad, situacion };
  }

  // Reserva atómicamente el siguiente secuencial para (sucursal, terminal,
  // tipo) con UPDATE ... RETURNING, para que dos facturas emitidas al
  // mismo tiempo nunca reciban el mismo número. Abre su propia
  // transacción — para llamadas independientes. FacturacionService usa
  // siguienteSecuencialEnTransaccion para que la reserva del número quede
  // atómica junto con el descuento de inventario: si el stock no alcanza,
  // no se "quema" un consecutivo sin factura real detrás.
  siguienteSecuencial(sucursal: string, terminal: string, tipo: string): Promise<number> {
    return this.dataSource.transaction((manager) =>
      this.siguienteSecuencialEnTransaccion(manager, sucursal, terminal, tipo),
    );
  }

  async siguienteSecuencialEnTransaccion(
    manager: EntityManager,
    sucursal: string,
    terminal: string,
    tipo: string,
  ): Promise<number> {
    const suc = this.padLeft(sucursal, 3);
    const term = this.padLeft(terminal, 5);
    const tip = this.padLeft(tipo, 2);

    await manager
      .createQueryBuilder()
      .insert()
      .into(FacturaContador)
      .values({ sucursal: suc, terminal: term, tipo: tip, ultimo: '0' })
      .orIgnore()
      .execute();

    const res = await manager
      .createQueryBuilder()
      .update(FacturaContador)
      .set({ ultimo: () => 'ultimo + 1' })
      .where('sucursal = :suc AND terminal = :term AND tipo = :tip', { suc, term, tip })
      .returning('ultimo')
      .execute();

    const nuevo = Number(res.raw?.[0]?.ultimo ?? res.raw?.[0]?.ULTIMO);
    if (!Number.isFinite(nuevo) || nuevo <= 0) {
      throw new Error('No se pudo reservar el secuencial de la factura.');
    }
    return nuevo;
  }
}
