import { describe, expect, it } from 'vitest';
import { armarArchivoBp, cuentaDeIban, ibanValido, limpiarTexto, numeroTexto } from './banco-popular.js';

// Datos inventados (no son de nadie), con la misma forma que los del Excel.
const empresa = {
  nombreEmpresa: 'Empresa de Prueba SRL',
  numeroPatrono: '31011111111',
  cedulaPatrono: '3101111111',
  identificadorCliente: '1000001',
  convenio: 1,
  cuentaPatrono: 'CR11000000000000000001',
  moneda: 'CRC',
};
const pagos = [
  { nombre: 'Ana Peña Núñez', cedula: '101110111', identificadorBp: '2000001', iban: 'CR22000000000000000002', monto: 106134.6 },
  { nombre: 'Ana María Ülloa', cedula: '202220222', identificadorBp: '2000002', iban: 'CR33000000000000000003', monto: 215424 },
];

describe('Banco Popular — archivo de planilla web', () => {
  const a = armarArchivoBp(empresa, pagos, 'Semanal 28 sep al 3 oct', '2026-10-09');
  const lineas = a.contenido.split('\r\n');

  it('la cuenta son los 17 dígitos desde el carácter 6 del IBAN', () => {
    expect(cuentaDeIban('CR11000000000000000001')).toBe('00000000000000001');
    expect(ibanValido('CR11000000000000000001')).toBe(true);
    expect(ibanValido('CR1100000000000000000')).toBe(false);
  });

  it('encabezado: patrono.convenio, fecha, cuenta, moneda, total×2 y conteos', () => {
    expect(lineas[0]).toBe('HD|31011111111.1|20261009|00000000000000001|CRC|643117.2|3|2|1');
  });

  it('una línea de débito (544) y una de crédito (545) por empleado, con 29 campos', () => {
    expect(lineas).toHaveLength(5); // 4 líneas + el salto final
    expect(lineas[4]).toBe('');
    for (const l of lineas.slice(1, 4)) expect(l.split('|')).toHaveLength(29);
    const debito = lineas[1].split('|');
    expect(debito.slice(0, 2)).toEqual(['DA', '00000000000000001']);
    expect(debito[5]).toBe('321558.6');
    expect(debito[9]).toBe('544');
    expect(debito[25]).toBe('3101111111');
    expect(debito[26]).toBe('31011111111.1.1000001');
    const credito = lineas[2].split('|');
    expect(credito[1]).toBe('00000000000000002');
    expect(credito[5]).toBe('106134.6');
    expect(credito[9]).toBe('545');
    expect(credito[11]).toBe('ANA PENA NUNEZ');
    expect(credito[22]).toBe('ANA PENA NUNEZ');
    expect(credito[25]).toBe('101110111');
    expect(credito[26]).toBe('31011111111.1.2000001');
  });

  it('el total del débito es la suma de los créditos', () => {
    expect(a.total).toBe(321558.6);
    expect(a.pagos).toBe(2);
  });

  it('nombre de archivo como el de la macro y texto sin caracteres problemáticos', () => {
    expect(a.nombreArchivo).toBe('PLANILLA SEMANAL 28 SEP AL 3 OCT CREADA EL 20261009.txt');
    expect(limpiarTexto('Ñandú, "Pérez" | Ü°\\', 35)).toBe('NANDU "PEREZ" U');
    expect(numeroTexto(215424)).toBe('215424');
    expect(numeroTexto(104596.4)).toBe('104596.4');
  });
});
