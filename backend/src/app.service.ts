import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  estado() {
    return { sistema: 'Conejo Blanco API', ok: true };
  }
}
