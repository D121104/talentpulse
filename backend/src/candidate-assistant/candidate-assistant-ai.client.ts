import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AiServiceClient,
  AiServiceError,
} from 'src/ai-matching/ai-service.client';
import {
  CandidateAssistantAiClient,
  CandidateAssistantAiRequest,
  CandidateAssistantCitation,
  CandidateAssistantResponse,
  CandidateAssistantBlock,
  AiChatSessionMode,
} from './candidate-assistant.types';
import { CandidateAssistantProviderError } from './candidate-assistant.errors';
import type { MatchResponse } from 'src/ai-matching/ai-service.client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAG_INTENTS = new Set(Object.values(AiChatSessionMode));
const CLAIM_TYPES = new Set([
  'JOB_TITLE',
  'COMPANY_NAME',
  'LOCATION',
  'SALARY',
  'LEVEL',
  'SKILL',
  'JOB_DATE',
  'CV_SKILL',
  'CV_EXPERIENCE',
  'CV_EDUCATION',
  'ADVICE',
  'INFERENCE',
]);

type RecordValue = Record<string, unknown>;
type GenerationMatchingEvidence = Pick<
  MatchResponse,
  | 'cv_id'
  | 'job_id'
  | 'overall_score'
  | 'components'
  | 'matched_skills'
  | 'missing_required_skills'
  | 'strengths'
  | 'gaps'
  | 'explanation'
  | 'degraded'
  | 'scoring_version'
  | 'semantic_component_version'
>;

type RetrievalItem = {
  job_id: string;
  rank: number;
  score: number;
  metadata: Record<string, string>;
};

type RetrievalResponse = {
  request_id: string;
  trace_id: string;
  results: RetrievalItem[];
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function invalidResponse(): never {
  throw new CandidateAssistantProviderError('INVALID_RESPONSE');
}

function assertExactKeys(value: RecordValue, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalidResponse();
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    invalidResponse();
  }
}

function assertString(
  value: unknown,
  min: number,
  max: number,
): asserts value is string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    invalidResponse();
  }
}

function assertStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some(
      (item) =>
        typeof item !== 'string' || item.length < 1 || item.length > maxLength,
    )
  ) {
    invalidResponse();
  }
}

function assertBoundedRecord(
  value: unknown,
  maxItems: number,
  valueMax: number,
): asserts value is Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length > maxItems)
    invalidResponse();
  for (const [key, item] of Object.entries(value)) {
    if (
      key.length < 1 ||
      key.length > 80 ||
      typeof item !== 'string' ||
      item.length > valueMax
    ) {
      invalidResponse();
    }
  }
}

function assertFiniteNumber(
  value: unknown,
  min: number,
  max: number,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    invalidResponse();
  }
}

function validateFilterState(value: unknown): RecordValue {
  if (!isRecord(value)) invalidResponse();
  assertExactKeys(value, [
    'company',
    'location',
    'level',
    'salary_min',
    'salary_max',
    'skills',
  ]);
  for (const key of ['company', 'location', 'level']) {
    const item = value[key];
    if (item !== null) assertString(item, 1, 500);
  }
  for (const key of ['salary_min', 'salary_max']) {
    const item = value[key];
    if (item !== null) assertFiniteNumber(item, 0, 10 ** 12);
  }
  assertStringArray(value.skills, 30, 500);
  if (
    value.salary_min !== null &&
    value.salary_max !== null &&
    value.salary_min > value.salary_max
  ) {
    invalidResponse();
  }
  return value;
}

