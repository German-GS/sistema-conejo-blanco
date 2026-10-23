import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Uso del sistema, sin contenido: qué pantallas se abren, qué búsquedas no encuentran nada y qué llamadas fallan. Sirve para decidir con
// datos qué simplificar. Nunca guarda lo que la persona escribe en los formularios.
@Entity({ name: 'uso_eventos' })
@Index('idx_uso_eventos_fecha', ['fecha'])
export class UsoEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'usuario_id', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 30, default: '' })
  rol: string;

  // pantalla | busqueda_sin_resultado | error_api
  @Column({ type: 'varchar', length: 30 })
  tipo: string;

  @Column({ type: 'varchar', length: 160 })
  clave: string;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;
}
