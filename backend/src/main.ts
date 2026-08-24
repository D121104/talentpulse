import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import serveStatic from 'serve-static';
import { join } from 'path';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'public'));
  app.setViewEngine('hbs');

  app.use(serveStatic(join(__dirname, '..', 'public')));
  app.use(helmet());
  configureHttpApp(app, configService);

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('Backend2 - Refactored API')
    .setVersion('1.0.0')
    .addTag('api')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      filter: true,
      showRequestDuration: true,
    },
  });

  const PORT = configService.get<string>('PORT') || 8000;
  await app.listen(PORT);
  console.log(`Application is running on: http://localhost:${PORT}`);
}

bootstrap();
