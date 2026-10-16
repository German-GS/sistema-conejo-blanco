import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bitacora } from './bitacora.entity.js';
import { BitacoraService } from './bitacora.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Bitacora])],
  providers: [BitacoraService],
  exports: [BitacoraService],
})
export class BitacoraModule {}
