import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Pedido } from '../pedidos/pedido.entity.js';
import { Cliente } from '../clientes/cliente.entity.js';
import { EstadoFactura } from '../common/enums/estado-factura.enum.js';
import { NotaCredito } from './nota-credito.entity.js';
import { FacturaLinea } from './factura-linea.entity.js';
import { TipoPago } from '../common/enums/tipo-pago.enum.js';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';

// El comprobante electrónico (Factura Electrónica) generado a partir de
// un pedido ya con cliente registrado. Trae la numeración oficial de
// Hacienda ya armada (consecutivo de 20 dígitos + clave numérica de 50)
// — lo único que falta para timbrarla de verdad es firmarla (XAdES, con
// la llave .p12 de la empresa) y enviarla a la API de Hacienda; ver
// HaciendaClient. Hasta que eso se conecte, queda en PENDIENTE_ENVIO.
@Entity({ name: 'facturas' })
export class Factura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nulo en las facturas hechas a mano (origen 'manual'), que no salen de
  // ningún pedido.
  @OneToOne(() => Pedido, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Relation<Pedido> | null;

  @Column({ type: 'uuid', name: 'pedido_id', unique: true, nullable: true })
  pedidoId: string | null;

  // 'pedido' = generada desde un pedido; 'manual' = hecha a mano desde
  // Facturas → Nueva factura.
  @Column({ type: 'varchar', length: 10, default: 'pedido' })
  origen: 'pedido' | 'manual';

  // --- Solo facturas manuales (en las de pedido esto vive en el pedido) ---
  @Column({ type: 'enum', enum: TipoPago, name: 'tipo_pago', nullable: true })
  tipoPago: TipoPago | null;

  @Column({ type: 'integer', name: 'dias_credito', nullable: true })
  diasCredito: number | null;

  @Column({ type: 'varchar', length: 30, name: 'medio_pago', nullable: true })
  medioPago: string | null;

  @Column({ type: 'varchar', length: 80, name: 'orden_compra', nullable: true })
  ordenCompra: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  vendedor: string | null;

  // De dónde salió el stock de las líneas de catálogo.
  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion> | null;

  @Column({ type: 'uuid', name: 'ubicacion_id', nullable: true })
  ubicacionId: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'text', nullable: true })
  terminos: string | null;

  @Column({ type: 'text', nullable: true })
  leyenda: string | null;

  // Copia del encabezado (logo, razón social, cédula…) tal como estaba al
  // emitir, para que la factura se reimprima igual aunque la
  // configuración cambie.
  @Column({ type: 'jsonb', nullable: true })
  encabezado: Record<string, string | null> | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'descuento_total', default: 0 })
  descuentoTotal: string;

  // Una factura manual anulada (con su nota de crédito). Las de pedido
  // siguen usando el estado del pedido.
  @Column({ type: 'boolean', default: false })
  anulada: boolean;

  @OneToMany(() => FacturaLinea, (linea) => linea.factura, { cascade: ['insert'] })
  lineas: Relation<FacturaLinea>[];

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Relation<Cliente>;

  @Column({ type: 'uuid', name: 'cliente_id' })
  clienteId: string;

  // Código de Hacienda: '01' Factura Electrónica. Por ahora esta es la
  // única familia de pedidos que genera comprobante (ventas B2B con
  // cliente registrado); Tiquete Electrónico es del POS de mostrador,
  // que todavía no existe en este sistema.
  @Column({ type: 'varchar', length: 2, name: 'tipo_comprobante', default: '01' })
  tipoComprobante: string;

  // sucursal(3) + terminal(5) + tipo(2) + secuencial(10) = 20 dígitos.
  @Column({ type: 'varchar', length: 20, unique: true })
  consecutivo: string;

  // "506" + DDMMAA(6) + cédula emisor(12) + consecutivo(20) + situación(1) + seguridad(8) = 50 dígitos.
  @Column({ type: 'varchar', length: 50, name: 'clave_numerica', unique: true })
  claveNumerica: string;

  @Column({ type: 'date' })
  fecha: string;

  // Montos congelados al momento de facturar — si el pedido cambiara
  // después (no debería, pero por si acaso) la factura ya emitida no se
  // mueve, igual que pedido_lineas congela el precio del catálogo.
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'iva_porcentaje' })
  ivaPorcentaje: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'iva_monto' })
  ivaMonto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'enum', enum: EstadoFactura, default: EstadoFactura.PENDIENTE_ENVIO })
  estado: EstadoFactura;

  @Column({ type: 'text', name: 'mensaje_hacienda', nullable: true })
  mensajeHacienda: string | null;

  // Nula mientras la factura sigue vigente — ver FacturacionService.anularFactura.
  @OneToOne(() => NotaCredito, (nota) => nota.factura)
  notaCredito: Relation<NotaCredito> | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
