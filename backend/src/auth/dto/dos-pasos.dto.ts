import { IsString, Matches, MaxLength } from 'class-validator';

const CODIGO = /^\s*\d{3}\s?\d{3}\s*$/;

export class LoginDosPasosDto {
  @IsString()
  @MaxLength(2000)
  ticket: string;

  @Matches(CODIGO, { message: 'El código son 6 dígitos.' })
  codigo: string;
}

export class CodigoDosPasosDto {
  @Matches(CODIGO, { message: 'El código son 6 dígitos.' })
  codigo: string;
}

export class DesactivarDosPasosDto {
  @IsString()
  @MaxLength(200)
  password: string;

  @Matches(CODIGO, { message: 'El código son 6 dígitos.' })
  codigo: string;
}
