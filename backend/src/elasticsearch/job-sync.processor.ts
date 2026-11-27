import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bull';
import { In, Repository } from 'typeorm';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
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
    @Optional()
    @InjectRepository(Company)
    private readonly companyRepo?: Repository<Company>,
  ) {}

  private applyCanonicalCompanyState(
    job: Job,
    canonicalCompany?: Company | null,
  ): Job {
    if (!this.companyRepo || canonicalCompany === undefined) {
      return job;
    }

    const isCompanyActive = Boolean(
      canonicalCompany &&
        canonicalCompany.isActive === true &&
        canonicalCompany.isDeleted === false &&
        !canonicalCompany.deletedAt,
    );

    job.company = {
      ...(job.company || ({} as any)),
      _id: canonicalCompany?._id || job.company?._id || '',
      name: canonicalCompany?.name || job.company?.name || '',
      logo: canonicalCompany?.logo ?? job.company?.logo,
      scale: canonicalCompany?.scale ?? job.company?.scale,
      address: canonicalCompany?.address ?? job.company?.address,
      isActive: isCompanyActive,
    };

    return job;
  }

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

      if (this.companyRepo && jobInDb.company?._id) {
        const canonicalCompany = await this.companyRepo.findOne({
          where: { _id: jobInDb.company._id },
        });
        this.applyCanonicalCompanyState(jobInDb, canonicalCompany);
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
      this.logger.log(
        'Starting bulk sync of all active jobs to Elasticsearch...',
      );
      const allJobs = await this.jobRepo.find({
        where: { isDeleted: false },
      });

      if (this.companyRepo && allJobs.length > 0) {
        const companyIds = Array.from(
          new Set(
            allJobs.map((j) => j.company?._id).filter((id): id is string => Boolean(id)),
          ),
        );
        if (companyIds.length > 0) {
          const companies = await this.companyRepo.find({
            where: { _id: In(companyIds) },
          });
          const companyMap = new Map(companies.map((c) => [c._id, c]));
          for (const item of allJobs) {
            if (item.company?._id) {
              this.applyCanonicalCompanyState(
                item,
                companyMap.get(item.company._id) ?? null,
              );
            }
          }
        }
      }

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
