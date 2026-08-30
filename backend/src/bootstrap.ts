import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { TransformInterceptor } from './core/transform.interceptor';

const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.1.238:8081',
  'exp://192.168.1.238:8081',
];

function getAllowedOrigins(configService: ConfigService) {
  const configuredOrigins = [
    configService.get<string>('URL_FRONTEND'),
    ...(configService.get<string>('CORS_ORIGINS') || '').split(','),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));

  return [
    ...new Set(
      configService.get<string>('NODE_ENV') === 'production'
        ? configuredOrigins
        : [...configuredOrigins, ...developmentOrigins],
    ),
  ];
}

export function configureHttpApp(
  app: NestExpressApplication,
  configService: ConfigService,
) {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1'],
  });
  app.enableCors({
    origin: getAllowedOrigins(configService),
    credentials: true,
  });
}
