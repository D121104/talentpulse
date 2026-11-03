import { ForbiddenException, ConflictException } from '@nestjs/common';
import { ApplicationsService } from 'src/applications/applications.service';
import { Role } from 'src/decorator/customize';
import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MatchAnalysisDto } from 'src/applications/dto/match-analysis.dto';
import { ApplicationsController } from 'src/applications/applications.controller';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';
import {
  AiServiceClient,
  AiServiceError,
} from 'src/ai-matching/ai-service.client';
import {
  analysisVersionKey,
  narrativeFacts,
  validateNarrative,
  fallbackNarrative,
  NarrativeRequest,
} from 'src/ai-matching/match-narrative';

function harness() {
  const component = {
    score: 0.8,
    weight: 0.3,
    available: true,
    evidence: ['private text'],
  };
  const result = {
    _id: 'result',
    applicationId: 'app',
    jobId: 'job',
    matchScore: 0.75,
    components: {
      semantic: component,
      skills: component,
      experience: component,
    },
    matchedSkills: ['TypeScript'],
    missingSkills: ['SQL'],
    contentHash: 'hash',
    application: {
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'v1',
      aiRankingConsentPolicyHash: 'policy',
      aiRankingConsentAt: new Date(0),
    },
    cv: { contentVersion: 'v1', parsedText: 'PRIVATE CV' },
  } as unknown as CVMatchResult;
  const entitlement = {
    role: Role.HR,
    limits: { canViewCandidateAiAnalysis: true },
  };
  const usersService = {
    getUserEntitlements: jest.fn().mockResolvedValue(entitlement),
    findOne: jest.fn().mockResolvedValue({ company: { _id: 'company' } }),
  };
  const cvProcessingService = {
    getRankedCandidates: jest.fn().mockResolvedValue([result]),
  };
  const aiServiceClient = {
    analyzeMatch: jest
      .fn()
      .mockImplementation(async (req: NarrativeRequest) =>
        fallbackNarrative(req),
      ),
  };
  const service = Object.assign(Object.create(ApplicationsService.prototype), {
    usersService,
    cvProcessingService,
    aiServiceClient,
    jobsService: {
      findOneForInternal: jest
        .fn()
        .mockResolvedValue({ _id: 'job', company: { _id: 'company' } }),
    },
    companyRepo: {
      findOne: jest.fn().mockResolvedValue({ _id: 'company', name: 'company' }),
    },
  }) as ApplicationsService;
  const dto = {
    locale: 'vi' as const,
    analysisVersionKey: analysisVersionKey(result),
  };
  const user = { _id: 'hr', role: Role.ADMIN } as Parameters<
    ApplicationsService['getMatchAnalysis']
  >[3];
  const call = () => service.getMatchAnalysis('job', 'app', dto, user);
  return {
    service,
    usersService,
    cvProcessingService,
    aiServiceClient,
    result,
    dto,
    user,
    call,
    entitlement,
  };
}

