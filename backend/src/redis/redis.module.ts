import { DynamicModule, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import * as redisStore from 'cache-manager-redis-store';
import { isRedisEnabled } from 'src/config/runtime-flags';

type ConfigReader = Pick<ConfigService, 'get'>;

export function createRedisConnectionOptions(configService: ConfigReader) {
  return {
    host: configService.get<string>('REDIS_HOST') || 'localhost',
    port: configService.get<number>('REDIS_PORT') || 6379,
    password: configService.get<string>('REDIS_PASSWORD') || undefined,
    tls:
      configService.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
  };
}

export function createRedisCacheOptions(configService: ConfigReader) {
  return {
    store: redisStore,
    ...createRedisConnectionOptions(configService),
    ttl: 60 * 60,
  };
}

export function createRedisCacheModule(redisEnabled: boolean): DynamicModule {
  if (!redisEnabled) {
    // The in-memory cache keeps CACHE_MANAGER available for API-only modules
    // without creating a Redis connection.
    return CacheModule.register({ ttl: 60 * 60 });
  }

  return CacheModule.registerAsync({
    imports: [ConfigModule],
    useFactory: async (configService: ConfigService) =>
      createRedisCacheOptions(configService),
    inject: [ConfigService],
  });
}

@Module({
  imports: [createRedisCacheModule(isRedisEnabled())],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
