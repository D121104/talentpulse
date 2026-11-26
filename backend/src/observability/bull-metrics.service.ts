import { getQueueToken } from '@nestjs/bull';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { parseRuntimeBoolean } from 'src/config/runtime-flags';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';
import { RedisService } from 'src/redis/redis.service';
import { DataSource } from 'typeorm';
import { MetricsService } from './metrics.service';
import {
  BullJobState,
  ObservabilityBullQueue,
} from './observability.constants';

const SCRAPE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 1_500;
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const REDIS_PROBE_KEY = '__observability_health_probe__';

type QueueEntry = {
  name: ObservabilityBullQueue;
  queue?: Queue;
};

/**
 * Periodically collects Bull queue job counts and core backend dependency
 * health metrics (`postgres`, `redis`, `elasticsearch`).
 */
@Injectable()
export class BullMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMetricsService.name);
  private readonly queues: ReadonlyArray<QueueEntry>;
  private scrapeInterval?: NodeJS.Timeout;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly elasticsearchService?: ElasticsearchService,
    @Optional()
    @Inject(getQueueToken('cv-processing'))
    cvProcessingQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('job-sync-es'))
    jobSyncEsQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('mail-queue'))
    mailQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('online-cv-generation'))
    onlineCvGenerationQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('user-cv-parse'))
    userCvParseQueue?: Queue,
  ) {
    this.queues = [
      { name: 'cv-processing', queue: cvProcessingQueue },
      { name: 'job-sync-es', queue: jobSyncEsQueue },
      { name: 'mail-queue', queue: mailQueue },
      { name: 'online-cv-generation', queue: onlineCvGenerationQueue },
      { name: 'user-cv-parse', queue: userCvParseQueue },
    ];
  }

  onModuleInit(): void {
    void this.collectAll().catch((error: unknown) => {
      this.logger.warn(
        `Initial observability metrics collection failed: ${this.formatError(
          error,
        )}`,
      );
    });

    const nodeEnv = String(
      this.configService.get<string>('NODE_ENV') ??
        process.env.NODE_ENV ??
        'development',
    )
      .trim()
      .toLowerCase();

    if (nodeEnv !== 'test') {
      this.scrapeInterval = setInterval(() => {
        void this.collectAll().catch((error: unknown) => {
          this.logger.warn(
            `Periodic observability metrics collection failed: ${this.formatError(
              error,
            )}`,
          );
        });
      }, SCRAPE_INTERVAL_MS);
      this.scrapeInterval.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.scrapeInterval) {
      clearInterval(this.scrapeInterval);
      this.scrapeInterval = undefined;
    }
  }

  /**
   * Runs one full collection pass across Bull queues and core dependencies.
   */
  async collectAll(): Promise<void> {
    await Promise.all([
      this.collectQueueMetrics(),
      this.collectDependencyMetrics(),
    ]);
  }

  /**
   * Scrapes job counts for all configured Bull queues.
   */
  async collectQueueMetrics(): Promise<void> {
    await Promise.all(
      this.queues.map(async ({ name, queue }) => {
        if (!queue || typeof queue.getJobCounts !== 'function') {
          return;
        }

        try {
          const counts = (await this.withTimeout(
            queue.getJobCounts(),
            PROBE_TIMEOUT_MS,
            `Bull queue ${name} scrape timed out`,
          )) as Partial<Record<BullJobState, number>>;
          this.metricsService.setBullQueueCounts(name, counts);
        } catch (error: unknown) {
          this.metricsService.incBullScrapeError(name);
          this.logger.warn(
            `Failed to scrape Bull queue "${name}": ${this.formatError(error)}`,
          );
        }
      }),
    );
  }

  /**
   * Probes PostgreSQL, Redis, and Elasticsearch availability and latency.
   */
  async collectDependencyMetrics(): Promise<void> {
    await Promise.all([
      this.measureDependency('postgres', () => this.checkPostgres()),
      this.measureDependency('redis', () => this.checkRedis()),
      this.measureDependency('elasticsearch', () => this.checkElasticsearch()),
    ]);
  }

  private async measureDependency(
    dependency: string,
    probe: () => Promise<boolean>,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();
    let up = false;
    try {
      up = await probe();
    } catch {
      up = false;
    } finally {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND;
      this.metricsService.setDependencyStatus(dependency, up, durationSeconds);
    }
  }

  private async checkPostgres(): Promise<boolean> {
    if (!this.dataSource?.isInitialized) {
      return false;
    }
    await this.withTimeout(
      this.dataSource.query('SELECT 1'),
      PROBE_TIMEOUT_MS,
      'PostgreSQL health probe timed out',
    );
    return true;
  }

  private async checkRedis(): Promise<boolean> {
    const redisEnabled = parseRuntimeBoolean(
      this.configService.get('REDIS_ENABLED'),
      true,
    );
    if (!redisEnabled || !this.redisService) {
      return false;
    }
    await this.withTimeout(
      this.redisService.getValue(REDIS_PROBE_KEY),
      PROBE_TIMEOUT_MS,
      'Redis health probe timed out',
    );
    return true;
  }

  private async checkElasticsearch(): Promise<boolean> {
    if (!this.elasticsearchService) {
      return false;
    }
    const ok = await this.withTimeout(
      this.elasticsearchService.getClient().ping(),
      PROBE_TIMEOUT_MS,
      'Elasticsearch health probe timed out',
    );
    return ok !== false;
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(timeoutMessage)),
            timeoutMs,
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
