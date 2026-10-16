import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Pedido } from './pedido.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';

// Bitácora inmutable de ediciones a un pedido ya guardado — el caso típico
// es que bodega encontró menos stock del que el pedido pide y alguien con
// acceso corrige las líneas. Nunca se edita ni se borra una fila de esta
// tabla (mismo espíritu que MovimientoInventario): queda quién, cuándo y
// qué cambió, para que el ajuste sea trazable.
@Entity({ name: 'pedido_ediciones' })
export class PedidoEdicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pedido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Relation<Pedido>;

  @Column({ type: 'uuid', name: 'pedido_id' })
  pedidoId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  // Motivo opcional que escribe quien edita (ej. "Faltante en bodega").
  @Column({ type: 'varchar', length: 255, nullable: true })
  motivo: string | null;

  // Un texto por cambio, ya listo para mostrar (ej. "KW034 Rojo: 5.00 →
  // 3.00 docenas", "KW034 Azul: eliminada").
  @Column({ type: 'jsonb' })
  cambios: string[];

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