@Injectable()
export class CandidateAssistantAiServiceClient
  implements CandidateAssistantAiClient
{
  constructor(private readonly aiServiceClient: AiServiceClient) {}

  async generate(
    request: CandidateAssistantAiRequest,
  ): Promise<CandidateAssistantResponse> {
    if (!RAG_INTENTS.has(request.mode)) invalidResponse();
    const identity = {
      request_id: request.requestId,
      trace_id: request.traceId,
      operation_attempt_id: request.operationAttemptId,
      client_message_id: request.clientMessageId,
      user_id: request.userId,
      session_id: request.sessionId,
    };
    const filterState = this.toFilterState(request.filters);
    const explicitFilters = {
      company_ids: [],
      locations: [],
      levels: [],
      skills_any: [],
      skills_all: [],
      salary_gte: filterState.salary_min,
      salary_lte: filterState.salary_max,
    };
    const policy = {
      data_scope: 'PUBLIC_ACTIVE_JOBS' as const,
      max_candidates: 20 as const,
      max_context_jobs: 8 as const,
    };
    const history = request.history.slice(-8).map((item) => item.content);

    try {
      const retrieved = this.validateRetrievalResponse(
        await this.aiServiceClient.retrieveRag({
          identity,
          normalized_user_message: request.message,
          locale: 'en',
          recent_history: history,
          filter_state: filterState,
          explicit_filters: explicitFilters,
          filter_provenance: {},
          policy,
        }),
        identity.request_id,
        identity.trace_id,
      );
      const selectedJob =
        request.mode === AiChatSessionMode.CV_JOB_COMPARISON
          ? request.jobs[0]
          : undefined;
      const contextJobs = [
        ...(selectedJob ? [selectedJob] : []),
        ...retrieved.results
          .map((item) => request.jobs.find((job) => job.id === item.job_id))
          .filter((job): job is CandidateAssistantAiRequest['jobs'][number] =>
            Boolean(job),
          ),
        ...request.jobs,
      ]
        .filter(
          (job, index, all) =>
            all.findIndex((candidate) => candidate.id === job.id) === index,
        )
        .slice(0, 8);
      const allowedJobIds = new Set(contextJobs.map((job) => job.id));
      const retrievalEvidence = retrieved.results
        .filter((item) => allowedJobIds.has(item.job_id))
        .map((item) => ({
          job_id: item.job_id,
          rank: item.rank as number,
          score: item.score,
          citation_key: `job:${item.job_id}`,
        }));
      if (
        selectedJob &&
        !retrievalEvidence.some((item) => item.job_id === selectedJob.id)
      ) {
        retrievalEvidence.push({
          job_id: selectedJob.id,
          rank: retrievalEvidence.length + 1,
          score: 1,
          citation_key: `job:${selectedJob.id}`,
        });
      }
      const requiresCv =
        request.mode === AiChatSessionMode.CV_ANALYSIS ||
        request.mode === AiChatSessionMode.CV_JOB_COMPARISON;
      if (
        requiresCv !== Boolean(request.cv) ||
        (requiresCv && !request.consentVersion)
      ) {
        invalidResponse();
      }
      let matchingEvidence: GenerationMatchingEvidence | null = null;
      if (selectedJob && request.cv) {
        const comparison = await this.aiServiceClient.matchCv(
          this.toMatchRequest(request.cv, selectedJob, {
            request_id: request.requestId,
            trace_id: request.traceId,
            operation_attempt_id: request.operationAttemptId,
          }),
        );
        if (
          !comparison ||
          comparison.cv_id !== request.cv.cvId ||
          comparison.job_id !== selectedJob.id
        )
          invalidResponse();
        // The assistant generation contract predates cv-match-v1. Keep its
        // allowlisted matching evidence shape while the nested match call uses
        // the strict provenance contract above; no raw CV/JD data is copied.
        matchingEvidence = this.toGenerationMatchingEvidence(comparison);
      }
      const generated = await this.aiServiceClient.generateRag({
        identity,
        normalized_user_message: request.message,
        intent: request.mode,
        locale: 'en',
        recent_history: history,
        filter_state: filterState,
        authorized_cv_snapshot: request.cv
          ? {
              cv_id: request.cv.cvId,
              content_hash: request.cv.contentHash,
              title: request.cv.title,
              target: null,
              skills: request.cv.skills.slice(0, 30),
              education: request.cv.education.slice(0, 30),
              experience: request.cv.experience.slice(0, 30),
              certificates: request.cv.certificates.slice(0, 30),
              sanitized_text: request.cv.sanitizedText,
              consent_version: request.consentVersion || null,
            }
          : null,
        canonical_active_job_context: contextJobs.map((job) => ({
          job_id: job.id,
          title: job.title,
          company_name: job.company?.name || 'Unknown company',
          location: job.location,
          level: job.level,
          salary:
            job.salary === null
              ? null
              : { amount: job.salary, currency: 'VND' },
          skills: job.skills.slice(0, 30),
          start_date: null,
          end_date: null,
        })),
        retrieval_evidence: retrievalEvidence,
        matching_evidence: matchingEvidence,
        explicit_filters: explicitFilters,
        policy,
        consent_version: request.cv ? request.consentVersion : null,
      });
      const response = this.toResponse(
        generated,
        request,
        retrievalEvidence.map((item) => item.citation_key),
        allowedJobIds,
        identity,
        filterState,
      );
      if (matchingEvidence) {
        response.blocks = [
          this.toDeterministicMatchBlock(matchingEvidence),
          ...response.blocks.filter((block) => block.type !== 'MATCH_RESULT'),
        ].slice(0, 20);
      }
      return response;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private validateRetrievalResponse(
    value: unknown,
    requestId: string,
    traceId: string,
  ): RetrievalResponse {
    if (!isRecord(value)) invalidResponse();
    assertExactKeys(value, [
      'request_id',
      'trace_id',
      'job_ids',
      'results',
      'applied_filters',
      'unsupported_filters',
    ]);
    if (value.request_id !== requestId || value.trace_id !== traceId)
      invalidResponse();
    if (!isUuid(value.request_id) || !isUuid(value.trace_id)) invalidResponse();
    assertStringArray(value.job_ids, 20, 64);
    if (value.job_ids.some((id) => !isUuid(id))) invalidResponse();
    if (!Array.isArray(value.results) || value.results.length > 20)
      invalidResponse();
    const results: RetrievalItem[] = value.results.map((item: unknown) => {
      if (!isRecord(item)) invalidResponse();
      assertExactKeys(item, ['job_id', 'rank', 'score', 'metadata']);
      if (!isUuid(item.job_id)) invalidResponse();
      if (
        !Number.isInteger(item.rank) ||
        (item.rank as number) < 1 ||
        (item.rank as number) > 20
      )
        invalidResponse();
      assertFiniteNumber(item.score, -1, 1);
      assertBoundedRecord(item.metadata, 20, 500);
      return {
        job_id: item.job_id,
        rank: item.rank as number,
        score: item.score,
        metadata: item.metadata,
      };
    });
    assertBoundedRecord(value.applied_filters, 30, 500);
    assertStringArray(value.unsupported_filters, 30, 500);
    return {
      request_id: value.request_id,
      trace_id: value.trace_id,
      results,
    };
  }

  private toResponse(
    value: unknown,
    request: CandidateAssistantAiRequest,
    allowedCitationKeys: string[],
    allowedJobIds: Set<string>,
    identity: {
      request_id: string;
      trace_id: string;
      client_message_id: string;
    },
    filterState: RecordValue,
  ): CandidateAssistantResponse {
    if (!isRecord(value)) invalidResponse();
    assertExactKeys(value, [
      'request_id',
      'trace_id',
      'client_message_id',
      'answer_status',
      'answer_blocks',
      'claims',
      'citation_keys',
      'referenced_job_ids',
      'filters',
      'state_delta',
      'degraded',
    ]);
    if (
      value.request_id !== identity.request_id ||
      value.trace_id !== identity.trace_id ||
      value.client_message_id !== identity.client_message_id ||
      !isUuid(value.request_id) ||
      !isUuid(value.trace_id) ||
      !isUuid(value.client_message_id) ||
      !['COMPLETE', 'DEGRADED', 'NO_EVIDENCE'].includes(
        String(value.answer_status),
      ) ||
      typeof value.degraded !== 'boolean'
    ) {
      invalidResponse();
    }
    if (!Array.isArray(value.answer_blocks) || value.answer_blocks.length > 20)
      invalidResponse();
    const blocks: CandidateAssistantBlock[] = value.answer_blocks.map(
      (block): CandidateAssistantBlock => {
        if (!isRecord(block)) invalidResponse();
        assertExactKeys(block, ['kind', 'text']);
        if (!['ADVICE', 'INFERENCE', 'REFUSAL'].includes(String(block.kind)))
          invalidResponse();
        assertString(block.text, 1, 2000);
        return { type: String(block.kind), text: String(block.text) };
      },
    );
    if (!Array.isArray(value.claims) || value.claims.length > 50)
      invalidResponse();
    const declaredCitations = new Set<string>();
    assertStringArray(value.citation_keys, 50, 64);
    for (const key of value.citation_keys) {
      if (
        !allowedCitationKeys.includes(key) ||
        !/^job:[0-9a-f-]{36}$/i.test(key)
      )
        invalidResponse();
      declaredCitations.add(key);
    }
    assertStringArray(value.referenced_job_ids, 20, 64);
    if (
      value.referenced_job_ids.some(
        (id) => !isUuid(id) || !allowedJobIds.has(id),
      )
    )
      invalidResponse();
    for (const claim of value.claims) {
      if (!isRecord(claim)) invalidResponse();
      assertExactKeys(claim, [
        'claim_id',
        'type',
        'subject_id',
        'value',
        'citation_keys',
      ]);
      assertString(claim.claim_id, 1, 64);
      if (typeof claim.type !== 'string' || !CLAIM_TYPES.has(claim.type))
        invalidResponse();
      if (
        claim.subject_id !== null &&
        (!isUuid(claim.subject_id) ||
          (!allowedJobIds.has(claim.subject_id) &&
            claim.subject_id !== request.cv?.cvId))
      )
        invalidResponse();
      if (
        typeof claim.value !== 'string' &&
        (!isRecord(claim.value) ||
          Object.keys(claim.value).length > 30 ||
          Object.values(claim.value).some(
            (item) =>
              item !== null &&
              !['string', 'number', 'boolean'].includes(typeof item),
          ))
      )
        invalidResponse();
      assertStringArray(claim.citation_keys, 10, 64);
      for (const key of claim.citation_keys) {
        if (!declaredCitations.has(key)) invalidResponse();
      }
    }
    const responseFilterState = validateFilterState(value.filters);
    if (
      !isRecord(value.state_delta) ||
      Object.keys(value.state_delta).length > 30
    )
      invalidResponse();
    const citations: CandidateAssistantCitation[] = [...declaredCitations].map(
      (key) => {
        const sourceId = key.slice('job:'.length);
        const job = request.jobs.find((item) => item.id === sourceId);
        return {
          sourceId,
          sourceType: 'JOB',
          ...(job ? { label: job.title } : {}),
        };
      },
    );
    return { blocks, citations, filterState: responseFilterState };
  }

  private toGenerationMatchingEvidence(
    match: MatchResponse,
  ): GenerationMatchingEvidence {
    return {
      cv_id: match.cv_id,
      job_id: match.job_id,
      overall_score: match.overall_score,
      components: match.components,
      matched_skills: match.matched_skills,
      missing_required_skills: match.missing_required_skills,
      strengths: match.strengths,
      gaps: match.gaps,
      explanation: match.explanation,
      degraded: match.degraded,
      scoring_version: match.scoring_version,
      semantic_component_version: match.semantic_component_version,
    };
  }

  private toDeterministicMatchBlock(
    match: GenerationMatchingEvidence,
  ): CandidateAssistantBlock {
    const components = Object.fromEntries(
      Object.entries(match.components)
        .slice(0, 20)
        .map(([name, component]) => [
          name.slice(0, 80),
          {
            score: component.score,
            weight: component.weight,
            available: component.available,
            evidence: component.evidence.slice(0, 20),
          },
        ]),
    );
    const scorePercent = Math.round(match.overall_score * 100);
    return {
      type: 'MATCH_RESULT',
      text: `Deterministic CV-job match score: ${scorePercent}%. ${match.explanation.slice(
        0,
        1000,
      )}`,
      data: {
        cv_id: match.cv_id,
        job_id: match.job_id,
        overall_score: match.overall_score,
        components,
        matched_skills: match.matched_skills.slice(0, 30),
        missing_required_skills: match.missing_required_skills.slice(0, 30),
        strengths: match.strengths.slice(0, 20),
        gaps: match.gaps.slice(0, 20),
        degraded: match.degraded,
        scoring_version: match.scoring_version,
        semantic_component_version: match.semantic_component_version,
      },
    };
  }

  private toFilterState(filters: Record<string, unknown>): RecordValue {
    const value = {
      company: typeof filters.company === 'string' ? filters.company : null,
      location: typeof filters.location === 'string' ? filters.location : null,
      level: typeof filters.level === 'string' ? filters.level : null,
      salary_min:
        typeof filters.salary_min === 'number' ? filters.salary_min : null,
      salary_max:
        typeof filters.salary_max === 'number' ? filters.salary_max : null,
      skills: Array.isArray(filters.skills)
        ? filters.skills
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 30)
        : [],
    };
    return validateFilterState(value);
  }

  private toMatchRequest(
    cv: NonNullable<CandidateAssistantAiRequest['cv']>,
    job: CandidateAssistantAiRequest['jobs'][number],
    identity: {
      request_id: string;
      trace_id: string;
      operation_attempt_id: string;
    },
  ) {
    const idempotencyFingerprint = createHash('sha256')
      .update(`${cv.cvId}:${cv.contentVersion}:${job.jobSourceVersion}`, 'utf8')
      .digest('hex');
    return {
      identity,
      cv_id: cv.cvId,
      job_id: job.id,
      content_hash: cv.contentHash,
      content_version: cv.contentVersion,
      job_source_version: job.jobSourceVersion,
      idempotency_key: `cv-match:${cv.cvId}:${idempotencyFingerprint}`,
      locale: 'en',
      candidate: {
        skills: cv.skills.slice(0, 200),
        years_experience: null,
        level: null,
        location: null,
        work_modes: [],
      },
      job: {
        required_skills: job.skills.slice(0, 200),
        preferred_skills: [],
        min_years_experience: null,
        max_years_experience: null,
        level: this.matchLevel(job.level),
        location: job.location,
        work_modes: [],
      },
    };
  }

  private matchLevel(
    value: string | null,
  ): 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'].includes(
      normalized,
    )
      ? (normalized as
          | 'intern'
          | 'junior'
          | 'mid'
          | 'senior'
          | 'lead'
          | 'principal')
      : null;
  }

  private mapError(error: unknown): CandidateAssistantProviderError {
    if (error instanceof CandidateAssistantProviderError) return error;
    if (error instanceof AiServiceError) {
      if (error.code === 'AI_SERVICE_TIMEOUT')
        return new CandidateAssistantProviderError('TIMEOUT');
      if (error.code === 'AI_SERVICE_RATE_LIMITED')
        return new CandidateAssistantProviderError('RATE_LIMITED');
      if (
        error.code === 'AI_SERVICE_UNAVAILABLE' ||
        error.code === 'AI_SERVICE_NOT_CONFIGURED'
      )
        return new CandidateAssistantProviderError('UNAVAILABLE');
      if (error.code === 'AI_INVALID_RESPONSE')
        return new CandidateAssistantProviderError('INVALID_RESPONSE');
    }
    return new CandidateAssistantProviderError('UNKNOWN');
  }
}
