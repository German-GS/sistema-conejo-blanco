import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Puestos de trabajo predefinidos (Gerente, Operador, Colaborador…). El
// indicador «de confianza» sigue el art. 143 del Código de Trabajo: gerentes,
// administradores y demás cargos de confianza, o que trabajan sin
// fiscalización inmediata, quedan fuera del límite de jornada — no se les
// descuentan horas faltantes ni se les pagan horas extra; reciben su salario
// fijo. Al elegir el puesto en un empleado, ese indicador se copia al
// empleado y ahí se puede ajustar.
@Entity({ name: 'planilla_puestos' })
export class PuestoPlanilla {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  nombre: string;

  @Column({ type: 'boolean', name: 'es_confianza', default: false })
  esConfianza: boolean;

  // Sector donde se paga al que ocupa el puesto: define cómo se calcula el
  // descanso semanal (domingo) y el valor de la hora. Ver calculo.ts.
  @Column({ type: 'varchar', length: 10, default: 'industria' })
  sector: 'industria' | 'comercio';

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
