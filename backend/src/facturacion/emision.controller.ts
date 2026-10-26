import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Modulo } from '../auth/decorators/modulo.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { EmisionService } from './emision.service.js';
import { EmisorConfigService } from './emisor-config.service.js';

class ActualizarEmisorDto {
  @IsOptional() @IsString() @MaxLength(200) razonSocial?: string;
  @IsOptional() @IsString() @MaxLength(200) nombreComercial?: string;
  @IsOptional() @IsString() @MaxLength(20) cedula?: string;
  @IsOptional() @Matches(/^0[1-4]$/, { message: 'Tipo de identificación no válido.' }) tipoIdentificacion?: string;
  @IsOptional() @Matches(/^(\d{6})?$/, { message: 'La actividad económica tiene 6 dígitos.' }) actividadEconomica?: string;
  @IsOptional() @IsString() @MaxLength(20) proveedorSistemas?: string;
  @IsOptional() @Matches(/^[1-7]$/, { message: 'Provincia: un número del 1 al 7.' }) provincia?: string;
  @IsOptional() @Matches(/^\d{2}$/, { message: 'El cantón son 2 dígitos.' }) canton?: string;
  @IsOptional() @Matches(/^\d{2}$/, { message: 'El distrito son 2 dígitos.' }) distrito?: string;
  @IsOptional() @IsString() @MaxLength(250) otrasSenas?: string;
  @IsOptional() @IsString() @MaxLength(20) telefono?: string;
  @IsOptional() @IsString() @MaxLength(160) correo?: string;
  @IsOptional() @Matches(/^(\d{13})?$/, { message: 'El CABYS tiene 13 dígitos.' }) cabysPredeterminado?: string;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: 'La fecha debe ser YYYY-MM-DD.' }) emisionDesde?: string;
}

class EnviarPendientesDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
}

// Facturación electrónica: preparación, envío a Hacienda, seguimiento y re-emisión.
@Modulo('facturacion')
@Controller('facturacion-electronica')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permiso.FACTURACION_GESTIONAR)
export class EmisionController {
  constructor(
    private readonly emision: EmisionService,
    private readonly emisor: EmisorConfigService,
  ) {}

  @Get('preparacion')
  preparacion() {
    return this.emision.preparacion();
  }

  @Put('emisor')
  async actualizarEmisor(@Body() dto: ActualizarEmisorDto) {
    await this.emisor.actualizar(dto);
    return this.emision.preparacion();
  }

  @Post('enviar-pendientes')
  enviarPendientes(@Body() dto: EnviarPendientesDto) {
    return this.emision.enviarPendientes(dto.ids);
  }

  @Post('facturas/:id/enviar')
  enviar(@Param('id', ParseUUIDPipe) id: string) {
    return this.emision.enviar(id);
  }

  @Post('facturas/:id/consultar')
  consultar(@Param('id', ParseUUIDPipe) id: string) {
    return this.emision.consultar(id);
  }

  @Post('facturas/:id/reemitir')
  reemitir(@Param('id', ParseUUIDPipe) id: string) {
    return this.emision.reemitir(id);
  }

  @Post('facturas/:id/reenviar-correo')
  reenviarCorreo(@Param('id', ParseUUIDPipe) id: string) {
    return this.emision.reenviarCorreo(id);
  }
}
