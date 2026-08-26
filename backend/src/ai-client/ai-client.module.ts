import { Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AiCircuitBreaker } from './circuit-breaker';
import {
  AiServiceClient,
  AiCircuitBreakerToken,
  AiOperationAttemptIdFactoryToken,
  AiServiceHttpTransportToken,
  AiServiceJwtIssuerToken,
  AiTraceIdFactoryToken,
} from './ai-client.service';
import { AxiosAiServiceHttpTransport } from './axios.transport';
import {
  EnvironmentServiceJwtKeyLoader,
  FileBackedServiceJwtProvider,
  ServiceJwtKeyLoaderToken,
} from './service-jwt.provider';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    AiServiceClient,
    { provide: AiTraceIdFactoryToken, useValue: randomUUID },
    { provide: AiOperationAttemptIdFactoryToken, useValue: randomUUID },
    AxiosAiServiceHttpTransport,
    {
      provide: AiServiceHttpTransportToken,
      useExisting: AxiosAiServiceHttpTransport,
    },
    EnvironmentServiceJwtKeyLoader,
    {
      provide: ServiceJwtKeyLoaderToken,
      useExisting: EnvironmentServiceJwtKeyLoader,
    },
    {
      provide: AiServiceJwtIssuerToken,
      useFactory: (
        configService: ConfigService,
        jwtService: JwtService,
        keyLoader: EnvironmentServiceJwtKeyLoader,
      ) =>
        new FileBackedServiceJwtProvider(configService, jwtService, keyLoader),
      inject: [ConfigService, JwtService, EnvironmentServiceJwtKeyLoader],
    },
    {
      provide: AiCircuitBreakerToken,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new AiCircuitBreaker({
          failureThreshold: Number(
            configService.get('AI_SERVICE_CIRCUIT_FAILURE_THRESHOLD', 3),
          ),
          resetTimeoutMs: Number(
            configService.get('AI_SERVICE_CIRCUIT_RESET_MS', 30_000),
          ),
        }),
    },
  ],
  exports: [AiServiceClient],
})
export class AiClientModule {}
