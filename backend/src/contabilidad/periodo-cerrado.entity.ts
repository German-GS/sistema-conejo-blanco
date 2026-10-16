import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Un mes contable cerrado: no se pueden registrar ni reversar asientos con
// fecha dentro de ese mes (los reportes de ese período ya no cambian).
// Administración puede reabrirlo si hace falta corregir algo.
@Entity({ name: 'periodos_contables_cerrados' })
export class PeriodoCerrado {
  // 'YYYY-MM'
  @PrimaryColumn({ type: 'varchar', length: 7 })
  periodo: string;

  @Column({ type: 'uuid', name: 'cerrado_por_id', nullable: true })
  cerradoPorId: string | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  notas: string;

  // Asientos de pago que generó el cierre del mes (CCSS, INS, renta, IVA): al
  // reabrir el mes se reversan.
  @Column({ type: 'jsonb', name: 'asientos_cierre', default: () => "'[]'" })
  asientosCierre: string[];

  // Lo que se liquidó al cerrar, para mostrarlo después.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  resumen: Array<{ clave: string; concepto: string; destino: string; monto: number }>;

  @CreateDateColumn({ name: 'cerrado_en' })
  cerradoEn: Date;
}
