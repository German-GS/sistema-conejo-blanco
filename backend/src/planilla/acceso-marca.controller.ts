import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';
import { Rol } from '../common/enums/rol.enum.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { PermisosMetodoGuard } from '../auth/guards/permisos-metodo.guard.js';
import { PermisosPorMetodo } from '../auth/decorators/permisos-metodo.decorator.js';
import { AccesoMarcaService } from './acceso-marca.service.js';
import { EnrolarDispositivoDto, GuardarPuntoMarcaDto, IdentificarDto, LiberarAccesoDto, PantallaQrDto, PedirRetoDto } from './dto/acceso-marca.dto.js';
import { MarcaAppService } from './marca-app.service.js';

// Solo el administrador del sistema administra los celulares y los PIN de marca: ni siquiera la gerencia
// puede liberarlos (así nadie reasigna un celular a otra persona sin dejar rastro en la bitácora).
@Modulo('planilla')
@Controller('planilla/acceso-marca')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRole(Rol.SISTEMA)
export class AccesoMarcaAdminController {
  constructor(private readonly servicio: AccesoMarcaService) {}

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Post(':empleadoId/codigo')
  generarCodigo(@Param('empleadoId', ParseUUIDPipe) empleadoId: string, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.servicio.generarCodigo(empleadoId, usuario, req.ip);
  }

  @Post(':empleadoId/liberar')
  liberar(@Param('empleadoId', ParseUUIDPipe) empleadoId: string, @Body() dto: LiberarAccesoDto, @CurrentUser() usuario: UsuarioAutenticado, @Req() req: Request) {
    return this.servicio.liberar(empleadoId, dto.motivo, usuario, req.ip);
  }
}

// Puntos de marca (la empresa, cada tienda) y su pantalla con el QR: solo el administrador del sistema.
@Modulo('planilla')
@Controller('planilla/puntos-marca')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRole(Rol.SISTEMA)
export class PuntosMarcaAdminController {
  constructor(private readonly marcas: MarcaAppService) {}

  @Get()
  listar() {
    return this.marcas.listarPuntos();
  }

  @Post()
  crear(@Body() dto: GuardarPuntoMarcaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.marcas.crearPunto(dto, usuario);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarPuntoMarcaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.marcas.actualizarPunto(id, dto, usuario);
  }

  @Post(':id/pantalla')
  nuevaPantalla(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.marcas.nuevaPantalla(id, usuario);
  }
}

// Las marcas hechas desde el celular, para que la gerencia y administración las revisen (con ubicación y distancia).
@Modulo('planilla')
@Controller('planilla/marcas-app')
@UseGuards(JwtAuthGuard, PermisosMetodoGuard)
@PermisosPorMetodo(Permiso.PLANILLA_VER, Permiso.PLANILLA_GESTIONAR)
export class MarcasAppController {
  constructor(private readonly marcas: MarcaAppService) {}

  @Get()
  listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('revisar') revisar?: string) {
    return this.marcas.listar(desde, hasta, revisar === '1');
  }
}

// Lo que usa el celular del empleado: no hay sesión ni cuenta; cada acción se prueba con el celular + PIN.
@Controller('marca')
export class MarcaPublicaController {
  constructor(
    private readonly servicio: AccesoMarcaService,
    private readonly marcasApp: MarcaAppService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('enrolar')
  enrolar(@Body() dto: EnrolarDispositivoDto, @Req() req: Request) {
    return this.servicio.enrolar(dto, req.ip);
  }

  // Muchos empleados marcan a la vez desde el mismo wifi (misma IP): el límite es holgado; los intentos de PIN se frenan por empleado.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reto')
  reto(@Body() _dto: PedirRetoDto) {
    return this.servicio.pedirReto();
  }

  // Marcar: celular + PIN + QR de la pantalla + ubicación. La hora la pone el servidor.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('marcar')
  marcar(@Body() dto: IdentificarDto, @Req() req: Request) {
    return this.marcasApp.marcar(dto, req.ip);
  }

  // La tablet de un punto pide el QR vigente con su token.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('pantalla/qr')
  qr(@Body() dto: PantallaQrDto) {
    return this.marcasApp.qrActual(dto.puntoId, dto.token);
  }

  // Prueba de identidad (celular + PIN): la usa la propia pantalla para confirmar que el registro funciona.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('identificar')
  async identificar(@Body() dto: IdentificarDto, @Req() req: Request) {
    const { empleado } = await this.servicio.identificar(dto, req.ip);
    return { ok: true, empleado: { nombre: empleado.nombre } };
  }
}
