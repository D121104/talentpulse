import { OnlineCvLocale } from './entities/online-cv.entity';

export const ONLINE_CV_GENERATION_QUEUE = 'online-cv-generation';
export const ONLINE_CV_GENERATION_PROCESS = 'generate-cv';

export type CvGenerationOperationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETE'
  | 'DEGRADED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE';

export interface CvGenerationMetadata {
  operationId: string;
  idempotencyKeyHash: string;
  status: CvGenerationOperationStatus;
  kind: 'EXISTING_CV' | 'CAREER_PROFILE';
  userId: string;
  cvId: string;
  sourceProfileId?: string | null;
  sourceProfileVersion?: number | null;
  expectedContentVersion?: number | null;
  sourceVersion: string;
  consentVersion: string;
  consentPolicyHash: string;
  templateType: 'template1' | 'template2';
  locale: OnlineCvLocale;
  targetJobId?: string | null;
  attempts: 1;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  warnings?: string[];
}

/** Queue data is intentionally limited to opaque identifiers, versions and hashes. */
export interface CvGenerationJobData {
  operationId: string;
  userId: string;
  cvId: string;
  kind: CvGenerationMetadata['kind'];
  sourceProfileId?: string | null;
  sourceProfileVersion?: number | null;
  expectedContentVersion?: number | null;
  sourceVersion: string;
  consentVersion: string;
  consentPolicyHash: string;
  templateType: 'template1' | 'template2';
  locale: OnlineCvLocale;
  targetJobId?: string | null;
  idempotencyKeyHash: string;
}
