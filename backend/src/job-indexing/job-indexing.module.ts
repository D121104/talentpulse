import { Module } from '@nestjs/common';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { JobIndexingProcessor } from './job-indexing.processor';
import { JobIndexingService } from './job-indexing.service';
import { JobIndexingSubscriber } from './job-indexing.subscriber';
@Module({
  imports: [
    TypeOrmModule.forFeature([JobIndexOutbox, Job, Company]),
    AIMatchingModule,
  ],
  providers: [
    JobIndexingService,
    JobIndexingSubscriber,
    { provide: 'JOB_INDEXING_CLIENT', useExisting: AiServiceClient },
    ...(areQueueWorkersEnabled() ? [JobIndexingProcessor] : []),
  ],
  exports: [JobIndexingService],
})
export class JobIndexingModule {}
