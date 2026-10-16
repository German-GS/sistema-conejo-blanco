import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { HorarioSemanal } from './horario.js';

// Horario de la fábrica por día (una sola fila, id 'general'). Lo usan todos
// los empleados que no tienen un horario propio ni un contrato especial de
// horas por semana.
@Entity({ name: 'planilla_horario_base' })
export class HorarioBase {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'jsonb' })
  horario: HorarioSemanal;
}
