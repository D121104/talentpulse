import { ApplicationStatus } from 'src/applications/entities/application.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import {
  CVProcessingProcessor,
  CVProcessingJobData,
  consentIdempotencyKey,
  getJobSourceVersion,
} from './cv-processing.processor';
import { CVProcessingStatus } from './entities/cv-match-result.entity';

describe('CVProcessingProcessor', () => {
  const ids = {
    result: '00000000-0000-4000-8000-000000000001',
    cv: '00000000-0000-4000-8000-000000000002',
    application: '00000000-0000-4000-8000-000000000003',
    user: '00000000-0000-4000-8000-000000000004',
    job: '00000000-0000-4000-8000-000000000005',
  };
  const data: CVProcessingJobData = {
    cvMatchResultId: ids.result,
    cvId: ids.cv,
    applicationId: ids.application,
    userId: ids.user,
    jobId: ids.job,
    cvContentVersion: 'cv-v1',
    contentHash: 'a'.repeat(64),
    jobSourceVersion: getJobSourceVersion({
      _id: ids.job,
      name: 'Backend Engineer',
      description: 'Canonical job description',
      skills: ['TypeScript', 'NestJS'],
      level: 'senior',
      isDeleted: false,
      deletedAt: null,
    }),
    aiRankingConsentGranted: true,
    aiRankingConsentVersion: 'application-ai-ranking-v1',
    aiRankingConsentPolicyHash: 'b'.repeat(64),
    consentIdempotencyKey: consentIdempotencyKey(
      ids.application,
      'cv-v1',
      getJobSourceVersion({
        _id: ids.job,
        name: 'Backend Engineer',
        description: 'Canonical job description',
        skills: ['TypeScript', 'NestJS'],
        level: 'senior',
        isDeleted: false,
        deletedAt: null,
      }),
    ),
  };

  function setup() {
    const resultRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const cvRepo = { findOne: jest.fn() };
    const jobRepo = { findOne: jest.fn() };
    const applicationRepo = { findOne: jest.fn() };
    const aiServiceClient = { matchCv: jest.fn() };
    const processor = new CVProcessingProcessor(
      aiServiceClient as any,
      resultRepo as any,
      cvRepo as any,
      jobRepo as any,
      applicationRepo as any,
    );
    return {
      processor,
      resultRepo,
      cvRepo,
      jobRepo,
      applicationRepo,
      aiServiceClient,
    };
  }

  function canonicalRecords() {
    return {
      result: {
        _id: ids.result,
        cvId: ids.cv,
        userId: ids.user,
        applicationId: ids.application,
        jobId: ids.job,
        contentHash: data.contentHash,
        jobSourceVersion: data.jobSourceVersion,
        isDeleted: false,
        deletedAt: null,
        status: CVProcessingStatus.PENDING,
      },
      cv: {
        _id: ids.cv,
        userId: ids.user,
        contentVersion: data.cvContentVersion,
        contentHash: data.contentHash,
        parseStatus: CVParseStatus.READY,
        parsedText: 'canonical CV text must never be in the queue',
        skills: ['TypeScript'],
        isDeleted: false,
        deletedAt: null,
      },
      application: {
        _id: ids.application,
        cvId: ids.cv,
        userId: ids.user,
        jobId: ids.job,
        isDeleted: false,
        deletedAt: null,
        status: ApplicationStatus.PENDING,
        aiRankingConsentGranted: true,
        aiRankingConsentVersion: data.aiRankingConsentVersion,
        aiRankingConsentPolicyHash: data.aiRankingConsentPolicyHash,
        aiRankingConsentAt: new Date(),
      },
      job: {
        _id: ids.job,
        name: 'Backend Engineer',
        description: 'Canonical job description',
        skills: ['TypeScript', 'NestJS'],
        level: 'senior',
        isDeleted: false,
        deletedAt: null,
      },
    };
  }

  it('reloads canonical records and sends only canonical snapshots to AI', async () => {
    const setupResult = setup();
    const records = canonicalRecords();
    setupResult.resultRepo.findOne.mockResolvedValue(records.result);
    setupResult.cvRepo.findOne.mockResolvedValue(records.cv);
    setupResult.jobRepo.findOne.mockResolvedValue(records.job);
    setupResult.applicationRepo.findOne.mockResolvedValue(records.application);
    setupResult.aiServiceClient.matchCv.mockResolvedValue({
      overall_score: 0.8,
      matched_skills: ['TypeScript'],
      missing_required_skills: ['NestJS'],
      strengths: [],
      gaps: [],
      explanation: 'matched',
      components: {},
      scoring_version: 'v1',
      semantic_component_version: 'v1',
      degraded: false,
    });

    const response = await setupResult.processor.handleProcessCV({
      data,
    } as any);

    expect(response).toEqual({ success: true, matchScore: 0.8 });
    expect(setupResult.applicationRepo.findOne).toHaveBeenCalledWith({
      where: { _id: ids.application },
    });
    expect(setupResult.aiServiceClient.matchCv).toHaveBeenCalledWith({
      cv_id: ids.cv,
      job_id: ids.job,
      candidate: expect.objectContaining({ skills: ['TypeScript'] }),
      job: expect.objectContaining({
        required_skills: ['TypeScript', 'NestJS'],
      }),
    });
    const aiRequest = setupResult.aiServiceClient.matchCv.mock.calls[0][0];
    expect(aiRequest.candidate).not.toHaveProperty('parsedText');
    expect(aiRequest.job).not.toHaveProperty('description');
  });

  it('passes explicit structured CV and job fields without deriving protected traits', async () => {
    const setupResult = setup();
    const records = canonicalRecords();
    Object.assign(records.cv, {
      yearsExperience: 6,
      level: 'senior',
      location: 'Hanoi',
      workModes: ['hybrid'],
    });
    Object.assign(records.job, {
      preferredSkills: ['Docker'],
      minYearsExperience: 3,
      maxYearsExperience: 8,
      workMode: 'hybrid',
    });
    const structuredJobSourceVersion = getJobSourceVersion(records.job);
    records.result.jobSourceVersion = structuredJobSourceVersion;
    const structuredData = {
      ...data,
      jobSourceVersion: structuredJobSourceVersion,
      consentIdempotencyKey: consentIdempotencyKey(
        ids.application,
        data.cvContentVersion,
        structuredJobSourceVersion,
      ),
    };
    setupResult.resultRepo.findOne.mockResolvedValue(records.result);
    setupResult.cvRepo.findOne.mockResolvedValue(records.cv);
    setupResult.jobRepo.findOne.mockResolvedValue(records.job);
    setupResult.applicationRepo.findOne.mockResolvedValue(records.application);
    setupResult.aiServiceClient.matchCv.mockResolvedValue({
      overall_score: 0.8,
      matched_skills: ['TypeScript'],
      missing_required_skills: ['NestJS'],
      strengths: [],
      gaps: [],
      explanation: 'matched',
      components: {
        location: { score: 1, weight: 0, available: true, evidence: [] },
        work_mode: { score: 1, weight: 0, available: true, evidence: [] },
      },
      scoring_version: 'v1',
      semantic_component_version: 'v1',
      degraded: false,
    });

    await setupResult.processor.handleProcessCV({
      data: structuredData,
    } as any);

    expect(setupResult.aiServiceClient.matchCv).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: {
          skills: ['TypeScript'],
          years_experience: 6,
          level: 'senior',
          location: 'Hanoi',
          work_modes: ['hybrid'],
        },
        job: {
          required_skills: ['TypeScript', 'NestJS'],
          preferred_skills: ['Docker'],
          min_years_experience: 3,
          max_years_experience: 8,
          level: 'senior',
          location: null,
          work_modes: ['hybrid'],
        },
      }),
    );
  });

  it('persists location and work-mode compatibility components', async () => {
    const setupResult = setup();
    const records = canonicalRecords();
    setupResult.resultRepo.findOne.mockResolvedValue(records.result);
    setupResult.cvRepo.findOne.mockResolvedValue(records.cv);
    setupResult.jobRepo.findOne.mockResolvedValue(records.job);
    setupResult.applicationRepo.findOne.mockResolvedValue(records.application);
    setupResult.aiServiceClient.matchCv.mockResolvedValue({
      overall_score: 0.8,
      matched_skills: ['TypeScript'],
      missing_required_skills: [],
      strengths: [],
      gaps: [],
      explanation: 'matched',
      components: {
        location: {
          score: 1,
          weight: 0,
          available: true,
          evidence: ['location match=true'],
        },
        work_mode: {
          score: 0,
          weight: 0,
          available: true,
          evidence: ['work mode overlap=false'],
        },
      },
      scoring_version: 'v1',
      semantic_component_version: 'v1',
      degraded: false,
    });

    await setupResult.processor.handleProcessCV({ data } as any);

    const persisted = setupResult.resultRepo.update.mock.calls.at(-1)[1];
    expect(persisted.compatibility).toEqual(
      expect.objectContaining({
        location: expect.objectContaining({ available: true, score: 1 }),
        workMode: expect.objectContaining({ available: true, score: 0 }),
      }),
    );
  });

  it.each([
    ['missing application', 'applicationRepo', null],
    ['deleted CV', 'cvRepo', { ...canonicalRecords().cv, isDeleted: true }],
    [
      'deleted application',
      'applicationRepo',
      { ...canonicalRecords().application, isDeleted: true },
    ],
    [
      'unauthorized application owner',
      'applicationRepo',
      {
        ...canonicalRecords().application,
        userId: '00000000-0000-4000-8000-000000000006',
      },
    ],
    [
      'stale CV content',
      'cvRepo',
      { ...canonicalRecords().cv, contentVersion: 'cv-v2' },
    ],
    [
      'stale job version',
      'jobRepo',
      { ...canonicalRecords().job, description: 'changed' },
    ],
  ])('skips %s before calling AI', async (_name, record, value) => {
    const setupResult = setup();
    const records = canonicalRecords();
    setupResult.resultRepo.findOne.mockResolvedValue(records.result);
    setupResult.cvRepo.findOne.mockResolvedValue(records.cv);
    setupResult.jobRepo.findOne.mockResolvedValue(records.job);
    setupResult.applicationRepo.findOne.mockResolvedValue(records.application);
    if (record === 'applicationRepo')
      setupResult.applicationRepo.findOne.mockResolvedValue(value);
    if (record === 'cvRepo')
      setupResult.cvRepo.findOne.mockResolvedValue(value);
    if (record === 'jobRepo')
      setupResult.jobRepo.findOne.mockResolvedValue(value);

    await expect(
      setupResult.processor.handleProcessCV({ data } as any),
    ).resolves.toEqual({
      success: false,
      stale: true,
    });
    expect(setupResult.aiServiceClient.matchCv).not.toHaveBeenCalled();
  });

  it('skips a revoked or policy-mismatched application consent', async () => {
    const setupResult = setup();
    const records = canonicalRecords();
    setupResult.resultRepo.findOne.mockResolvedValue(records.result);
    setupResult.cvRepo.findOne.mockResolvedValue(records.cv);
    setupResult.jobRepo.findOne.mockResolvedValue(records.job);
    setupResult.applicationRepo.findOne.mockResolvedValue({
      ...records.application,
      aiRankingConsentGranted: false,
    });

    await expect(
      setupResult.processor.handleProcessCV({ data } as any),
    ).resolves.toEqual({
      success: false,
      stale: true,
    });
    expect(setupResult.aiServiceClient.matchCv).not.toHaveBeenCalled();
  });
});
