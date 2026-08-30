import serverlessExpress from '@codegenie/serverless-express';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap';

let cachedHandler: APIGatewayProxyHandler | undefined;
let initialization: Promise<APIGatewayProxyHandler> | undefined;

async function createHandler(): Promise<APIGatewayProxyHandler> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureHttpApp(app, app.get(ConfigService));
  await app.init();

  return serverlessExpress({
    app: app.getHttpAdapter().getInstance(),
  });
}

async function getHandler(): Promise<APIGatewayProxyHandler> {
  if (!cachedHandler) {
    initialization ??= createHandler();
    cachedHandler = await initialization;
  }

  return cachedHandler;
}

export const handler: APIGatewayProxyHandler = async (
  event,
  context,
  callback,
) => {
  const serverlessHandler = await getHandler();
  return (await serverlessHandler(
    event,
    context,
    callback,
  )) as APIGatewayProxyResult;
};
