import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { FrecuenciaPago, TipoSalario } from './planilla.enums.js';
import type { HorarioSemanal } from './horario.js';

// Persona que cobra planilla. Distinto de Usuario: la mayoría de la gente
// de la fábrica nunca inicia sesión en el sistema.
@Entity({ name: 'planilla_empleados' })
export class Empleado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // El número con que el reloj de huella identifica a la persona (en la
  // tarjeta de tiempo sale como 000000001). Se guarda sin ceros a la
  // izquierda para que "000000001", "1" y "01" sean la misma persona.
  @Column({ type: 'varchar', length: 20, name: 'numero_reloj', unique: true })
  numeroReloj: string;

  @Column({ type: 'varchar', length: 160 })
  nombre: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cedula: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  puesto: string | null;

  @Column({ type: 'date', name: 'fecha_ingreso', nullable: true })
  fechaIngreso: string | null;

  // Lo pactado al contratar: lo define quien contrata (administración).
  @Column({ type: 'enum', enum: TipoSalario, name: 'tipo_salario' })
  tipoSalario: TipoSalario;

  // Mensual, semanal o por hora según tipoSalario.
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'monto_salario' })
  montoSalario: string;

  @Column({ type: 'enum', enum: FrecuenciaPago, name: 'frecuencia_pago' })
  frecuenciaPago: FrecuenciaPago;

  // Horario estándar — se usa cuando una marca falta y administración
  // decide "pagar con el horario normal" (ver TipoResolucionDia).
  // Horario propio por día (lunes a sábado). Vacío = se usa el horario de la
  // fábrica (Parámetros → Horario de la fábrica).
  @Column({ type: 'jsonb', name: 'horario_semanal', nullable: true })
  horarioSemanal: HorarioSemanal | null;

  @Column({ type: 'varchar', length: 5, name: 'horario_entrada', default: '08:00' })
  horarioEntrada: string;

  @Column({ type: 'varchar', length: 5, name: 'horario_salida', default: '17:00' })
  horarioSalida: string;

  @Column({ type: 'varchar', length: 5, name: 'horario_salida_sabado', default: '13:00' })
  horarioSalidaSabado: string;

  // Horas ordinarias por semana de este empleado. Vacío = las del sistema
  // (48). Define su valor por hora (salario semanal ÷ horas) y cuántas
  // horas al día son ordinarias antes de contar hora extra (horas ÷ 6).
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'horas_semana', nullable: true })
  horasSemana: string | null;

  // false = no marca el almuerzo en el reloj (anda en ruta, el marcador está
  // en la fábrica): su almuerzo no se mide.
  @Column({ type: 'boolean', name: 'almuerzo_marca', default: true })
  almuerzoMarca: boolean;

  // Minutos de almuerzo que se descuentan cuando el día trae solo entrada y
  // salida. Vacío = los del sistema (60). 0 = no se descuenta almuerzo.
  @Column({ type: 'integer', name: 'almuerzo_minutos', nullable: true })
  almuerzoMinutos: number | null;

  // false = no usa el reloj de huella (ej. gerencia): su jornada se paga
  // completa y no se le pide marcas ni aparece como «sin datos».
  // Puesto elegido de la lista (solo para mostrar y agrupar); el texto del
  // puesto vive en `puesto`.
  @Column({ type: 'uuid', name: 'puesto_id', nullable: true })
  puestoId: string | null;

  // Cargo de confianza (art. 143 del Código de Trabajo): sin jornada fija, sin
  // horas extra ni descuento por horas faltantes. Se copia del puesto al
  // elegirlo, y se puede ajustar por empleado.
  // Cómo se le paga el descanso semanal: 'comercio' (el domingo ya viene
  // incluido en el pago semanal) o 'industria' (solo el tiempo laborado).
  // Se copia del puesto al elegirlo y se puede ajustar. Ver calculo.ts.
  @Column({ type: 'varchar', length: 10, default: 'industria' })
  sector: 'industria' | 'comercio';

  @Column({ type: 'boolean', name: 'es_confianza', default: false })
  esConfianza: boolean;

  // Trabaja en una tienda: no marca en el reloj de la fábrica, así que sus
  // horas se meten a mano por día (Asistencia → Horas de tienda). El archivo
  // del reloj lo omite, y la planilla avisa cuando faltan sus horas.
  @Column({ type: 'boolean', name: 'es_de_tienda', default: false })
  esDeTienda: boolean;

  @Column({ type: 'boolean', name: 'marca_reloj', default: true })
  marcaReloj: boolean;

  // --- Cese de la relación laboral (el empleado queda inactivo) ---
  @Column({ type: 'date', name: 'fecha_cese', nullable: true })
  fechaCese: string | null;

  @Column({ type: 'varchar', length: 40, name: 'tipo_cese', nullable: true })
  tipoCese: string | null;

  @Column({ type: 'varchar', length: 255, name: 'motivo_cese', nullable: true })
  motivoCese: string | null;

  @Column({ type: 'boolean', name: 'tiene_conyuge', default: false })
  tieneConyuge: boolean;

  @Column({ type: 'integer', name: 'cantidad_hijos', default: 0 })
  cantidadHijos: number;

  // Cuenta IBAN para el pago por transferencia (archivo del banco).
  @Column({ type: 'varchar', length: 34, nullable: true })
  iban: string | null;

  // Cómo se le paga: por la planilla web del Banco Popular (archivo TXT) o
  // en efectivo / por otro medio (no entra al archivo del banco).
  @Column({ type: 'varchar', length: 20, name: 'forma_pago', default: 'banco_popular' })
  formaPago: 'banco_popular' | 'efectivo';

  // "Identificador único de cliente" que el Banco Popular le asignó al
  // empleado — lo pide el archivo de la planilla web.
  @Column({ type: 'varchar', length: 20, name: 'identificador_bp', nullable: true })
  identificadorBp: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
