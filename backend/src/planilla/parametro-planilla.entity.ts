import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoParametroPlanilla } from './planilla.enums.js';

// Porcentajes, tramos de renta, créditos, jornada y factores de pago —
// todo editable por administración (mismo criterio que
// parametros_planilla de Conejo Motors).
@Entity({ name: 'planilla_parametros' })
export class ParametroPlanilla {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  nombre: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  valor: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'enum', enum: TipoParametroPlanilla })
  tipo: TipoParametroPlanilla;
}
