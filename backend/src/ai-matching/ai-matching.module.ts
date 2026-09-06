import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AIMatchingService } from './ai-matching.service';
import { CVProcessingService } from './cv-processing.service';
import { CVProcessingProcessor } from './cv-processing.processor';
import { CVMatchResult } from './entities/cv-match-result.entity';
import { AiServiceClient } from './ai-service.client';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Application } from 'src/applications/entities/application.entity';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([CVMatchResult, UserCV, Job, Application]),
    ...(queueWorkersEnabled
      ? [BullModule.registerQueue({ name: 'cv-processing' })]
      : []),
  ],
  providers: [
    AIMatchingService,
    AiServiceClient,
    CVProcessingService,
    ...(queueWorkersEnabled
      ? [CVProcessingProcessor]
      : [createNoopQueueProvider('cv-processing')]),
  ],
  exports: [AIMatchingService, AiServiceClient, CVProcessingService],
})
export class AIMatchingModule {}
