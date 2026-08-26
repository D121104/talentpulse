import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { ActiveJobQueryService } from './active-job-query.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job, Company])],
  providers: [ActiveJobQueryService],
  exports: [ActiveJobQueryService],
})
export class ActiveJobsModule {}
