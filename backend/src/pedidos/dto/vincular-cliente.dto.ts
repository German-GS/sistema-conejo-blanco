import { IsUUID } from 'class-validator';

export class VincularClienteDto {
  @IsUUID()
  clienteId: string;
}
