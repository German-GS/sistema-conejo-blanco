import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Empleado } from '../planilla/empleado.entity.js';
import { Usuario } from './usuario.entity.js';
import { UsuarioPermiso } from './usuario-permiso.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { UsuariosController } from './usuarios.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, UsuarioPermiso, Empleado])],
  providers: [UsuariosService],
  controllers: [UsuariosController],
  exports: [UsuariosService],
})
export class UsuariosModule {}
