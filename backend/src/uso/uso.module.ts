import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsoEvento } from './uso-evento.entity.js';
import { UsoController } from './uso.controller.js';
import { UsoService } from './uso.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UsoEvento])],
  providers: [UsoService],
  controllers: [UsoController],
})
export class UsoModule {}
