import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(160)
  email: string;

  // MaxLength razonable para no mandarle a bcrypt.compare un string
  // gigante — no hay forma de que una contraseña real sea así de larga.
  @IsString()
  @MaxLength(200)
  password: string;
}
