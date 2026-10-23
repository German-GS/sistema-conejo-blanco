import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContabilidadService, CUENTA } from './contabilidad.service.js';
import { AsientoContable } from './asiento-contable.entity.js';
import { PeriodoCerrado } from './periodo-cerrado.entity.js';
import { redondear } from '../common/utils/dinero.util.js';
import { hoyISO } from '../common/utils/fecha.util.js';

export const ORIGEN_CIERRE = 'cierre_mensual';

export interface LineaCierre {
  clave: 'ccss' | 'ins' | 'renta' | 'iva';
  concepto: string;
  destino: string;
  // Lo que se va a pagar (y a liquidar contra su cuenta por pagar).
  monto: number;
  cuenta: string;
  // Saldo total de la cuenta hoy, para ver si arrastra algo de meses anteriores.
  saldoCuenta: number;
  detalle?: string;
  // Solo en la línea de IVA: de dónde sale el neto.
  ivaDebito?: number;
  ivaCredito?: number;
}

export interface VistaCierre {
  periodo: string;
  desde: string;
  hasta: string;
  lineas: LineaCierre[];
  totalAPagar: number;
  // Cosas que impiden cerrar el mes (ej. una planilla sin aprobar).
  bloqueos: string[];
  yaCerrado: boolean;
}

