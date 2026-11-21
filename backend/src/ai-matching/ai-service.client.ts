import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NarrativeRequest,
  MatchNarrative,
  validateNarrative,
  NarrativeValidationError,
} from './match-narrative';
import { AiServiceError } from './ai-service.common';
import { AiServiceTransport } from './ai-service.transport';
import {
  CVParseRequest,
  CVParseResponse,
  MatchRequest,
  MatchResponse,
  validateParseRequest,
  validateParseResponse,
  validateMatchRequest,
  validateMatchResponse,
} from './ai-service.match-parse';
import {
  CvDraftRequest,
  CvDraftReviewResponse,
  CvDraftResponse,
  validateCvDraftRequest,
  validateCvDraftReviewResponse,
  validateCvDraftResponse,
} from './ai-service.cv-draft';
import {
  JobIndexingClient,
  JobIndexUpsertRequest,
  JobIndexDeleteRequest,
  JobIndexResponse,
  validateJobUpsertRequest,
  validateJobDeleteRequest,
  validateJobIndexResponse,
} from './ai-service.indexing';

export {
  AiServiceError,
  AiServiceErrorCode,
  JobIndexIdentity,
} from './ai-service.common';
export {
  AiMediaType,
  CVParseRequest,
  CVParseResponse,
  AiExperienceLevel,
  AiWorkMode,
  CVProfileSnapshot,
  JobProfileSnapshot,
  MatchIdentity,
  MatchRequest,
  MatchComponent,
  MatchResponse,
} from './ai-service.match-parse';
export {
  CvDraftCandidateExperience,
  CvDraftCandidateEducation,
  CvDraftCandidateProject,
  CvDraftProject,
  CvDraftCandidate,
  CvDraftJob,
  CvDraftRequest,
  CvDraftReviewResponse,
  CvDraftResponse,
  matchOwnedSkillMembers,
  ownedSkillLiterals,
} from './ai-service.cv-draft';
export {
  CanonicalJobSnapshot,
  JobIndexUpsertRequest,
  JobIndexDeleteRequest,
  JobIndexOperation,
  JobIndexStatus,
  JobIndexResponse,
  JobIndexingClient,
} from './ai-service.indexing';

@Injectable()
export class AiServiceClient implements JobIndexingClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly transport: AiServiceTransport;
  private readonly scopes: AiServiceTransport['scopes'];

  constructor(config: ConfigService) {
    this.transport = new AiServiceTransport(config);
    this.scopes = this.transport.scopes;
  }

  async checkReadiness(timeoutMs = 1000): Promise<boolean> {
    return this.transport.checkReadiness(timeoutMs);
  }

  async parseCv(request: CVParseRequest): Promise<CVParseResponse> {
    validateParseRequest(request);
    return this.validateParseResponse(
      await this.post('/internal/v1/cv/parse', request, this.scopes.parse),
      request,
    );
  }

  async matchCv(
    request: MatchRequest,
    options?: { signal?: AbortSignal },
  ): Promise<MatchResponse> {
    validateMatchRequest(request);
    return validateMatchResponse(
      await this.post(
        '/internal/v1/cv/match',
        request,
        this.scopes.match,
        undefined,
        options?.signal,
      ),
      request,
    );
  }

  async analyzeMatch(request: NarrativeRequest): Promise<MatchNarrative> {
    const response = await this.post(
      '/internal/v1/cv/match-analysis',
      request,
      this.scopes.match,
      25000,
    );
    try {
      return validateNarrative(response, request);
    } catch (error) {
      this.logger.warn({
        event: 'match_narrative_validation_failed',
        reason:
          error instanceof NarrativeValidationError ? error.reason : 'schema',
      });
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid analysis response',
      );
    }
  }

  async generateCvDraft(
    request: CvDraftRequest,
    options?: { timeoutMs?: number },
  ): Promise<CvDraftResponse> {
    validateCvDraftRequest(request);
    return validateCvDraftResponse(
      await this.post(
        '/internal/v1/cv/draft',
        request,
        this.scopes.generateCv,
        options?.timeoutMs,
      ),
      request,
    );
  }

  async generateCvDraftReview(
    request: CvDraftRequest,
    options?: { timeoutMs?: number },
  ): Promise<CvDraftReviewResponse> {
    validateCvDraftRequest(request);
    return validateCvDraftReviewResponse(
      await this.post(
        '/internal/v1/cv/draft',
        request,
        this.scopes.generateCv,
        options?.timeoutMs,
        undefined,
        true,
      ),
      request,
    );
  }

  /**
   * The candidate assistant owns the RAG request/response schema. Keeping the
   * transport here reuses the existing signed, timed and sanitized AI boundary
   * without coupling this client to Python implementation details.
   */
  async retrieveRag(
    request: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown> {
    return this.post(
      '/internal/v1/rag/retrieve',
      request,
      this.scopes.retrieve,
      undefined,
      options?.signal,
    );
  }

  async generateRag(
    request: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown> {
    return this.post(
      '/internal/v1/rag/generate',
      request,
      this.scopes.generate,
      undefined,
      options?.signal,
    );
  }

  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    validateJobUpsertRequest(request);
    return validateJobIndexResponse(
      await this.post(
        '/internal/v1/index/jobs/upsert',
        request,
        this.scopes.jobsIndex,
      ),
      request,
      'UPSERT',
    );
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    validateJobDeleteRequest(request);
    return validateJobIndexResponse(
      await this.post(
        '/internal/v1/index/jobs/delete',
        request,
        this.scopes.jobsIndex,
      ),
      request,
      'DELETE',
    );
  }

  private validateParseResponse(
    value: unknown,
    request: CVParseRequest,
  ): CVParseResponse {
    return validateParseResponse(value, request);
  }

  private post(
    path: string,
    data: unknown,
    scope: string,
    timeoutMs?: number,
    signal?: AbortSignal,
    reviewMetadataOptIn = false,
  ): Promise<unknown> {
    return this.transport.post(
      path,
      data,
      scope,
      timeoutMs,
      signal,
      reviewMetadataOptIn,
    );
  }
}
