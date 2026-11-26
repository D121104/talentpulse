import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NestModule,
  Param,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestApplication } from '@nestjs/core';
import { NoopGraphInspector } from '@nestjs/core/inspector/noop-graph-inspector';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { DependenciesScanner } from '@nestjs/core/scanner';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TransformInterceptor } from 'src/core/transform.interceptor';
import { HttpMetricsMiddleware } from 'src/observability/http-metrics.middleware';
import { MetricsAuthGuard } from 'src/observability/metrics-auth.guard';
import { MetricsController } from 'src/observability/metrics.controller';
import { MetricsService } from 'src/observability/metrics.service';

jest.setTimeout(30_000);

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }

  @Get(':id')
  pingById(@Param('id') id: string) {
    return { id };
  }
}

@Module({
  controllers: [MetricsController, PingController],
  providers: [
    MetricsService,
    MetricsAuthGuard,
    HttpMetricsMiddleware,
    ConfigService,
  ],
})
class TestMetricsHttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}

async function createMetricsTestApp(
  metricsBearerToken?: string,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [TestMetricsHttpModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string) =>
        key === 'METRICS_BEARER_TOKEN' ? metricsBearerToken : undefined,
    });

  // @nestjs/testing@9.0.0 omits GraphInspector expected by @nestjs/core@9.4.0.
  const mutableBuilder = builder as any;
  if (
    mutableBuilder.scanner &&
    typeof mutableBuilder.scanner.graphInspector
      ?.insertEnhancerMetadataCache !== 'function'
  ) {
    mutableBuilder.scanner = new DependenciesScanner(
      mutableBuilder.container,
      new MetadataScanner(),
      NoopGraphInspector,
      mutableBuilder.applicationConfig,
    );
    mutableBuilder.instanceLoader.graphInspector = NoopGraphInspector;
  }

  const moduleRef = await builder.compile();
  const mutableModuleRef = moduleRef as any;
  const httpAdapter = mutableModuleRef.createHttpAdapter();
  mutableModuleRef.applyLogger({ logger: false });
  mutableModuleRef.container.setHttpAdapter(httpAdapter);
  const instance = new NestApplication(
    mutableModuleRef.container,
    httpAdapter,
    mutableModuleRef.applicationConfig,
    NoopGraphInspector,
    { logger: false },
  );
  const app = mutableModuleRef.createAdapterProxy(
    instance,
    httpAdapter,
  ) as NestExpressApplication;

  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api', { exclude: ['metrics'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1'],
  });
  await app.init();
  return app;
}

describe('Metrics HTTP integration', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('serves raw Prometheus text at GET /metrics and records GET /api/v1/ping', async () => {
    app = await createMetricsTestApp();
    const server = app.getHttpServer();

    const initialMetrics = await request(server).get('/metrics').expect(200);
    expect(initialMetrics.headers['content-type']).toMatch(/^text\/plain/);
    expect(initialMetrics.headers['cache-control']).toBe('no-store');
    expect(initialMetrics.text).toContain('# HELP ');
    expect(initialMetrics.text).toContain('# TYPE ');
    expect(initialMetrics.text).not.toContain('"statusCode"');
    expect(() => JSON.parse(initialMetrics.text)).toThrow();

    const pingResponse = await request(server).get('/api/v1/ping').expect(200);
    expect(pingResponse.body).toEqual({
      statusCode: 200,
      data: { ok: true },
    });

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const pingByIdResponse = await request(server)
      .get(`/api/v1/ping/${uuid}`)
      .expect(200);
    expect(pingByIdResponse.body).toEqual({
      statusCode: 200,
      data: { id: uuid },
    });

    const updatedMetrics = await request(server).get('/metrics').expect(200);
    expect(updatedMetrics.text).toContain(
      'http_requests_total{method="GET",route="/api/v1/ping",status_code="200",service="talentpulse-backend"} 1',
    );
    expect(updatedMetrics.text).toContain(
      'http_requests_total{method="GET",route="/api/v1/ping/:id",status_code="200",service="talentpulse-backend"} 1',
    );
    expect(updatedMetrics.text).toContain(
      'http_request_duration_seconds_count{service="talentpulse-backend",method="GET",route="/api/v1/ping",status_code="200"} 1',
    );
    expect(updatedMetrics.text).toContain(
      'http_requests_in_flight{method="GET",service="talentpulse-backend"} 0',
    );
    expect(updatedMetrics.text).not.toContain('route="/metrics"');
  });

  it('enforces METRICS_BEARER_TOKEN when configured', async () => {
    const token = 'prom-scrape-secret';
    app = await createMetricsTestApp(token);
    const server = app.getHttpServer();

    await request(server).get('/metrics').expect(401);
    await request(server)
      .get('/metrics')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
    await request(server)
      .get('/metrics')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401);

    await request(server).get('/api/v1/ping').expect(200);

    const authorizedResponse = await request(server)
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(authorizedResponse.headers['content-type']).toMatch(/^text\/plain/);
    expect(authorizedResponse.text).toContain(
      'http_requests_total{method="GET",route="/api/v1/ping",status_code="200",service="talentpulse-backend"} 1',
    );
  });
});
