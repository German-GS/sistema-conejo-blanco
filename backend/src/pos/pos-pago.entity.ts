import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { PosVenta } from './pos-venta.entity.js';

export const MEDIOS_POS = ['efectivo', 'tarjeta', 'sinpe', 'transferencia'] as const;
export type MedioPos = (typeof MEDIOS_POS)[number];

@Entity({ name: 'pos_pagos' })
export class PosPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PosVenta, (v) => v.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Relation<PosVenta>;

  @Column({ type: 'uuid', name: 'venta_id' })
  ventaId: string;

  @Column({ type: 'varchar', length: 20 })
  medio: string;

  // Lo que se aplicó a la venta (sin el vuelto).
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: string;

  // Número de comprobante de SINPE o de transferencia, o voucher del datáfono.
  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;

  // Solo efectivo: lo que entregó el cliente y el vuelto devuelto.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  recibido: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  vuelto: string | null;
}
