import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Unique, type Relation } from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PosVentaLinea } from './pos-venta-linea.entity.js';
import { PosPago } from './pos-pago.entity.js';

export const ESTADO_POS_VENTA = { VIGENTE: 'vigente', ANULADA: 'anulada' } as const;

// Una venta de caja (tiquete). Régimen simplificado: no es factura electrónica y no lleva IVA aparte.
// El id lo genera la terminal (uuid) al cobrar, aunque no haya internet: así reenviar la venta nunca la duplica.
@Entity({ name: 'pos_ventas' })
@Unique(['ubicacionId', 'numero'])
export class PosVenta {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  // Consecutivo del tiquete dentro de la tienda (T01-000123 = código de la tienda + este número).
  @Column({ type: 'int' })
  numero: number;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cajero_id' })
  cajero: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'cajero_id' })
  cajeroId: string;

  @Column({ type: 'uuid', name: 'caja_id', nullable: true })
  cajaId: string | null;

  // Fecha y hora en que se cobró (reloj de la terminal).
  @Column({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuento: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'varchar', length: 10, default: ESTADO_POS_VENTA.VIGENTE })
  estado: string;

  @Column({ type: 'varchar', length: 200, name: 'motivo_anulacion', nullable: true })
  motivoAnulacion: string | null;

  @Column({ type: 'timestamptz', name: 'anulada_en', nullable: true })
  anuladaEn: Date | null;

  @Column({ type: 'uuid', name: 'anulada_por_id', nullable: true })
  anuladaPorId: string | null;

  // Aviso para revisar: por ejemplo, un precio distinto al que tenía el producto al recibir la venta.
  @Column({ type: 'varchar', length: 200, nullable: true })
  alerta: string | null;

  // true si se cobró sin internet y llegó al servidor después.
  @Column({ type: 'boolean', name: 'creada_sin_conexion', default: false })
  creadaSinConexion: boolean;

  @CreateDateColumn({ name: 'recibida_en' })
  recibidaEn: Date;

  @OneToMany(() => PosVentaLinea, (l) => l.venta, { cascade: true })
  lineas: Relation<PosVentaLinea>[];

  @OneToMany(() => PosPago, (p) => p.venta, { cascade: true })
  pagos: Relation<PosPago>[];
}
