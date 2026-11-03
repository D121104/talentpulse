import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import * as clientExports from 'src/ai-matching/ai-service.client';
import { AiServiceError } from 'src/ai-matching/ai-service.common';
import {
  matchOwnedSkillMembers,
  ownedSkillLiterals,
  validateCvDraftRequest,
} from 'src/ai-matching/ai-service.cv-draft';
import { validateJobDeleteRequest } from 'src/ai-matching/ai-service.indexing';
import {
  validateMatchRequest,
  validateParseRequest,
} from 'src/ai-matching/ai-service.match-parse';
import { AiServiceTransport } from 'src/ai-matching/ai-service.transport';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { CVProcessingService } from 'src/ai-matching/cv-processing.service';

// Type-only exports must also remain importable through the original path.
export type LegacyPublicContracts = [
  clientExports.AiMediaType,
  clientExports.CVParseRequest,
  clientExports.CVParseResponse,
  clientExports.CvDraftCandidateExperience,
  clientExports.CvDraftCandidateEducation,
  clientExports.CvDraftCandidateProject,
  clientExports.CvDraftProject,
  clientExports.CvDraftCandidate,
  clientExports.CvDraftJob,
  clientExports.CvDraftRequest,
  clientExports.CvDraftResponse,
  clientExports.AiExperienceLevel,
  clientExports.AiWorkMode,
  clientExports.CVProfileSnapshot,
  clientExports.JobProfileSnapshot,
  clientExports.CanonicalJobSnapshot,
  clientExports.JobIndexIdentity,
  clientExports.MatchIdentity,
  clientExports.JobIndexUpsertRequest,
  clientExports.JobIndexDeleteRequest,
  clientExports.JobIndexOperation,
  clientExports.JobIndexStatus,
  clientExports.JobIndexResponse,
  clientExports.JobIndexingClient,
  clientExports.MatchRequest,
  clientExports.MatchComponent,
  clientExports.MatchResponse,
  clientExports.AiServiceErrorCode,
];

describe('AI client extraction compatibility', () => {
  it('preserves the runtime exports and helper identities at the original path', () => {
    expect(Object.keys(clientExports).sort()).toEqual([
      'AiServiceClient',
      'AiServiceError',
      'matchOwnedSkillMembers',
      'ownedSkillLiterals',
    ]);
    expect(clientExports.AiServiceError).toBe(AiServiceError);
    expect(clientExports.matchOwnedSkillMembers).toBe(matchOwnedSkillMembers);
    expect(clientExports.ownedSkillLiterals).toBe(ownedSkillLiterals);
  });

  it('preserves error constructor defaults and explicit retry flags', () => {
    const error = new clientExports.AiServiceError('AI_INVALID_RESPONSE');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AiServiceError);
    expect(error.name).toBe('AiServiceError');
    expect(error.message).toBe('AI_INVALID_RESPONSE');
    expect(error.code).toBe('AI_INVALID_RESPONSE');
    expect(error.retryable).toBe(false);
    const retryable = new clientExports.AiServiceError(
      'AI_SERVICE_TIMEOUT',
      'AI service request timed out',
      true,
    );
    expect(retryable.message).toBe('AI service request timed out');
    expect(retryable.retryable).toBe(true);
  });

  it('uses one error class across the extracted validators and transport', async () => {
    const invalid = undefined as never;
    for (const validate of [
      () => validateParseRequest(invalid),
      () => validateMatchRequest(invalid),
      () => validateCvDraftRequest(invalid),
      () => validateJobDeleteRequest(invalid),
    ]) {
      expect(validate).toThrow(clientExports.AiServiceError);
    }
    const transport = new AiServiceTransport(new ConfigService({}));
    await expect(
      transport.post('/internal/v1/cv/parse', {}, 'cv:parse'),
    ).rejects.toBeInstanceOf(clientExports.AiServiceError);
  });

  it('keeps the injectable ConfigService constructor and active module providers', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', clientExports.AiServiceClient),
    ).toEqual([ConfigService]);
    expect(
      Reflect.getMetadata('__injectable__', clientExports.AiServiceClient),
    ).toBe(true);
    const providers: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AIMatchingModule,
    );
    expect(providers).toContain(clientExports.AiServiceClient);
    expect(providers).toContain(CVProcessingService);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'function' &&
          provider.name === 'AIMatchingService',
      ),
    ).toBe(false);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, AIMatchingModule),
    ).toEqual([clientExports.AiServiceClient, CVProcessingService]);
  });
});
