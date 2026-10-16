import { IsOptional, IsString, MaxLength } from 'class-validator';

// Todos opcionales: se manda solo lo que cambió. El logo se sube aparte
// (POST /configuracion/factura/logo), no por acá.
export class ActualizarConfiguracionFacturaDto {
  @IsOptional() @IsString() @MaxLength(160) razonSocial?: string;
  @IsOptional() @IsString() @MaxLength(30) cedulaJuridica?: string;
  @IsOptional() @IsString() @MaxLength(300) descripcionActividad?: string;
  @IsOptional() @IsString() @MaxLength(200) actividadEconomica?: string;
  @IsOptional() @IsString() @MaxLength(160) correo?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @IsString() @MaxLength(4000) notasPredeterminadas?: string;
  @IsOptional() @IsString() @MaxLength(8000) terminosCondiciones?: string;
  @IsOptional() @IsString() @MaxLength(2000) leyendaAutorizacion?: string;
}
