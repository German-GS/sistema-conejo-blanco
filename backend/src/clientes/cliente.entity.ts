import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TipoIdentificacion } from '../common/enums/tipo-identificacion.enum.js';
import { Provincia } from '../common/enums/provincia.enum.js';

// Un cliente del negocio (tienda, comercio o persona que compra al por
// mayor/detalle). No tiene login — lo gestiona administración y lo
// selecciona el vendedor al armar un pedido.
//
// nombre/cedula/teléfono son obligatorios: es lo mínimo para poder
// contactar al cliente. tipoIdentificacion/email también son
// obligatorios porque son datos que Hacienda va a pedir el día que este
// cliente reciba una Factura Electrónica (fase de facturación del
// diseño grande, sección 7) — pedirlos desde ahora en el alta evita
// tener que perseguir al cliente por esos datos más adelante.
@Entity({ name: 'clientes' })
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  nombre: string;

  @Column({ type: 'enum', enum: TipoIdentificacion, name: 'tipo_identificacion' })
  tipoIdentificacion: TipoIdentificacion;

  @Column({ type: 'varchar', length: 40 })
  cedula: string;

  @Column({ type: 'varchar', length: 40 })
  telefono: string;

  @Column({ type: 'varchar', length: 160 })
  email: string;

  // "Otras señas" en términos de Hacienda — sin catálogo de
  // cantón/distrito por ahora, texto libre.
  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion: string | null;

  // Provincia del cliente — para filtrar reportes (ej. facturas por
  // vencer) por zona. Nula si todavía no se capturó.
  @Column({ type: 'enum', enum: Provincia, nullable: true })
  provincia: Provincia | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  // Descuento por defecto para este cliente (0-100), a criterio de
  // administración — ej. un cliente que compra mucho siempre recibe 10%.
  // Nulo = sin descuento asignado. Se aplica como sugerencia al armar el
  // pedido; el vendedor puede ajustarlo dentro del tope permitido (ver
  // ConfiguracionDescuento y PedidosService).
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'descuento_porcentaje', nullable: true })
  descuentoPorcentaje: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
