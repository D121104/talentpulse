import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  createRedisCacheModule,
  createRedisCacheOptions,
  createRedisConnectionOptions,
  RedisModule,
} from './redis.module';
import { RedisService } from './redis.service';

describe('RedisModule', () => {
  it('uses a top-level tls option for Redis TLS', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          REDIS_HOST: 'redis.example.test',
          REDIS_PORT: 6380,
          REDIS_PASSWORD: 'secret',
          REDIS_TLS: 'true',
        };
        return values[key];
      }),
    };

    expect(createRedisConnectionOptions(configService)).toEqual({
      host: 'redis.example.test',
      port: 6380,
      password: 'secret',
      tls: {},
    });
    expect(createRedisCacheOptions(configService)).toMatchObject({
      host: 'redis.example.test',
      port: 6380,
      password: 'secret',
      tls: {},
      ttl: 3600,
    });
  });

  it('does not add TLS when REDIS_TLS is not true', () => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'REDIS_TLS' ? 'false' : undefined,
      ),
    };

    expect(createRedisConnectionOptions(configService)).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
      tls: undefined,
    });
  });

  it('provides a local cache manager when Redis is disabled', async () => {
    @Module({
      imports: [createRedisCacheModule(false)],
      providers: [RedisService],
    })
    class DisabledRedisTestModule {}

    const app = await NestFactory.createApplicationContext(
      DisabledRedisTestModule,
      { logger: false },
    );
    const redisService = app.get(RedisService);

    await expect(redisService.setValue('disabled-key', 'value')).resolves.toBe(
      undefined,
    );
    await expect(redisService.getValue('disabled-key')).resolves.toBe('value');
    expect(app.get(CACHE_MANAGER)).toBeDefined();
    await app.close();
  });

  it('exports CacheModule because both runtime branches import a cache module', () => {
    const exportsMetadata = Reflect.getMetadata('exports', RedisModule);

    expect(exportsMetadata).toEqual(
      expect.arrayContaining([RedisService]),
    );
  });
});