describe('on-demand match narrative', () => {
  it('uses the exact authorized ranked query and anonymous typed facts', async () => {
    const h = harness();
    const response = await h.call();
    expect(h.cvProcessingService.getRankedCandidates).toHaveBeenCalledWith(
      'job',
      1,
      expect.any(String),
      'app',
    );
    expect(h.usersService.getUserEntitlements).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      source: 'llm',
      fallbackReason: null,
      locale: 'vi',
      evidenceLabels: { m0: 'TypeScript', g0: 'SQL' },
    });
    const req = h.aiServiceClient.analyzeMatch.mock.calls[0][0];
    expect(JSON.stringify(req)).not.toMatch(
      /PRIVATE|TypeScript|SQL|private text|contentHash|applicationId/,
    );
    expect(req.facts.compatibility.location.weight).toBe(0);
  });

  it.each([Role.USER, Role.HR])(
    'rejects unauthorized or expired entitlement (%s) without generation',
    async (role) => {
      const h = harness();
      h.entitlement.role = role;
      h.entitlement.limits.canViewCandidateAiAnalysis = false;
      await expect(h.call()).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.aiServiceClient.analyzeMatch).not.toHaveBeenCalled();
    },
  );
  it('rejects another company', async () => {
    const h = harness();
    h.usersService.findOne.mockResolvedValue({ company: { _id: 'other' } });
    await expect(h.call()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['missing', 'wrong-application', 'version'])(
    'rejects noncurrent snapshot: %s',
    async (mode) => {
      const h = harness();
      if (mode === 'missing')
        h.cvProcessingService.getRankedCandidates.mockResolvedValue([]);
      if (mode === 'wrong-application') h.result.applicationId = 'other';
      if (mode === 'version') h.result.scoringVersion = 'changed';
      await expect(h.call()).rejects.toBeInstanceOf(ConflictException);
      expect(h.aiServiceClient.analyzeMatch).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'rechecks revoked consent even after provider failure=%s',
    async (failure) => {
      const h = harness();
      h.aiServiceClient.analyzeMatch.mockImplementation(async () => {
        h.cvProcessingService.getRankedCandidates.mockResolvedValue([]);
        if (failure) throw new AiServiceError('AI_SERVICE_TIMEOUT');
        return fallbackNarrative({
          locale: 'vi',
          facts: narrativeFacts(h.result),
        } as NarrativeRequest);
      });
      await expect(h.call()).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('rechecks expired entitlement after generation', async () => {
    const h = harness();
    h.aiServiceClient.analyzeMatch.mockImplementation(async (req) => {
      h.entitlement.limits.canViewCandidateAiAnalysis = false;
      return fallbackNarrative(req);
    });
    await expect(h.call()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects a result updated while generation is in flight', async () => {
    const h = harness();
    h.aiServiceClient.analyzeMatch.mockImplementation(async (req) => {
      h.result.matchScore = 0.5;
      return fallbackNarrative(req);
    });
    await expect(h.call()).rejects.toBeInstanceOf(ConflictException);
  });
  it('rechecks company membership after a failed provider call', async () => {
    const h = harness();
    h.aiServiceClient.analyzeMatch.mockImplementation(async () => {
      h.usersService.findOne.mockResolvedValue({ company: { _id: 'other' } });
      throw new AiServiceError('AI_SERVICE_TIMEOUT');
    });
    await expect(h.call()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('builds an English fallback from facts rather than stored explanation', async () => {
    const h = harness();
    h.result.explanation = 'Stored explanation must never be returned';
    h.dto.analysisVersionKey = analysisVersionKey(h.result);
    h.aiServiceClient.analyzeMatch.mockRejectedValue(
      new AiServiceError('AI_SERVICE_UNAVAILABLE'),
    );
    const response = await h.service.getMatchAnalysis(
      'job',
      'app',
      { ...h.dto, locale: 'en' },
      h.user,
    );
    expect(response.analysis.summary.text).toBe(
      'This automated comparison is not a hiring decision.',
    );
    expect(JSON.stringify(response)).not.toContain(h.result.explanation);
  });
  it.each([
    ['AI_SERVICE_TIMEOUT', 'provider_timeout'],
    ['AI_INVALID_RESPONSE', 'invalid_output'],
    ['AI_SERVICE_UNAVAILABLE', 'provider_unavailable'],
  ] as const)('marks provider failure %s honestly', async (code, reason) => {
    const h = harness();
    h.aiServiceClient.analyzeMatch.mockRejectedValue(new AiServiceError(code));
    const response = await h.call();
    expect(response).toMatchObject({
      source: 'deterministic_fallback',
      fallbackReason: reason,
      locale: 'vi',
    });
    expect(response.analysis.summary.text).toContain('đối chiếu');
  });
  it('never falls back on upstream authorization failure', async () => {
    const h = harness();
    h.aiServiceClient.analyzeMatch.mockRejectedValue(
      new AiServiceError('AI_SERVICE_AUTH_FAILED'),
    );
    await expect(h.call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.usersService.getUserEntitlements).toHaveBeenCalledTimes(2);
  });
});

describe('AI narrative schema boundary', () => {
  function fixture() {
    const h = harness();
    const req: NarrativeRequest = {
      identity: { request_id: 'a', trace_id: 'b', operation_attempt_id: 'c' },
      analysis_version_key: h.dto.analysisVersionKey,
      locale: 'en',
      narrative_version: 'match-narrative-v1',
      facts: narrativeFacts(h.result),
    };
    const response = {
      ...fallbackNarrative(req),
      identity: req.identity,
      analysis_version_key: req.analysis_version_key,
      locale: req.locale,
      narrative_version: req.narrative_version,
      source: 'llm',
    };
    return { req, response };
  }
  it('accepts closed grounded output', () => {
    const { req, response } = fixture();
    expect(validateNarrative(response, req).strengths).toHaveLength(1);
  });
  it.each([
    'identity',
    'key',
    'locale',
    'source',
    'extra',
    'unavailable',
    'polarity',
    'long',
    'number',
    'empty',
  ])('rejects %s', (mode) => {
    const { req, response } = fixture();
    if (mode === 'identity')
      response.identity = { ...response.identity, trace_id: 'wrong' };
    if (mode === 'key') response.analysis_version_key = 'wrong';
    if (mode === 'locale') response.locale = 'vi';
    if (mode === 'source') response.source = 'fallback';
    if (mode === 'extra')
      Object.assign(response, { privateText: 'unexpected' });
    if (mode === 'unavailable') response.summary.evidence = ['location'];
    if (mode === 'polarity') response.strengths[0].evidence = ['g0'];
    if (mode === 'long') response.summary.text = 'x'.repeat(301);
    if (mode === 'number') response.summary.text = 'Score 99%';
    if (mode === 'empty') response.summary.evidence = [];
    expect(() => validateNarrative(response, req)).toThrow();
  });
  it('uses signed match scope and a fixed transport timeout', async () => {
    const client = Object.create(AiServiceClient.prototype) as AiServiceClient;
    const { req, response } = fixture();
    const post = jest.fn().mockResolvedValue(response);
    Object.assign(client, { post, scopes: { match: 'cv:match' } });
    await client.analyzeMatch(req);
    expect(post).toHaveBeenCalledWith(
      '/internal/v1/cv/match-analysis',
      req,
      'cv:match',
      25000,
    );
  });
});

describe('narrative HTTP contract', () => {
  const handler = ApplicationsController.prototype.getMatchAnalysis;
  it('validates locale, hex key and rejects extra body fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = { type: 'body' as const, metatype: MatchAnalysisDto };
    for (const body of [
      { locale: 'fr', analysisVersionKey: 'a'.repeat(64) },
      { locale: 'en', analysisVersionKey: 'bad' },
      { locale: 'en', analysisVersionKey: 'a'.repeat(64), prompt: 'untrusted' },
    ])
      await expect(pipe.transform(body, metadata)).rejects.toThrow();
    await expect(
      pipe.transform(
        { locale: 'en', analysisVersionKey: 'a'.repeat(64) },
        metadata,
      ),
    ).resolves.toBeDefined();
  });
  it('declares JWT/role/throttle guards, HTTP 200 and no-store', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      RolesGuard,
      ThrottlerGuard,
    ]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });
  it('enforces the route-specific five requests per minute limit', async () => {
    let hits = 0;
    const increment = jest.fn(async () => ({
      totalHits: ++hits,
      timeToExpire: 60,
    }));
    const guard = new ThrottlerGuard(
      [{ ttl: 60000, limit: 100 }],
      { increment },
      new Reflector(),
    );
    await guard.onModuleInit();
    const context = {
      getHandler: () => handler,
      getClass: () => ApplicationsController,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1', headers: {} }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
    for (let i = 0; i < 5; i++)
      await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'ThrottlerException',
    );
    expect(increment).toHaveBeenCalledWith(expect.any(String), 60000);
  });
});
