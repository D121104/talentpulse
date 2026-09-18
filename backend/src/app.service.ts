import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AiServiceClient } from './ai-matching/ai-service.client';
import { RedisService } from './redis/redis.service';

const READINESS_TIMEOUT_MS = 1000;
const READINESS_CACHE_KEY = '__backend_readiness_probe__';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly configService: ConfigService,
  ) {}

  getHello(): string {
    return 'Backend2 API is running!';
  }

  getHealthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const [postgres, valkey, fastApi] = await Promise.all([
      this.checkPostgres(),
      this.checkValkey(),
      this.checkFastApi(),
    ]);

    if (!postgres || !valkey || !fastApi) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        message: 'Service is not ready',
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkPostgres(): Promise<boolean> {
    if (!this.dataSource.isInitialized) return false;

    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'));
      return true;
    } catch {
      return false;
    }
  }

  private async checkValkey(): Promise<boolean> {
    if (!this.isValkeyEnabled()) return false;

    try {
      await this.withTimeout(this.redisService.getValue(READINESS_CACHE_KEY));
      return true;
    } catch {
      return false;
    }
  }

  private async checkFastApi(): Promise<boolean> {
    try {
      return await this.withTimeout(
        this.aiServiceClient.checkReadiness(READINESS_TIMEOUT_MS),
      );
    } catch {
      return false;
    }
  }

  private isValkeyEnabled(): boolean {
    const configured = this.configService.get<string | boolean>(
      'REDIS_ENABLED',
    );
    return (
      configured === undefined || String(configured).toLowerCase() === 'true'
    );
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Readiness check timed out')),
            READINESS_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
