import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { OcultarSiNoAutorizado, RequireRole } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { UsoService } from './uso.service.js';

class EventoUsoDto {
  @IsString() @MaxLength(30) tipo: string;
  @IsString() @MaxLength(160) clave: string;
}
class RegistrarUsoDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => EventoUsoDto) eventos: EventoUsoDto[];
}

@Controller('uso')
@UseGuards(JwtAuthGuard)
export class UsoController {
  constructor(private readonly uso: UsoService) {}

  // Cualquier cuenta con sesión reporta su propio uso (solo pantalla, búsqueda sin resultado y error de llamada; nunca contenido).
  @Post()
  async registrar(@Body() dto: RegistrarUsoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return { registrados: await this.uso.registrar(usuario, dto.eventos) };
  }

  // El resumen es exclusivo del administrador del sistema.
  @Get('resumen')
  @OcultarSiNoAutorizado()
  @UseGuards(RolesGuard)
  @RequireRole(Rol.SISTEMA)
  resumen(@Query('dias') dias?: string) {
    return this.uso.resumen(Number(dias) || 30);
  }
}
