import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Ubicacion } from '../ubicaciones/ubicacion.entity.js';
import { VarianteProducto } from '../catalogo/variante-producto.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum.js';

// El kardex — fuente de verdad del inventario. Inmutable: ningún
// movimiento se edita ni se borra; para corregir un error se registra un
// movimiento contrario que apunta al original vía movimientoReversaId
// (mismo criterio que el resto del sistema: pedidos y facturas tampoco
// se editan, se anulan/complementan).
@Entity({ name: 'movimientos_inventario' })
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ubicacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ubicacion_id' })
  ubicacion: Relation<Ubicacion>;

  @Column({ type: 'uuid', name: 'ubicacion_id' })
  ubicacionId: string;

  @ManyToOne(() => VarianteProducto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variante_id' })
  variante: Relation<VarianteProducto>;

  @Column({ type: 'uuid', name: 'variante_id' })
  varianteId: string;

  @Column({ type: 'enum', enum: TipoMovimientoInventario })
  tipo: TipoMovimientoInventario;

  // Positivo entra, negativo sale — en pares.
  @Column({ type: 'integer' })
  cantidad: number;

  // Apunta al traspaso, pedido/factura, etc. que originó el movimiento.
  // Polimórfico a propósito (no FK real) — mismo patrón que origenTipo/
  // origenId de AsientoContable en Conejo Aquatics.
  @Column({ type: 'varchar', length: 40, name: 'referencia_tipo', nullable: true })
  referenciaTipo: string | null;

  @Column({ type: 'uuid', name: 'referencia_id', nullable: true })
  referenciaId: string | null;

  @Column({ type: 'uuid', name: 'movimiento_reversa_id', nullable: true })
  movimientoReversaId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  creadoPor: Relation<Usuario>;

  @Column({ type: 'uuid', name: 'creado_por' })
  creadoPorId: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
