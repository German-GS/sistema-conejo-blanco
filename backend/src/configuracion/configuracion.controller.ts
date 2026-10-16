import { Permiso } from '../common/enums/permiso.enum.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ConfiguracionService } from './configuracion.service.js';
import { ActualizarConfiguracionFacturaDto } from './dto/actualizar-configuracion-factura.dto.js';
import { ActualizarConfiguracionDescuentoDto } from './dto/actualizar-configuracion-descuento.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import { EXTENSION_POR_MIME, verificarArchivoSubido } from '../common/utils/subida.util.js';

const CARPETA_LOGO = './uploads/empresa';
if (!existsSync(CARPETA_LOGO)) {
  mkdirSync(CARPETA_LOGO, { recursive: true });
}
const TIPOS_LOGO = ['image/jpeg', 'image/png', 'image/webp'];

@Controller('configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  // Cualquier cuenta de personal puede leerlo — el vendedor lo necesita
  // para saber hasta cuánto puede descontar antes de mandar el pedido
  // (la validación real y definitiva siempre la hace el backend).
  @Get('descuentos')
  obtenerDescuento() {
    return this.configuracionService.obtenerDescuento();
  }

  // El tope general de descuento es una decisión de negocio — igual que
  // la gestión de cuentas de personal, queda exclusiva de Administración,
  // no delegable por permiso.
  @Patch('descuentos')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  actualizarDescuento(@Body() dto: ActualizarConfiguracionDescuentoDto) {
    return this.configuracionService.actualizarDescuento(dto);
  }

  // Encabezado de las facturas: lo lee cualquier cuenta de personal (el
  // formulario de factura lo necesita para mostrarlo), lo edita solo
  // Administración.
  @Get('factura')
  obtenerFactura() {
    return this.configuracionService.obtenerFactura();
  }

  @Patch('factura')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  actualizarFactura(@Body() dto: ActualizarConfiguracionFacturaDto) {
    return this.configuracionService.actualizarFactura(dto);
  }

  // Sube el logo (nombre random, nunca el original — igual que las fotos
  // de producto). Las facturas ya emitidas conservan el logo con el que
  // salieron, por eso el archivo anterior no se borra.
  @Post('factura/logo')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: CARPETA_LOGO,
        filename: (_req, archivo, cb) => cb(null, `${randomUUID()}${EXTENSION_POR_MIME[archivo.mimetype] ?? ''}`),
      }),
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, archivo, cb) => {
        if (!TIPOS_LOGO.includes(archivo.mimetype)) {
          cb(new BadRequestException('El logo debe ser una imagen JPG, PNG o WEBP.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirLogo(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('No se recibió ninguna imagen.');
    verificarArchivoSubido(archivo);
    return this.configuracionService.guardarLogo(`/uploads/empresa/${archivo.filename}`);
  }

  @Delete('factura/logo')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CONFIGURACION_GESTIONAR)
  quitarLogo() {
    return this.configuracionService.quitarLogo();
  }
}
