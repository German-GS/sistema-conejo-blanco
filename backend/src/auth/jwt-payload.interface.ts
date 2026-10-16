import type { Rol } from '../common/enums/rol.enum.js';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: Rol;
  // versionToken del usuario al emitir el token (ver Usuario.versionToken).
  v?: number;
}
