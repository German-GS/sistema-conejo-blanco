import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { CodigoDosPasosDto, DesactivarDosPasosDto, LoginDosPasosDto } from './dto/dos-pasos.dto.js';
import { CambiarPasswordDto } from '../usuarios/dto/cambiar-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { UsuarioAutenticado } from './usuario-autenticado.interface.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usuariosService: UsuariosService,
    private readonly bitacora: BitacoraService,
  ) {}

  // 10 intentos por minuto por IP (además del bloqueo por cuenta).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, req.ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() usuario: UsuarioAutenticado) {
    // Set -> array acá: mismo motivo que en AuthService.login.
    return { ...usuario, permisos: [...usuario.permisos] };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async cambiarPassword(@Body() dto: CambiarPasswordDto, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    const actualizado = await this.usuariosService.cambiarPassword(usuario.id, dto);
    await this.bitacora.registrar({ accion: 'clave_cambiada', usuarioId: usuario.id, usuarioEmail: usuario.email, objetivo: usuario.email, ip: req.ip });
    // El cambio invalida los tokens anteriores; se devuelve uno nuevo para
    // que esta sesión siga abierta.
    return { actualizado: true, accessToken: await this.authService.emitirToken(actualizado) };
  }

  // Segundo paso del login para cuentas con verificación en dos pasos.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login-2fa')
  loginDosPasos(@Body() dto: LoginDosPasosDto, @Req() req: Request) {
    return this.authService.loginDosPasos(dto.ticket, dto.codigo, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('dos-pasos/iniciar')
  @UseGuards(JwtAuthGuard)
  iniciarDosPasos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.authService.iniciarDosPasos(usuario.id, usuario.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('dos-pasos/activar')
  @UseGuards(JwtAuthGuard)
  activarDosPasos(@Body() dto: CodigoDosPasosDto, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.authService.activarDosPasos(usuario.id, dto.codigo, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('dos-pasos/desactivar')
  @UseGuards(JwtAuthGuard)
  desactivarDosPasos(@Body() dto: DesactivarDosPasosDto, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.authService.desactivarDosPasos(usuario.id, usuario.rol, dto.password, dto.codigo, req.ip);
  }
}
