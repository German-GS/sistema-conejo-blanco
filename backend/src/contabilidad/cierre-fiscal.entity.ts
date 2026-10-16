import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Un año fiscal (enero–diciembre) cerrado: ingresos y gastos saldados contra
// utilidades acumuladas y el impuesto de renta provisionado.
@Entity({ name: 'cierres_fiscales' })
export class CierreFiscal {
  @PrimaryColumn({ type: 'int' })
  anio: number;

  @Column({ type: 'uuid', name: 'cerrado_por_id', nullable: true })
  cerradoPorId: string | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  notas: string;

  // Asiento del impuesto y asiento de cierre de resultados.
  @Column({ type: 'jsonb', name: 'asientos_cierre', default: () => "'[]'" })
  asientosCierre: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  resumen: Record<string, number | string>;

  @CreateDateColumn({ name: 'cerrado_en' })
  cerradoEn: Date;
}
