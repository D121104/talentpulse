import { ConfigService } from '@nestjs/config';
import { AppService } from 'src/app.service';

type Fakes = {
  dataSource: { isInitialized: boolean; query: jest.Mock };
  redisService: { getValue: jest.Mock };
  aiServiceClient: { checkReadiness: jest.Mock };
  configService: ConfigService;
};

function createService(overrides: Partial<Fakes> = {}): {
  service: AppService;
  fakes: Fakes;
} {
  const fakes: Fakes = {
    dataSource: {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    },
    redisService: { getValue: jest.fn().mockResolvedValue(null) },
    aiServiceClient: { checkReadiness: jest.fn().mockResolvedValue(true) },
    configService: new ConfigService({ REDIS_ENABLED: 'true' }),
    ...overrides,
  };

  return {
    service: new AppService(
      fakes.dataSource as any,
      fakes.redisService as any,
      fakes.aiServiceClient as any,
      fakes.configService,
    ),
    fakes,
  };
}

describe('AppService health contract', () => {
  it('keeps the public health response shallow and non-sensitive', () => {
    const { service } = createService();

    expect(service.getHealthCheck()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });

  it('reports ready only when PostgreSQL, Valkey, and FastAPI checks pass', async () => {
    const { service, fakes } = createService();

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
    expect(fakes.dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(fakes.redisService.getValue).toHaveBeenCalledWith(
      '__backend_readiness_probe__',
    );
    expect(fakes.aiServiceClient.checkReadiness).toHaveBeenCalledWith(1000);
  });

  it('returns a sanitized unavailable error when a dependency fails', async () => {
    const { service, fakes } = createService();
    fakes.redisService.getValue.mockRejectedValue(new Error('valkey secret'));

    let error: any;
    try {
      await service.getReadiness();
    } catch (caught) {
      error = caught;
    }

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual({
      status: 'not_ready',
      message: 'Service is not ready',
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('valkey secret');
  });

  it('does not claim Valkey readiness when it is explicitly disabled', async () => {
    const configService = new ConfigService({ REDIS_ENABLED: 'false' });
    const { service, fakes } = createService({ configService });

    await expect(service.getReadiness()).rejects.toBeInstanceOf(Error);
    expect(fakes.redisService.getValue).not.toHaveBeenCalled();
  });
});
