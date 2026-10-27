import { IsBoolean, IsDefined, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class EnrolarDispositivoDto {
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  codigo: string;

  @IsString()
  @MaxLength(20)
  pin: string;

  @IsDefined()
  @IsObject()
  llavePublica: Record<string, unknown>;

  @IsString()
  @MaxLength(160)
  etiqueta: string;
}

export class PedirRetoDto {
  @IsString()
  @MaxLength(60)
  accesoId: string;
}

// Lo que el celular manda para demostrar quién es: reto + firma de (reto|datos) con la llave del aparato + PIN.
export class IdentificarDto {
  @IsString()
  @MaxLength(60)
  accesoId: string;

  @IsString()
  @MaxLength(200)
  reto: string;

  @IsString()
  @MaxLength(300)
  firma: string;

  @IsString()
  @MaxLength(20)
  pin: string;

  // Texto exacto que se firmó junto con el reto (JSON con lo que la persona quiere hacer).
  @IsString()
  @MaxLength(2000)
  datos: string;
}

export class LiberarAccesoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;
}

export class GuardarPuntoMarcaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre: string;

  @IsIn(['empresa', 'tienda'])
  tipo: 'empresa' | 'tienda';

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud?: number | null;

  @IsInt()
  @Min(20)
  @Max(2000)
  radioMetros: number;

  @IsBoolean()
  requiereQr: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class PantallaQrDto {
  @IsString()
  @MaxLength(60)
  puntoId: string;

  @IsString()
  @MaxLength(100)
  token: string;
}
