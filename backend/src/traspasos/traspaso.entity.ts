import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { EstadoTraspaso } from '../common/enums/estado-traspaso.enum.js';
import { TraspasoLinea } from './traspaso-linea.entity.js';

// Un traspaso es su propia entidad con estado, no dos movimientos
// sueltos — permite conciliar diferencias entre lo que salió de origen
// y lo que realmente llegó a destino (ver TraspasosService.recibir).
@Entity({ name: 'traspasos' })
export class Traspaso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', name: 'numero_traspaso', unique: true, generated: 'increment' })
  numeroTraspaso: number;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'origen_id' })
  origen: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'origen_id' })
  origenId: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destino_id' })
  destino: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'destino_id' })
  destinoId: string;

  @Column({ type: 'enum', enum: EstadoTraspaso, default: EstadoTraspaso.SOLICITADO })
  estado: EstadoTraspaso;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitado_por' })
  solicitadoPor: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'solicitado_por' })
  solicitadoPorId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'recibido_por' })
  recibidoPor: Relation<Usuario> | null;

  @Column({ type: 'uuid', name: 'recibido_por', nullable: true })
  recibidoPorId: string | null;

  @Column({ type: 'timestamp', name: 'fecha_envio', nullable: true })
  fechaEnvio: Date | null;

  @Column({ type: 'timestamp', name: 'fecha_recepcion', nullable: true })
  fechaRecepcion: Date | null;

  @OneToMany(() => TraspasoLinea, (linea) => linea.traspaso, { cascade: true })
  lineas: Relation<TraspasoLinea>[];

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
