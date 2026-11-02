import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job as BullJob } from 'bull';
import {
  CvGenerationJobData,
  ONLINE_CV_GENERATION_PROCESS,
  ONLINE_CV_GENERATION_QUEUE,
} from './async-cv-generation.types';
import { OnlineCVsService } from './online-cvs.service';

@Injectable()
@Processor(ONLINE_CV_GENERATION_QUEUE)
export class OnlineCvGenerationProcessor {
  private readonly logger = new Logger(OnlineCvGenerationProcessor.name);

  constructor(private readonly onlineCVsService: OnlineCVsService) {}

  @Process({ name: ONLINE_CV_GENERATION_PROCESS, concurrency: 1 })
  async handleGeneration(job: BullJob<CvGenerationJobData>): Promise<void> {
    try {
      await this.onlineCVsService.processGenerationJob(job.data);
    } catch (error) {
      this.logger.error(
        `CV generation job failed (${job.data.operationId})`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.onlineCVsService.markGenerationFailure(
        job.data,
        'WORKER_FAILURE',
      );
    }
  }
}
