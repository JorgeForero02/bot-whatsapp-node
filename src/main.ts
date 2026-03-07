import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );

  const instance = app.getHttpAdapter().getInstance();

  await instance.register(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@fastify/multipart') as Parameters<typeof instance.register>[0],
    { limits: { fileSize: 10 * 1024 * 1024 } },
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


  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application listening on port ${port}`);
}

void bootstrap();
