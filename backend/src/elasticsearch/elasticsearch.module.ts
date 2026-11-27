import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { ElasticsearchService } from './elasticsearch.service';
import { JobSyncProcessor } from './job-sync.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Company]),
    BullModule.registerQueue({
      name: 'job-sync-es',
    }),
  ],
  providers: [ElasticsearchService, JobSyncProcessor],
  exports: [ElasticsearchService, BullModule],
})
export class ElasticsearchModule {}
