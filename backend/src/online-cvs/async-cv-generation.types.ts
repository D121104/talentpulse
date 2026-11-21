import { OnlineCvLocale } from './entities/online-cv.entity';
import type { CvDraftResponse } from 'src/ai-matching/ai-service.cv-draft';

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

export type CvGenerationReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export type CvDraftFieldOrigin =
  | 'SOURCE'
  | 'LOCALIZED'
  | 'AI_SUGGESTED'
  | 'FALLBACK';

export type CvDraftOmissionReason =
  | 'SOURCE_UNAVAILABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'STRUCTURE_INVALID'
  | 'LOCALIZATION_FAILED';

export interface CvDraftOmission {
  path: string;
  reasonCode: CvDraftOmissionReason;
}

export interface CvGenerationPendingDraft {
  operationId: string;
  draftHash: string;
  draft: CvDraftResponse;
  sourceRefsByPath: Record<string, string[]>;
  fieldOriginsByPath: Record<string, CvDraftFieldOrigin>;
  omissionsByPath: CvDraftOmission[];
  sourceVersion: string;
  expectedContentVersion: number;
  consentVersion: string;
  consentPolicyHash: string;
  createdAt: string;
  expiresAt: string;
  reviewStatus: 'PENDING';
}

export interface OnlineCvGenerationSnapshot {
  pendingDraft?: CvGenerationPendingDraft;
  [key: string]: unknown;
}

export interface CvGenerationApproval {
  operationId: string;
  draftHash: string;
}

export interface CvRegenerationTarget {
  reviewOperationId: string;
  expectedDraftHash: string;
  targetPath: string;
}

export interface CvGenerationRegenerationOperation
  extends CvRegenerationTarget {
  operationId: string;
  idempotencyKeyHash: string;
  status: CvGenerationOperationStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  implementation?: 'legacy' | 'agent';
  requestId?: string;
  correlationId?: string;
}

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
  implementation?: 'legacy' | 'agent';
  reviewStatus?: CvGenerationReviewStatus;
  draftHash?: string;
  regeneration?: CvGenerationRegenerationOperation;
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
  regenerationTarget?: CvRegenerationTarget;
}
