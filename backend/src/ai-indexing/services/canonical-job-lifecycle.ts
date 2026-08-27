import { CanonicalJobProjection } from './canonical-job-projection.service';

export type CanonicalJobDisposition =
  | 'ACTIVE'
  | 'DELETED_JOB'
  | 'INACTIVE_JOB'
  | 'MISSING_COMPANY'
  | 'DELETED_COMPANY'
  | 'INACTIVE_COMPANY'
  | 'MISSING_START_DATE'
  | 'MISSING_END_DATE'
  | 'INVALID_DATE_RANGE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'INELIGIBLE';

/**
 * Classifies the same lifecycle conditions used by the active-job invariant.
 * This is for operational counters only; `isCanonicalActive` remains the
 * source of truth for the actual upsert/delete decision.
 */
export function classifyCanonicalJob(
  projection: CanonicalJobProjection,
  now: Date,
): CanonicalJobDisposition {
  const { job, company } = projection;
  if (projection.isCanonicalActive) return 'ACTIVE';
  if (job.isDeleted || job.deletedAt) return 'DELETED_JOB';
  if (!job.isActive) return 'INACTIVE_JOB';
  if (!company || job.company?._id !== company._id) return 'MISSING_COMPANY';
  if (company.isDeleted || company.deletedAt) return 'DELETED_COMPANY';
  if (!company.isActive) return 'INACTIVE_COMPANY';
  if (!job.startDate) return 'MISSING_START_DATE';
  if (!job.endDate) return 'MISSING_END_DATE';
  if (job.startDate >= job.endDate) return 'INVALID_DATE_RANGE';
  if (job.startDate > now) return 'NOT_STARTED';
  if (job.endDate <= now) return 'EXPIRED';
  return 'INELIGIBLE';
}
