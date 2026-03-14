import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );

  const instance = app.getHttpAdapter().getInstance();

  await instance.register(
    require('@fastify/rate-limit') as Parameters<typeof instance.register>[0],
    {
      max: 100,
      timeWindow: '1 minute',
      allowList: ['127.0.0.1', '::1'],
    },
  );

  await instance.register(
    require('@fastify/multipart') as Parameters<typeof instance.register>[0],
    { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } },
  );

  await instance.register(
    require('@fastify/static') as Parameters<typeof instance.register>[0],
    {
      root: join(__dirname, '..', 'public'),
      prefix: '/',
      decorateReply: false,
    },
  );

  await instance.register(
    require('@fastify/view') as Parameters<typeof instance.register>[0],
    {
      engine: { handlebars: require('handlebars') as Record<string, unknown> },
      root: join(__dirname, '..', 'views'),
      layout: './layout.hbs',
      options: { partials: {} },
    },
  );

  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application listening on port ${port}`);
}

void bootstrap();
