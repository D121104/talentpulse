import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { JobIndexingService } from './job-indexing.service';

@Injectable()
export class JobIndexingProcessor {
  private readonly logger = new Logger(JobIndexingProcessor.name);
  constructor(private readonly indexing: JobIndexingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingOutbox(): Promise<void> {
    const result = await this.indexing.drain(25);
    if (result.claimed)
      this.logger.log(`Indexed job outbox batch: ${JSON.stringify(result)}`);
  }
}
