import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoUbicacion } from '../common/enums/tipo-ubicacion.enum.js';

// Con 2-5 tiendas fijas no hace falta jerarquía compleja (zonas, regiones)
// — una tabla plana basta. Todo el stock de la empresa vive repartido
// entre estas ubicaciones; no existe "stock global" (ver StockUbicacion).
@Entity({ name: 'ubicaciones' })
export class Ubicacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TipoUbicacion })
  tipo: TipoUbicacion;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  // Corto, usado en folios de traspaso/pedido (ej. "T01", "T02", "BD", "FAB").
  @Column({ type: 'varchar', length: 10, unique: true })
  codigo: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  // true solo para Tienda (y Fábrica si algún día hay venta de outlet).
  @Column({ type: 'boolean', name: 'permite_venta', default: false })
  permiteVenta: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
