import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AIMatchingService } from './ai-matching.service';
import { CVProcessingService } from './cv-processing.service';
import { CVProcessingProcessor } from './cv-processing.processor';
import { CVMatchResult } from './entities/cv-match-result.entity';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([CVMatchResult]),
    ...(queueWorkersEnabled
      ? [BullModule.registerQueue({ name: 'cv-processing' })]
      : []),
  ],
  providers: [
    AIMatchingService,
    CVProcessingService,
    ...(queueWorkersEnabled
      ? [CVProcessingProcessor]
      : [createNoopQueueProvider('cv-processing')]),
  ],
  exports: [AIMatchingService, CVProcessingService],
})
export class AIMatchingModule {}
