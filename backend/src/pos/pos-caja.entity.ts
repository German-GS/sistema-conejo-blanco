import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';

// Un turno de caja: se abre con un fondo en efectivo y se cierra contando lo que hay (arqueo).
// El id lo genera la terminal, igual que en las ventas.
@Entity({ name: 'pos_cajas' })
export class PosCaja {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cajero_id' })
  cajero: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'cajero_id' })
  cajeroId: string;

  @Column({ type: 'timestamptz', name: 'abierta_en' })
  abiertaEn: Date;

  @Column({ type: 'decimal', name: 'fondo_inicial', precision: 12, scale: 2, default: 0 })
  fondoInicial: string;

  @Column({ type: 'timestamptz', name: 'cerrada_en', nullable: true })
  cerradaEn: Date | null;

  // Fondo + efectivo cobrado en ventas vigentes de este turno (lo calcula el servidor al cerrar).
  @Column({ type: 'decimal', name: 'efectivo_esperado', precision: 12, scale: 2, nullable: true })
  efectivoEsperado: string | null;

  @Column({ type: 'decimal', name: 'efectivo_contado', precision: 12, scale: 2, nullable: true })
  efectivoContado: string | null;

  // Contado − esperado: negativo = faltante, positivo = sobrante.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  diferencia: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas: string | null;
}