function rangoDe(periodo: string): { desde: string; hasta: string } {
  const [a, m] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, '0')}` };
}

@Injectable()
export class CierreMensualService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contabilidad: ContabilidadService,
  ) {}

  // Movimiento neto (créditos − débitos) del mes en cada cuenta, sin contar los
  // asientos que generó un cierre ni sus reversas: así el monto del mes no
  // cambia si el cierre se hace, se deshace y se vuelve a hacer.
  private async netoDelMes(desde: string, hasta: string, codigos: string[]): Promise<Map<string, { neto: number; saldo: number }>> {
    const filas: Array<{ codigo: string; neto: string; saldo: string }> = await this.dataSource.query(
      `SELECT c.codigo,
              COALESCE(SUM(l.haber::numeric - l.debe::numeric) FILTER (WHERE a.fecha BETWEEN $1 AND $2 AND NOT (
                  a.origen_tipo = '${ORIGEN_CIERRE}'
                  OR (a.origen_tipo = 'reversa' AND a.origen_id IN (SELECT id FROM asientos_contables WHERE origen_tipo = '${ORIGEN_CIERRE}')))), 0) AS neto,
              COALESCE(SUM(l.haber::numeric - l.debe::numeric), 0) AS saldo
       FROM cuentas_contables c
       LEFT JOIN lineas_asiento l ON l.cuenta_id = c.id
       LEFT JOIN asientos_contables a ON a.id = l.asiento_id
       WHERE c.codigo = ANY($3)
       GROUP BY c.codigo`,
      [desde, hasta, codigos],
    );
    return new Map(filas.map((f) => [f.codigo, { neto: Number(f.neto), saldo: Number(f.saldo) }]));
  }

  async vistaPrevia(periodo: string): Promise<VistaCierre> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new BadRequestException('El período debe ser YYYY-MM.');
    const { desde, hasta } = rangoDe(periodo);
    const m = await this.netoDelMes(desde, hasta, [
      CUENTA.CARGAS_SOCIALES_POR_PAGAR,
      CUENTA.INS_POR_PAGAR,
      CUENTA.RENTA_SALARIOS_POR_PAGAR,
      CUENTA.IVA_POR_PAGAR,
      CUENTA.IVA_CREDITO,
    ]);
    const get = (c: string) => m.get(c) ?? { neto: 0, saldo: 0 };

    const ivaDebito = redondear(Math.max(0, get(CUENTA.IVA_POR_PAGAR).neto));
    // 1400 es de naturaleza deudora: su neto (haber − debe) viene negativo cuando hay crédito.
    const ivaCredito = redondear(Math.max(0, -get(CUENTA.IVA_CREDITO).neto));
    const ivaAPagar = redondear(Math.max(0, ivaDebito - ivaCredito));

    const lineas: LineaCierre[] = [
      { clave: 'ccss', concepto: 'Cargas sociales (CCSS, Banco Popular, IMAS, INA, FODESAF, ROP, FCL)', destino: 'CCSS', monto: redondear(Math.max(0, get(CUENTA.CARGAS_SOCIALES_POR_PAGAR).neto)), cuenta: CUENTA.CARGAS_SOCIALES_POR_PAGAR, saldoCuenta: redondear(get(CUENTA.CARGAS_SOCIALES_POR_PAGAR).saldo) },
      { clave: 'ins', concepto: 'Póliza de riesgos del trabajo', destino: 'INS', monto: redondear(Math.max(0, get(CUENTA.INS_POR_PAGAR).neto)), cuenta: CUENTA.INS_POR_PAGAR, saldoCuenta: redondear(get(CUENTA.INS_POR_PAGAR).saldo) },
      { clave: 'renta', concepto: 'Retenciones de renta de salarios', destino: 'Ministerio de Hacienda', monto: redondear(Math.max(0, get(CUENTA.RENTA_SALARIOS_POR_PAGAR).neto)), cuenta: CUENTA.RENTA_SALARIOS_POR_PAGAR, saldoCuenta: redondear(get(CUENTA.RENTA_SALARIOS_POR_PAGAR).saldo) },
      {
        clave: 'iva',
        concepto: 'IVA del mes (D-150)',
        destino: 'Ministerio de Hacienda',
        monto: ivaAPagar,
        cuenta: CUENTA.IVA_POR_PAGAR,
        saldoCuenta: redondear(get(CUENTA.IVA_POR_PAGAR).saldo),
        detalle: `IVA cobrado en ventas ${ivaDebito.toFixed(2)} − IVA crédito de compras ${ivaCredito.toFixed(2)}`,
        ivaDebito,
        ivaCredito,
      },
    ];

    const bloqueos: string[] = [];
    const borradores: Array<{ fecha_desde: string; fecha_hasta: string }> = await this.dataSource.query(
      `SELECT fecha_desde, fecha_hasta FROM planilla_planillas WHERE estado = 'borrador' AND fecha_hasta BETWEEN $1 AND $2`,
      [desde, hasta],
    );
    for (const b of borradores) bloqueos.push(`Hay una planilla en borrador del ${b.fecha_desde} al ${b.fecha_hasta}: aprobala o eliminala antes de cerrar el mes.`);

    return {
      periodo,
      desde,
      hasta,
      lineas,
      totalAPagar: redondear(lineas.reduce((a, l) => a + l.monto, 0)),
      bloqueos,
      yaCerrado: await this.dataSource.getRepository(PeriodoCerrado).exists({ where: { periodo } }),
    };
  }

  private async codigoCuentaPago(cuentaBancariaId?: string): Promise<string> {
    if (!cuentaBancariaId) return CUENTA.CAJA;
    const filas: Array<{ codigo: string }> = await this.dataSource.query(
      `SELECT c.codigo FROM cuentas_bancarias b JOIN cuentas_contables c ON c.id = b.cuenta_contable_id WHERE b.id = $1 AND b.activa`,
      [cuentaBancariaId],
    );
    if (!filas[0]) throw new BadRequestException('La cuenta bancaria no existe o está desactivada.');
    return filas[0].codigo;
  }

  // Cierra el mes: genera los asientos de pago de las obligaciones del mes (CCSS,
  // INS, renta de salarios y liquidación del IVA/D-150) y lo bloquea. Se hace a mano,
  // normalmente cuando toca pagar la D-150.
  async cerrar(periodo: string, usuarioId: string, opciones: { cuentaBancariaId?: string; fecha?: string; notas?: string }): Promise<PeriodoCerrado> {
    const hoy = hoyISO();
    if (periodo >= hoy.slice(0, 7)) throw new BadRequestException('Solo se pueden cerrar meses ya terminados.');
    const vista = await this.vistaPrevia(periodo);
    if (vista.yaCerrado) throw new BadRequestException('Ese mes ya está cerrado.');
    if (vista.bloqueos.length > 0) throw new BadRequestException(vista.bloqueos.join(' '));

    const fecha = opciones.fecha ?? hoy;
    if (fecha > hoy) throw new BadRequestException('La fecha del pago no puede ser futura.');
    if (fecha < vista.hasta) throw new BadRequestException(`La fecha del pago no puede ser anterior al fin del mes (${vista.hasta}).`);
    const banco = await this.codigoCuentaPago(opciones.cuentaBancariaId);

    return this.dataSource.transaction(async (manager) => {
      const ids: string[] = [];
      const resumen: PeriodoCerrado['resumen'] = [];
      const registrar = async (descripcion: string, lineas: Array<{ codigoCuenta: string; debe?: number; haber?: number }>) => {
        const a = await this.contabilidad.registrarAsientoEnTransaccion(manager, { fecha, descripcion, origenTipo: ORIGEN_CIERRE, lineas });
        await manager.update(AsientoContable, a.id, { creadoPorId: usuarioId });
        ids.push(a.id);
      };

      for (const l of vista.lineas) {
        const ivaSinPago = l.clave === 'iva' && (l.ivaDebito ?? 0) > 0;
        if (l.monto <= 0 && !ivaSinPago) continue;
        resumen.push({ clave: l.clave, concepto: l.concepto, destino: l.destino, monto: l.monto });
        if (l.clave === 'iva') {
          // Se compensa primero con el IVA crédito del mes; solo se paga la diferencia.
          const ivaDebito = l.ivaDebito ?? 0;
          const ivaCredito = l.ivaCredito ?? 0;
          const compensado = redondear(Math.min(ivaDebito, ivaCredito));
          await registrar(`Liquidación de IVA (D-150) ${periodo}`, [
            { codigoCuenta: CUENTA.IVA_POR_PAGAR, debe: ivaDebito },
            ...(compensado > 0 ? [{ codigoCuenta: CUENTA.IVA_CREDITO, haber: compensado }] : []),
            ...(l.monto > 0 ? [{ codigoCuenta: banco, haber: l.monto }] : []),
          ]);
          continue;
        }
        await registrar(`Pago ${l.clave === 'ccss' ? 'de cargas sociales a la CCSS' : l.clave === 'ins' ? 'de la póliza de riesgos del trabajo al INS' : 'de retenciones de renta de salarios a Hacienda'} — ${periodo}`, [
          { codigoCuenta: l.cuenta, debe: l.monto },
          { codigoCuenta: banco, haber: l.monto },
        ]);
      }
      return manager.save(
        PeriodoCerrado,
        manager.create(PeriodoCerrado, { periodo, cerradoPorId: usuarioId, notas: (opciones.notas ?? '').trim().slice(0, 255), asientosCierre: ids, resumen }),
      );
    });
  }

  // Deshace el cierre: reversa los asientos de pago que generó y reabre el mes.
  async reabrir(periodo: string): Promise<void> {
    const registro = await this.dataSource.getRepository(PeriodoCerrado).findOneBy({ periodo });
    if (!registro) throw new NotFoundException('Ese período no está cerrado.');
    if (await this.dataSource.query('SELECT 1 FROM cierres_fiscales WHERE anio = $1', [Number(periodo.slice(0, 4))]).then((r: unknown[]) => r.length > 0)) {
      throw new BadRequestException(`El año fiscal ${periodo.slice(0, 4)} ya está cerrado: primero reabra el cierre fiscal.`);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PeriodoCerrado, { periodo });
      const asientos = registro.asientosCierre.length
        ? await manager.find(AsientoContable, {
            where: registro.asientosCierre.map((id) => ({ id })),
            relations: { lineas: { cuenta: true } },
            order: { numero: 'ASC' },
          })
        : [];
      await this.contabilidad.reversarAsientosEnTransaccion(manager, asientos, `reapertura del mes ${periodo}`);
    });
  }
}
