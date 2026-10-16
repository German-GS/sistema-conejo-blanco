import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';

// Una carga del archivo del reloj. Se conserva el resumen y el mapeo de
// columnas usado, para poder revisar qué se importó y cómo se leyó.
@Entity({ name: 'planilla_importaciones' })
export class ImportacionMarcas {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'nombre_archivo' })
  nombreArchivo: string;

  @Column({ type: 'date', name: 'periodo_desde' })
  periodoDesde: string;

  @Column({ type: 'date', name: 'periodo_hasta' })
  periodoHasta: string;

  @Column({ type: 'jsonb' })
  mapeo: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  resumen: Record<string, unknown>;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'usuario_id' })
  usuarioId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
