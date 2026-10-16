import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, type Relation } from 'typeorm';
import { Usuario } from './usuario.entity.js';
import { Permiso } from '../common/enums/permiso.enum.js';

// Ajuste puntual sobre los permisos por defecto del rol de un usuario
// (ver permisos-por-defecto.ts) — para el caso "este contador en
// particular también puede X" o "a este asistente no le des Y" sin tener
// que inventar un rol nuevo para cada combinación.
@Entity({ name: 'usuario_permisos' })
@Unique(['usuarioId', 'permiso'])
export class UsuarioPermiso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  @Column({ type: 'enum', enum: Permiso })
  permiso: Permiso;

  // true = se le concede aunque el rol no lo traiga por defecto.
  // false = se le quita aunque el rol sí lo traiga por defecto.
  @Column({ type: 'boolean' })
  concedido: boolean;
}
