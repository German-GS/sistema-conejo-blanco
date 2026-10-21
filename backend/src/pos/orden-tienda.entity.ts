import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Unique, type Relation } from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { OrdenTiendaLinea } from './orden-tienda-linea.entity.js';
import { OrdenTiendaEvento } from './orden-tienda-evento.entity.js';

// Seguimiento: la tienda la ENVÍA → la administración la RECIBE → la REVISA (aceptada o corregida, con el costo especial)
// → se ALISTA en bodega → sale EN CAMINO (traspaso despachado) → la tienda verifica y la acepta (ENTREGADA).
export const ESTADO_ORDEN_TIENDA = { ENVIADA: 'enviada', RECIBIDA: 'recibida', REVISADA: 'revisada', ALISTADA: 'alistada', EN_CAMINO: 'en_camino', ENTREGADA: 'entregada', RECHAZADA: 'rechazada', CANCELADA: 'cancelada' } as const;
export type EstadoOrdenTienda = (typeof ESTADO_ORDEN_TIENDA)[keyof typeof ESTADO_ORDEN_TIENDA];

// Pedido de reposición de una tienda a la bodega. Lo arma el encargado desde el POS (también sin internet);
// llega a la administración como pendiente, que lo atiende con un traspaso desde bodega.
// El id lo genera la terminal, igual que las ventas, para que reenviar nunca duplique.
@Entity({ name: 'pos_ordenes' })
@Unique(['ubicacionId', 'numero'])
export class OrdenTienda {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  // Consecutivo dentro de la tienda (OR-T01-0007).
  @Column({ type: 'int' })
  numero: number;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitante_id' })
  solicitante: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'solicitante_id' })
  solicitanteId: string;

  @Column({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'boolean', default: false })
  urgente: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas: string | null;

  @Column({ type: 'varchar', length: 15, default: ESTADO_ORDEN_TIENDA.ENVIADA })
  estado: string;

  // Resultado de la revisión: 'aceptada' (se envía lo pedido) o 'corregida' (se envía otra cantidad, lo que hay en bodega).
  @Column({ type: 'varchar', length: 10, nullable: true })
  resolucion: string | null;

  // La anotación de la administración al revisar (o el motivo del rechazo).
  @Column({ type: 'varchar', length: 300, nullable: true })
  respuesta: string | null;

  @Column({ type: 'uuid', name: 'traspaso_id', nullable: true })
  traspasoId: string | null;

  @Column({ type: 'uuid', name: 'atendida_por_id', nullable: true })
  atendidaPorId: string | null;

  @Column({ type: 'timestamptz', name: 'atendida_en', nullable: true })
  atendidaEn: Date | null;

  @Column({ type: 'boolean', name: 'creada_sin_conexion', default: false })
  creadaSinConexion: boolean;

  @CreateDateColumn({ name: 'recibida_en' })
  recibidaEn: Date;

  @OneToMany(() => OrdenTiendaLinea, (l) => l.orden, { cascade: true })
  lineas: Relation<OrdenTiendaLinea>[];

  @OneToMany(() => OrdenTiendaEvento, (e) => e.orden)
  eventos: Relation<OrdenTiendaEvento>[];
}
