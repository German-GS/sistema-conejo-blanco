import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
import { Empleado } from './empleado.entity.js';
import type { LlavePublicaJwk } from './acceso-marca-cripto.js';

// Cómo marca asistencia un empleado desde su celular: un PIN suyo y UN celular registrado.
// Solo el administrador del sistema puede liberar el celular o el PIN (generando un código nuevo).
@Entity({ name: 'planilla_acceso_marca' })
export class AccesoMarca {
  // También es el identificador público que el celular guarda para decir «soy yo».
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Relation<Empleado>;

  @Column({ type: 'uuid', name: 'empleado_id', unique: true })
  empleadoId: string;

  // Huella (sha256) del código de activación vigente; el código en sí nunca se guarda.
  @Column({ type: 'varchar', length: 64, name: 'codigo_huella', nullable: true })
  codigoHuella: string | null;

  @Column({ type: 'timestamptz', name: 'codigo_vence', nullable: true })
  codigoVence: Date | null;

  @Column({ type: 'varchar', name: 'pin_hash', nullable: true, select: false })
  pinHash: string | null;

  @Column({ type: 'int', name: 'pin_intentos', default: 0 })
  pinIntentos: number;

  @Column({ type: 'timestamptz', name: 'bloqueado_hasta', nullable: true })
  bloqueadoHasta: Date | null;

  // Llave pública del celular registrado. Null = ningún celular registrado.
  @Column({ type: 'jsonb', name: 'llave_publica', nullable: true })
  llavePublica: LlavePublicaJwk | null;

  // Texto corto para reconocer el aparato (ej. «iPhone · Safari»); lo manda el propio celular.
  @Column({ type: 'varchar', length: 160, name: 'dispositivo_etiqueta', nullable: true })
  dispositivoEtiqueta: string | null;

  @Column({ type: 'timestamptz', name: 'registrado_en', nullable: true })
  registradoEn: Date | null;

  @Column({ type: 'timestamptz', name: 'ultimo_uso_en', nullable: true })
  ultimoUsoEn: Date | null;

  // Marca de tiempo del último reto usado: un reto ya usado no se acepta otra vez.
  @Column({ type: 'bigint', name: 'ultimo_reto', default: 0, transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) } })
  ultimoReto: number;

  @Column({ type: 'uuid', name: 'generado_por_id', nullable: true })
  generadoPorId: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
