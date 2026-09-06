import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';

export type JobIndexOutboxEventType = 'JOB_CHANGED';
export type JobIndexOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface CanonicalJobProjection {
  job: Job;
  company: Company;
  active: boolean;
  contentHash: string;
  sourceVersion: string;
  text: string;
}

export interface JobVectorPayload {
  job_id: string;
  company_id: string;
  status: 'ACTIVE';
  is_active: true;
  is_deleted: false;
  company_is_active: true;
  location: string | null;
  level: string | null;
  salary: number | null;
  content_hash: string;
  representation_version: string;
  index_version: string;
  source_version: string;
}

export interface JobVectorPoint {
  id: string;
  vector: number[];
  payload: JobVectorPayload;
}
