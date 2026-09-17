import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';

export type JobIndexOutboxEventType = 'JOB_CHANGED';
export type JobIndexOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type JobIndexPhase =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INACTIVE'
  | 'DELETED'
  | 'COMPANY_INACTIVE';

export interface CanonicalJobSnapshot {
  job_id: string;
  title: string;
  description: string;
  skills: string[];
  company_id: string;
  company_name: string;
  location: string | null;
  level: string | null;
  work_mode: string | null;
  employment_type: string | null;
  salary: number | null;
  salary_currency: string | null;
  start_date: string | null;
  end_date: string | null;
  start_date_epoch_ms: number | null;
  end_date_epoch_ms: number | null;
  is_active: boolean;
  is_deleted: boolean;
  company_is_active: boolean;
  company_is_deleted: boolean;
}

export interface CanonicalJobSourceVersionProjection {
  job_updated_at: string;
  company_updated_at: string;
}

export interface CanonicalJobProjection {
  job: Job;
  company: Company;
  active: boolean;
  phase: JobIndexPhase;
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
