import { join } from 'node:path';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { ActividadService } from './sistema/actividad.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Detrás de Cloud Run / proxy: sin esto todas las IP serían la del balanceador
  // y el límite de peticiones (ThrottlerGuard) se aplicaría a todos juntos.
  app.set('trust proxy', 1);

  // Fotos de producto (ver CatalogoController) — archivos en disco,
  // servidos tal cual bajo /uploads.
  // Los comprobantes de justificación son datos sensibles: nunca como archivo
  // público, solo por el endpoint autenticado de planilla.
  app.use('/uploads/justificantes', (_req: unknown, res: { status: (c: number) => { end: () => void } }) => res.status(404).end());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // crossOriginResourcePolicy en 'same-origin' (el default de helmet) le
  // bloquearía al navegador cargar estas fotos desde el frontend — vive
  // en otro puerto, así que para el navegador es otro origen aunque sea
  // el mismo host. 'cross-origin' es seguro acá: son fotos de catálogo,
  // no hay nada sensible que proteger con esa política.
  // Registro de actividad de todo el sistema (solo lo ve el administrador del sistema).
  app.use(app.get(ActividadService).middleware());
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:5175')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  const port = config.get<number>('PORT', 3101);
  await app.listen(port);
  console.log(`Conejo Blanco API escuchando en http://localhost:${port}`);
}
await bootstrap();
