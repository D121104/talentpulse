import type { Context } from 'aws-lambda';

describe('Lambda HTTP handler', () => {
  let handler: import('aws-lambda').APIGatewayProxyHandler;
  let createApplication: jest.Mock;
  let configureHttpApp: jest.Mock;
  let serverlessExpress: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();

    createApplication = jest.fn();
    configureHttpApp = jest.fn();
    serverlessExpress = jest.fn();

    jest.doMock('@nestjs/core', () => ({
      NestFactory: { create: createApplication },
    }));
    jest.doMock('./app.module', () => ({ AppModule: class AppModule {} }));
    jest.doMock('./bootstrap', () => ({ configureHttpApp }));
    jest.doMock('@codegenie/serverless-express', () => ({
      __esModule: true,
      default: serverlessExpress,
    }));

    ({ handler } = require('./lambda'));
  });

  it('initializes Nest once and reuses the serverless handler across invocations', async () => {
    const configService = {};
    const expressApp = jest.fn();
    const app = {
      get: jest.fn(() => configService),
      init: jest.fn().mockResolvedValue(undefined),
      getHttpAdapter: jest.fn(() => ({
        getInstance: jest.fn(() => expressApp),
      })),
    };
    const serverlessHandler = jest.fn().mockResolvedValue({ statusCode: 200 });
    const callback = jest.fn();

    createApplication.mockResolvedValue(app);
    serverlessExpress.mockReturnValue(serverlessHandler);

    await Promise.all([
      handler({} as never, {} as Context, callback),
      handler({} as never, {} as Context, callback),
    ]);

    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(configureHttpApp).toHaveBeenCalledWith(app, configService);
    expect(app.init).toHaveBeenCalledTimes(1);
    expect(serverlessExpress).toHaveBeenCalledWith({ app: expressApp });
    expect(serverlessHandler).toHaveBeenCalledTimes(2);
  });
});
