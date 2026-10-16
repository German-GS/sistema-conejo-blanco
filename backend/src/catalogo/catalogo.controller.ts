import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { CatalogoService } from './catalogo.service.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { CrearVarianteDto } from './dto/crear-variante.dto.js';
import { ActualizarVarianteDto } from './dto/actualizar-variante.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RequireRole } from '../auth/decorators/roles.decorator.js';
import { Rol } from '../common/enums/rol.enum.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permiso } from '../common/enums/permiso.enum.js';
import { EXTENSION_POR_MIME, verificarArchivoSubido } from '../common/utils/subida.util.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.interface.js';

// Las fotos de producto se guardan en disco (no en la base) y se sirven
// como archivo estático — ver app.useStaticAssets en main.ts. La carpeta
// se crea sola si todavía no existe (ej. primer arranque en un ambiente
// nuevo).
const CARPETA_FOTOS = './uploads/productos';
if (!existsSync(CARPETA_FOTOS)) {
  mkdirSync(CARPETA_FOTOS, { recursive: true });
}

const TIPOS_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO_FOTO = 8 * 1024 * 1024; // 8 MB

// Quita `costo` de todas las variantes de la respuesta si el usuario no
// puede gestionar el catálogo.
function ocultarCosto<T>(datos: T, usuario: UsuarioAutenticado): T {
  if (usuario.permisos.has(Permiso.CATALOGO_GESTIONAR)) return datos;
  const limpiar = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(limpiar);
    if (n && typeof n === 'object') {
      const copia: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k !== 'costo') copia[k] = limpiar(v);
      }
      return copia;
    }
    return n;
  };
  return limpiar(datos) as T;
}

@Controller('catalogo/productos')
@UseGuards(JwtAuthGuard)
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  // Cualquier cuenta de personal puede consultar el catálogo (lo necesita
  // el vendedor para armar el pedido). Crear/editar necesita catalogo.gestionar.
  // El costo de producción es dato interno: solo lo ve quien gestiona el
  // catálogo (el vendedor no lo necesita para armar pedidos).
  @Get()
  async listar(@CurrentUser() usuario: UsuarioAutenticado, @Query('buscar') buscar?: string) {
    const productos =
      buscar && buscar.trim().length > 0
        ? await this.catalogoService.buscarProductos(buscar.trim())
        : await this.catalogoService.listarProductos();
    return ocultarCosto(productos, usuario);
  }

  @Get(':id')
  async buscarPorId(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return ocultarCosto(await this.catalogoService.buscarProductoPorIdOFallar(id), usuario);
  }

  @Get(':id/ediciones')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  listarEdiciones(@Param('id') id: string) {
    return this.catalogoService.listarEdiciones(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  crear(@Body() dto: CrearProductoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogoService.crearProducto(dto, usuario.id);
  }

  // Eliminar un producto (solo si nunca se usó): gerencia y administrador del sistema.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @RequireRole(Rol.ADMINISTRACION)
  async eliminar(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogoService.eliminarProducto(id);
    return { eliminado: true };
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  actualizar(@Param('id') id: string, @Body() dto: ActualizarProductoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogoService.actualizarProducto(id, dto, usuario.id);
  }

  @Post(':id/variantes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  crearVariante(
    @Param('id') productoId: string,
    @Body() dto: Omit<CrearVarianteDto, 'productoId'>,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogoService.crearVariante({ ...dto, productoId }, usuario.id);
  }

  @Patch('variantes/:varianteId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  actualizarVariante(
    @Param('varianteId') varianteId: string,
    @Body() dto: ActualizarVarianteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogoService.actualizarVariante(varianteId, dto, usuario.id);
  }

  // Foto de referencia del producto (no del color) — para que el
  // vendedor le muestre al cliente cómo se ve el estilo. Pueden subirse
  // varias; el archivo queda en disco con un nombre random (nunca el
  // nombre original, evita colisiones y problemas de caracteres raros).
  @Post(':id/fotos')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: CARPETA_FOTOS,
        filename: (_req, archivo, cb) => cb(null, `${randomUUID()}${EXTENSION_POR_MIME[archivo.mimetype] ?? ''}`),
      }),
      limits: { fileSize: TAMANO_MAXIMO_FOTO },
      fileFilter: (_req, archivo, cb) => {
        if (!TIPOS_IMAGEN_PERMITIDOS.includes(archivo.mimetype)) {
          cb(new BadRequestException('Solo se aceptan imágenes JPG, PNG o WEBP.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirFoto(@Param('id') productoId: string, @UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) {
      throw new BadRequestException('No se recibió ninguna imagen.');
    }
    verificarArchivoSubido(archivo);
    return this.catalogoService.agregarFoto(productoId, `/uploads/productos/${archivo.filename}`);
  }

  @Delete('fotos/:fotoId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permiso.CATALOGO_GESTIONAR)
  eliminarFoto(@Param('fotoId') fotoId: string) {
    return this.catalogoService.eliminarFoto(fotoId);
  }
}
