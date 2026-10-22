import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

// Registro de actividad de las tiendas: lo que pasa en la caja (aunque no haya internet; trae la hora real del evento) y los cambios
// que se hacen desde el panel (precios, mínimos, datos de la tienda, anulaciones…). Es solo de consulta: nunca se edita ni se borra.
@Entity({ name: 'pos_actividad' })
@Index('idx_pos_actividad_fecha', ['fecha'])
@Index('idx_pos_actividad_ubicacion', ['ubicacionId'])
export class PosActividad {
  // Lo genera la caja (así reenviar no duplica) o el servidor.
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  // Nulo cuando el cambio vale para todas las tiendas (por ejemplo, un precio de tienda).
  @Column({ type: 'uuid', name: 'ubicacion_id', nullable: true })
  ubicacionId: string | null;

  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 160, name: 'usuario_nombre', default: '' })
  usuarioNombre: string;

  @Column({ type: 'varchar', length: 40 })
  tipo: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  detalle: string;

  // Cuándo ocurrió de verdad (la hora de la caja); recibidoEn es cuándo llegó al servidor.
  @Column({ type: 'timestamptz' })
  fecha: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'recibido_en' })
  recibidoEn: Date;

  @Column({ type: 'boolean', name: 'sin_conexion', default: false })
  sinConexion: boolean;

  // 'caja' (lo hizo la persona en la terminal) o 'panel' (lo hizo la administración).
  @Column({ type: 'varchar', length: 10, default: 'caja' })
  origen: string;
}
