import { BullModule } from '@nestjs/bull';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { isRedisEnabled } from 'src/config/runtime-flags';
import { ElasticsearchModule } from 'src/elasticsearch/elasticsearch.module';
import { RedisModule } from 'src/redis/redis.module';
import { BullMetricsService } from './bull-metrics.service';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsAuthGuard } from './metrics-auth.guard';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { OBSERVABILITY_BULL_QUEUES } from './observability.constants';

const redisEnabled = isRedisEnabled();

/**
 * Registers Prometheus metrics collection, HTTP request instrumentation,
 * Bull queue monitoring, and the `/metrics` scrape endpoint.
 */
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    ElasticsearchModule,
    ...(redisEnabled
      ? OBSERVABILITY_BULL_QUEUES.map((name) =>
          BullModule.registerQueue({ name }),
        )
      : []),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    BullMetricsService,
    MetricsAuthGuard,
    HttpMetricsMiddleware,
  ],
  exports: [MetricsService, BullMetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
