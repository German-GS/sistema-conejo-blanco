import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ActualizarBancoPopularDto {
  @IsOptional() @IsString() @MaxLength(120) nombreEmpresa?: string;

  @IsOptional() @Matches(/^\d{1,20}$/, { message: 'El número de patrono son solo números.' })
  numeroPatrono?: string;

  @IsOptional() @Matches(/^\d{9,12}$/, { message: 'La cédula jurídica son solo números (sin guiones).' })
  cedulaPatrono?: string;

  @IsOptional() @Matches(/^\d{1,20}$/, { message: 'El identificador único de cliente son solo números.' })
  identificadorCliente?: string;

  @IsOptional() @IsInt() @IsIn([1, 2]) convenio?: number;

  @IsOptional() @Matches(/^CR\d{20}$/i, { message: 'El IBAN debe ser CR seguido de 20 dígitos (sin espacios).' })
  cuentaPatrono?: string;

  @IsOptional() @IsIn(['CRC', 'USD']) moneda?: string;
}
