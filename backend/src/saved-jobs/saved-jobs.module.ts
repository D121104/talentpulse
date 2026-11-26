import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedJob } from './entities/saved-job.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { SavedJobsService } from './saved-jobs.service';
import { SavedJobsController } from './saved-jobs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavedJob, Job])],
  controllers: [SavedJobsController],
  providers: [SavedJobsService],
  exports: [SavedJobsService],
})
export class SavedJobsModule {}
