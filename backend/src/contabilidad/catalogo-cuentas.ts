import { NaturalezaCuenta, TipoCuentaContable } from '../common/enums/tipo-cuenta-contable.enum.js';

const A = TipoCuentaContable.ACTIVO;
const P = TipoCuentaContable.PASIVO;
const PT = TipoCuentaContable.PATRIMONIO;
const I = TipoCuentaContable.INGRESO;
const G = TipoCuentaContable.GASTO;
const D = NaturalezaCuenta.DEUDORA;
const C = NaturalezaCuenta.ACREEDORA;

export interface CuentaCatalogo {
  codigo: string;
  nombre: string;
  tipo: TipoCuentaContable;
  naturaleza: NaturalezaCuenta;
  descripcion: string;
  // Las usa el sistema por sí solo (ver CUENTA en contabilidad.service.ts).
  sistema?: boolean;
}

// Catálogo de cuentas de una empresa manufacturera costarricense.
// Numeración: 1 activos · 2 pasivos · 3 patrimonio · 4 ingresos ·
// 5 costos y gastos. Se siembra por código (idempotente): las cuentas que
// ya existen no se tocan y las nuevas se agregan en el próximo arranque.
// 1110–1199 están reservadas para las cuentas bancarias que se crean en
// Configuración → Cuentas bancarias.
export const CATALOGO_CUENTAS: CuentaCatalogo[] = [
  // ---- Activos ----
  { codigo: '1100', nombre: 'Caja y Bancos', tipo: A, naturaleza: D, sistema: true, descripcion: 'Efectivo en caja y ventas de contado. Los bancos tienen su propia cuenta (1110–1199).' },
  { codigo: '1200', nombre: 'Cuentas por Cobrar', tipo: A, naturaleza: D, sistema: true, descripcion: 'CxC — facturas a crédito de clientes pendientes de pago.' },
  { codigo: '1210', nombre: 'Documentos por Cobrar', tipo: A, naturaleza: D, descripcion: 'Letras, pagarés o cheques postfechados de clientes.' },
  { codigo: '1250', nombre: 'Cuentas por Cobrar Empleados', tipo: A, naturaleza: D, sistema: true, descripcion: 'Adelantos y préstamos a empleados que se rebajan en planilla.' },
  { codigo: '1260', nombre: 'Otras Cuentas por Cobrar', tipo: A, naturaleza: D, descripcion: 'Cuentas por cobrar que no son de clientes ni de empleados.' },
  { codigo: '1270', nombre: 'Anticipos a Proveedores', tipo: A, naturaleza: D, descripcion: 'Adelantos entregados a proveedores por compras futuras.' },
  { codigo: '1300', nombre: 'Inventario de Mercancías', tipo: A, naturaleza: D, sistema: true, descripcion: 'Producto terminado disponible para la venta.' },
  { codigo: '1305', nombre: 'Inventario de Tiendas', tipo: A, naturaleza: D, sistema: true, descripcion: 'Mercadería que ya está en las tiendas, valorada a su costo especial de traslado.' },
  { codigo: '1310', nombre: 'Inventario de Materia Prima', tipo: A, naturaleza: D, descripcion: 'Hilo, elásticos, empaques y demás materiales de producción.' },
  { codigo: '1320', nombre: 'Inventario de Producto en Proceso', tipo: A, naturaleza: D, descripcion: 'Producto que está en fabricación.' },
  { codigo: '1400', nombre: 'IVA Crédito Fiscal', tipo: A, naturaleza: D, descripcion: 'IVA pagado en compras, acreditable contra el IVA de las ventas.' },
  { codigo: '1410', nombre: 'Retenciones de Renta a Favor', tipo: A, naturaleza: D, descripcion: 'Impuesto retenido a la empresa por clientes, a favor ante Hacienda.' },
  { codigo: '1420', nombre: 'Gastos Pagados por Adelantado', tipo: A, naturaleza: D, descripcion: 'Seguros, alquileres y otros pagados antes de usarse.' },
  { codigo: '1500', nombre: 'Maquinaria y Equipo', tipo: A, naturaleza: D, descripcion: 'Máquinas de tejer, de coser y demás equipo de producción.' },
  { codigo: '1510', nombre: 'Mobiliario y Equipo de Oficina', tipo: A, naturaleza: D, descripcion: 'Escritorios, estantes y mobiliario.' },
  { codigo: '1520', nombre: 'Equipo de Cómputo', tipo: A, naturaleza: D, descripcion: 'Computadoras, impresoras y reloj marcador.' },
  { codigo: '1530', nombre: 'Vehículos', tipo: A, naturaleza: D, descripcion: 'Vehículos de la empresa.' },
  { codigo: '1540', nombre: 'Edificios', tipo: A, naturaleza: D, descripcion: 'Edificios y construcciones propias.' },
  { codigo: '1550', nombre: 'Terrenos', tipo: A, naturaleza: D, descripcion: 'Terrenos propios.' },
  { codigo: '1590', nombre: 'Depreciación Acumulada', tipo: A, naturaleza: C, descripcion: 'Desgaste acumulado de los activos fijos (cuenta que resta).' },

  // ---- Pasivos ----
  { codigo: '2100', nombre: 'Salarios por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'Salarios netos de planilla pendientes de pago.' },
  { codigo: '2110', nombre: 'Cargas Sociales por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'CCSS, Banco Popular y demás cargas de planilla por pagar.' },
  { codigo: '2120', nombre: 'Retención de Renta de Salarios por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'Impuesto retenido a los empleados, por pagar a Hacienda.' },
  { codigo: '2130', nombre: 'Provisiones Laborales por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'Aguinaldo, vacaciones y cesantía provisionados.' },
  { codigo: '2140', nombre: 'INS Póliza de Riesgos del Trabajo por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'Prima de la póliza de riesgos del trabajo que se paga al INS (no a la CCSS).' },
  { codigo: '2150', nombre: 'Impuesto sobre la Renta por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'Impuesto de renta del año provisionado al cierre fiscal, por pagar a Hacienda.' },
  { codigo: '2200', nombre: 'IVA por Pagar', tipo: P, naturaleza: C, sistema: true, descripcion: 'IVA cobrado en las ventas, por declarar y pagar a Hacienda.' },
  { codigo: '2300', nombre: 'Cuentas por Pagar Proveedores', tipo: P, naturaleza: C, descripcion: 'CxP — compras a crédito pendientes de pago a proveedores.' },
  { codigo: '2310', nombre: 'Documentos por Pagar', tipo: P, naturaleza: C, descripcion: 'Letras, pagarés o cheques girados a proveedores.' },
  { codigo: '2320', nombre: 'Acreedores Varios', tipo: P, naturaleza: C, descripcion: 'Deudas con terceros que no son proveedores de mercadería.' },
  { codigo: '2330', nombre: 'Retenciones de Impuestos por Pagar', tipo: P, naturaleza: C, descripcion: 'Retenciones hechas a proveedores, por pagar a Hacienda.' },
  { codigo: '2400', nombre: 'Préstamos Bancarios a Corto Plazo', tipo: P, naturaleza: C, descripcion: 'Préstamos y sobregiros que vencen en menos de un año.' },
  { codigo: '2410', nombre: 'Intereses por Pagar', tipo: P, naturaleza: C, descripcion: 'Intereses devengados y no pagados.' },
  { codigo: '2500', nombre: 'Préstamos Bancarios a Largo Plazo', tipo: P, naturaleza: C, descripcion: 'Préstamos que vencen en más de un año.' },
  { codigo: '2600', nombre: 'Anticipos de Clientes', tipo: P, naturaleza: C, descripcion: 'Dinero recibido de clientes por pedidos que aún no se facturan.' },

  // ---- Patrimonio ----
  { codigo: '3100', nombre: 'Capital Social', tipo: PT, naturaleza: C, descripcion: 'Aportes de los socios.' },
  { codigo: '3200', nombre: 'Reserva Legal', tipo: PT, naturaleza: C, descripcion: 'Reserva obligatoria de utilidades.' },
  { codigo: '3300', nombre: 'Utilidades (Pérdidas) Acumuladas', tipo: PT, naturaleza: C, descripcion: 'Resultados de períodos anteriores.' },
  { codigo: '3500', nombre: 'Aportes Adicionales de Socios', tipo: PT, naturaleza: C, descripcion: 'Aportes de los socios posteriores al capital inicial.' },
  { codigo: '3600', nombre: 'Retiros de Socios', tipo: PT, naturaleza: D, descripcion: 'Dinero que los socios retiran (cuenta que resta).' },

  // ---- Ingresos ----
  { codigo: '4100', nombre: 'Ventas', tipo: I, naturaleza: C, sistema: true, descripcion: 'Ventas de mercadería.' },
  { codigo: '4110', nombre: 'Descuentos sobre Ventas', tipo: I, naturaleza: D, descripcion: 'Descuentos concedidos a clientes (cuenta que resta).' },
  { codigo: '4120', nombre: 'Devoluciones sobre Ventas', tipo: I, naturaleza: D, descripcion: 'Mercadería devuelta por clientes (cuenta que resta).' },
  { codigo: '4200', nombre: 'Otros Ingresos', tipo: I, naturaleza: C, sistema: true, descripcion: 'Ingresos que no son por ventas (retazos, reembolsos…).' },
  { codigo: '4300', nombre: 'Ingresos Financieros', tipo: I, naturaleza: C, descripcion: 'Intereses ganados.' },
  { codigo: '4400', nombre: 'Diferencias Cambiarias Ganadas', tipo: I, naturaleza: C, descripcion: 'Ganancia por variación del tipo de cambio.' },

  // ---- Costos (5100–5199) ----
  { codigo: '5100', nombre: 'Costo de Ventas', tipo: G, naturaleza: D, sistema: true, descripcion: 'Costo de la mercadería vendida.' },
  { codigo: '5110', nombre: 'Materia Prima Consumida', tipo: G, naturaleza: D, descripcion: 'Materiales usados en la producción.' },
  { codigo: '5120', nombre: 'Mano de Obra Directa', tipo: G, naturaleza: D, descripcion: 'Salarios del personal de producción.' },
  { codigo: '5130', nombre: 'Gastos Indirectos de Fabricación', tipo: G, naturaleza: D, descripcion: 'Energía, mantenimiento y demás costos de la planta.' },

  // ---- Gastos de operación (5200 en adelante) ----
  { codigo: '5200', nombre: 'Sueldos y Salarios', tipo: G, naturaleza: D, sistema: true, descripcion: 'Salarios brutos de planilla.' },
  { codigo: '5210', nombre: 'Cargas Sociales Patronales', tipo: G, naturaleza: D, sistema: true, descripcion: 'Cargas sociales a cargo del patrono.' },
  { codigo: '5220', nombre: 'Gasto por Provisiones Laborales', tipo: G, naturaleza: D, sistema: true, descripcion: 'Aguinaldo, vacaciones y cesantía.' },
  { codigo: '5300', nombre: 'Alquileres', tipo: G, naturaleza: D, descripcion: 'Alquiler de local, bodega o equipo.' },
  { codigo: '5310', nombre: 'Servicios Públicos', tipo: G, naturaleza: D, descripcion: 'Electricidad y agua.' },
  { codigo: '5320', nombre: 'Teléfono e Internet', tipo: G, naturaleza: D, descripcion: 'Telefonía, internet y sistemas en la nube.' },
  { codigo: '5330', nombre: 'Papelería y Útiles de Oficina', tipo: G, naturaleza: D, descripcion: 'Suministros de oficina.' },
  { codigo: '5340', nombre: 'Mantenimiento y Reparaciones', tipo: G, naturaleza: D, descripcion: 'Mantenimiento de maquinaria, local y vehículos.' },
  { codigo: '5350', nombre: 'Combustible y Transporte', tipo: G, naturaleza: D, descripcion: 'Combustible, peajes y transporte.' },
  { codigo: '5360', nombre: 'Fletes y Encomiendas', tipo: G, naturaleza: D, descripcion: 'Envío de pedidos a clientes.' },
  { codigo: '5370', nombre: 'Publicidad y Mercadeo', tipo: G, naturaleza: D, descripcion: 'Promoción y material publicitario.' },
  { codigo: '5380', nombre: 'Honorarios Profesionales', tipo: G, naturaleza: D, descripcion: 'Contador, abogado y otros servicios profesionales.' },
  { codigo: '5390', nombre: 'Seguros', tipo: G, naturaleza: D, descripcion: 'Pólizas de seguro.' },
  { codigo: '5400', nombre: 'Impuestos y Patentes', tipo: G, naturaleza: D, descripcion: 'Patente municipal, impuesto de bienes inmuebles y similares.' },
  { codigo: '5410', nombre: 'Comisiones Bancarias', tipo: G, naturaleza: D, descripcion: 'Comisiones y cargos del banco.' },
  { codigo: '5420', nombre: 'Intereses Bancarios', tipo: G, naturaleza: D, descripcion: 'Intereses de préstamos.' },
  { codigo: '5430', nombre: 'Depreciación', tipo: G, naturaleza: D, descripcion: 'Gasto por desgaste de activos fijos.' },
  { codigo: '5440', nombre: 'Pérdidas por Mermas de Inventario', tipo: G, naturaleza: D, descripcion: 'Producto dañado, perdido o ajustado en conteos.' },
  { codigo: '5450', nombre: 'Diferencias Cambiarias Perdidas', tipo: G, naturaleza: D, descripcion: 'Pérdida por variación del tipo de cambio.' },
  { codigo: '5460', nombre: 'Diferencia de Costo en Traslados a Tiendas', tipo: G, naturaleza: D, sistema: true, descripcion: 'Diferencia entre el costo normal del producto y el costo especial con que se traslada a las tiendas (si el costo especial es mayor, queda a favor).' },
  { codigo: '5500', nombre: 'Impuesto sobre la Renta', tipo: G, naturaleza: D, sistema: true, descripcion: 'Gasto por el impuesto de renta del año (se provisiona al cierre fiscal).' },
  { codigo: '5900', nombre: 'Gastos Diversos', tipo: G, naturaleza: D, descripcion: 'Gastos menores que no encajan en otra cuenta.' },
];
