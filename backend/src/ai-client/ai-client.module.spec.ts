import { DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AiProviderAttempt } from '../ai-indexing/entities/ai-provider-attempt.entity';
import { AiProviderAttemptRecorder } from '../ai-indexing/services/ai-provider-attempt-recorder.service';
import { AiClientModule } from './ai-client.module';
import {
  AiCircuitBreakerToken,
  AiOperationAttemptIdFactoryToken,
  AiServiceClient,
  AiServiceHttpTransportToken,
  AiServiceJwtIssuerToken,
  AiTraceIdFactoryToken,
} from './ai-client.service';
import {
  AiProviderAttemptRecorderToken,
  NoopAiProviderAttemptRecorder,
} from './ai-provider-attempt.contracts';

@Module({})
class MockTypeOrmModule {
  static forRoot(dataSource: object): DynamicModule {
    const dataSourceToken = getDataSourceToken();
    return {
      module: MockTypeOrmModule,
      global: true,
      providers: [{ provide: dataSourceToken, useValue: dataSource }],
      exports: [dataSourceToken],
    };
  }
}

describe('AiClientModule', () => {
  it('resolves the client with the persistent provider-attempt recorder', async () => {
    const repository = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const dataSource = {
      entityMetadatas: [{ target: AiProviderAttempt }],
      options: { type: 'postgres' },
      getRepository: jest.fn(() => repository),
    };

    @Module({
      imports: [MockTypeOrmModule.forRoot(dataSource), AiClientModule],
    })
    class TestModule {}

    const app = await NestFactory.createApplicationContext(TestModule, {
      logger: false,
      abortOnError: false,
    });

    try {
      const client = app.get(AiServiceClient);
      const recorder = app.get(AiProviderAttemptRecorderToken);

      expect(client).toBeInstanceOf(AiServiceClient);
      expect(recorder).toBeInstanceOf(AiProviderAttemptRecorder);
      expect(recorder).not.toBeInstanceOf(NoopAiProviderAttemptRecorder);
      expect(
        (client as unknown as { providerAttemptRecorder: unknown })
          .providerAttemptRecorder,
      ).toBe(recorder);
      expect(dataSource.getRepository).toHaveBeenCalledWith(AiProviderAttempt);
      expect(app.get(AiServiceHttpTransportToken)).toBeDefined();
      expect(app.get(AiServiceJwtIssuerToken)).toBeDefined();
      expect(app.get(AiCircuitBreakerToken)).toBeDefined();
      expect(app.get(AiTraceIdFactoryToken)).toEqual(expect.any(Function));
      expect(app.get(AiOperationAttemptIdFactoryToken)).toEqual(
        expect.any(Function),
      );
    } finally {
      await app.close();
    }
  });
});
