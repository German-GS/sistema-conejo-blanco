import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

// Contador atómico del secuencial de comprobantes por (sucursal, terminal,
// tipo) — mismo patrón que ConsecutivoContador de facturación en Conejo
// Motors. El secuencial (10 dígitos) del consecutivo de Hacienda debe ser
// único y sin huecos dentro de cada combinación.
@Entity({ name: 'factura_contadores' })
@Unique(['sucursal', 'terminal', 'tipo'])
export class FacturaContador {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 3 })
  sucursal: string;

  @Column({ type: 'varchar', length: 5 })
  terminal: string;

  @Column({ type: 'varchar', length: 2 })
  tipo: string;

  @Column({ type: 'bigint', default: 0 })
  ultimo: string;
}
