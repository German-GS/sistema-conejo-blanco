import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { PendientesService } from './pendientes.service.js';

@Controller('pendientes')
@UseGuards(JwtAuthGuard)
export class PendientesController {
  constructor(private readonly pendientes: PendientesService) {}

  // «Para hacer hoy» del inicio: se calcula según los permisos de quien pregunta.
  @Get()
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.pendientes.listar(usuario);
  }
}
