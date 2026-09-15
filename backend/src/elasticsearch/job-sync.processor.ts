import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bull';
import { Repository } from 'typeorm';
import { Job } from 'src/jobs/entities/job.entity';
import { ElasticsearchService } from './elasticsearch.service';

export interface JobSyncPayload {
  jobId: string;
}

@Injectable()
@Processor('job-sync-es')
export class JobSyncProcessor {
  private readonly logger = new Logger(JobSyncProcessor.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  @Process('sync-job')
  async handleSyncJob(job: BullJob<JobSyncPayload>): Promise<void> {
    const { jobId } = job.data;
    if (!jobId) return;

    try {
      const jobInDb = await this.jobRepo.findOne({
        where: { _id: jobId },
      });

      if (!jobInDb || jobInDb.isDeleted || jobInDb.deletedAt) {
        await this.elasticsearchService.deleteJob(jobId);
        this.logger.log(`Job ${jobId} removed/marked deleted in Elasticsearch`);
        return;
      }

      await this.elasticsearchService.indexJob(jobInDb);
      this.logger.log(`Job ${jobId} successfully synced to Elasticsearch`);
    } catch (error) {
      this.logger.error(
        `Failed to sync job ${jobId} to Elasticsearch: ${error.message}`,
      );
      throw error;
    }
  }

  @Process('delete-job')
  async handleDeleteJob(job: BullJob<JobSyncPayload>): Promise<void> {
    const { jobId } = job.data;
    if (!jobId) return;

    try {
      await this.elasticsearchService.deleteJob(jobId);
      this.logger.log(`Job ${jobId} deleted from Elasticsearch`);
    } catch (error) {
      this.logger.error(
        `Failed to delete job ${jobId} from Elasticsearch: ${error.message}`,
      );
      throw error;
    }
  }

  @Process('sync-all-jobs')
  async handleSyncAllJobs(): Promise<void> {
    try {
      this.logger.log('Starting bulk sync of all active jobs to Elasticsearch...');
      const allJobs = await this.jobRepo.find({
        where: { isDeleted: false },
      });

      const { count } = await this.elasticsearchService.bulkIndexJobs(allJobs);
      this.logger.log(
        `Bulk sync completed: ${count}/${allJobs.length} jobs indexed in Elasticsearch`,
      );
    } catch (error) {
      this.logger.error(`Bulk sync to Elasticsearch failed: ${error.message}`);
      throw error;
    }
  }
}
