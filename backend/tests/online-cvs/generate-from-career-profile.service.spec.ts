import {
  ForbiddenException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { Role } from 'src/decorator/customize';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { User } from 'src/users/entities/user.entity';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  name: 'Candidate',
  role: Role.USER,
} as any;

const profile = {
  _id: '71111111-1111-4111-8111-111111111111',
  userId: user._id,
  contentVersion: 7,
  contact: {
    fullName: 'Candidate',
    email: user.email,
    phone: '0900000000',
    link: null,
    address: 'Hanoi',
    avatar: null,
  },
  headline: 'Backend engineer',
  objective: 'Build reliable systems',
  experience: [
    {
      companyName: 'Source Labs',
      position: 'Backend engineer',
      startDate: '2022-01',
      endDate: null,
      description: 'Built a payment service.',
    },
  ],
  education: [],
  projects: [
    {
      projectName: 'TalentPulse',
      role: 'Developer',
      startDate: '2024-01',
      endDate: null,
      description: 'Recruitment platform',
      technologies: ['NestJS'],
    },
  ],
  certificates: [],
  skills: [{ name: 'NestJS', level: 'advanced', description: null }],
  activities: [],
  awards: [],
};

function generatedDraft(request: any) {
  return {
    request_id: request.identity.request_id,
    trace_id: request.identity.trace_id,
    operation_attempt_id: request.identity.operation_attempt_id,
    candidate_id: request.candidate.candidate_id,
    target_job_id: request.job.job_id,
    template_type: request.template_type,
    generation_mode: 'EDITOR_ONLY',
    full_name: request.candidate.full_name,
    title: 'Backend Engineer CV',
    position: 'Backend engineer',
    email: request.candidate.email,
    phone: request.candidate.phone,
    link: request.candidate.link,
    address: request.candidate.address,
    career_objective: 'Build reliable services.',
    education: [],
    projects: [
      {
        project_name: 'TalentPulse',
        source_index: 0,
        role: 'Developer',
        start_date: '2024-01',
        end_date: null,
        description: 'A hiring platform.',
        technologies: ['NestJS'],
        bullets: ['Built a hiring platform.'],
      },
    ],
    work_experience: [
      {
        company_name: 'Source Labs',
        position: 'Backend engineer',
        start_date: '2022-01',
        end_date: null,
        description: 'Built a payment service.',
        source_index: 0,
        bullets: ['Built payment APIs.'],
      },
    ],
    skills: [{ name: 'Backend', description: 'NestJS' }],
    activities: [],
    certificates: [],
    awards: [],
    section_order: ['objective', 'experience', 'projects', 'skills'],
    warnings: [],
    generated_by: 'ai-service',
    source_version: request.source_version,
    content_version: request.content_version,
  };
}

function createService() {
  let currentCv: any;
  const onlineCVRepo: any = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(async () => currentCv || null),
    findOneOrFail: jest.fn(async () => currentCv),
    update: jest.fn(async (_criteria, patch) => {
      currentCv = { ...currentCv, ...patch };
      return { affected: 1 };
    }),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      currentCv = { ...value, _id: 'cv-1' };
      return currentCv;
    }),
  };
  const jobRepository = { findOne: jest.fn().mockResolvedValue(null) };
  const userRepository = {
    findOne: jest.fn().mockResolvedValue({
      ...user,
      isDeleted: false,
      isVerified: true,
      isPremium: false,
    }),
  };
  const companyRepository = {
    findOne: jest.fn().mockResolvedValue({
      _id: '61111111-1111-4111-8111-111111111111',
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    }),
  };
  const profileRepository = {
    findOne: jest.fn(async () => profile),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === OnlineCV) return onlineCVRepo;
      if (entity === User) return userRepository;
      if (entity === Job) return jobRepository;
      if (entity === Company) return companyRepository;
      return profileRepository;
    }),
  };
  onlineCVRepo.manager = { transaction: jest.fn((work) => work(manager)) };

  const aiServiceClient: any = { generateCvDraft: jest.fn() };
  aiServiceClient.generateCvDraftReview = jest.fn(async (request) => ({
    implementation: 'agent',
    draft: generatedDraft(request),
    review_metadata: {
      source_refs_by_path: {
        '/career_objective': ['/candidate/career_objective'],
        '/work_experience/0/bullets/0': ['/candidate/experience/0/description'],
      },
      field_origins_by_path: {
        '/career_objective': 'AI_SUGGESTED',
        '/work_experience/0/bullets/0': 'AI_SUGGESTED',
      },
      omissions_by_path: [],
    },
  }));

  const service = Object.create(OnlineCVsService.prototype) as OnlineCVsService;
  Object.assign(service as any, {
    onlineCVRepo,
    userRepo: userRepository,
    usersService: {
      isCandidatePremium: jest.fn().mockReturnValue(false),
      getUserMaxCvLimit: jest.fn().mockReturnValue(3),
    },
    aiCvConsentsService: {
      hasValidConsent: jest.fn().mockResolvedValue(true),
      lockScope: jest.fn().mockResolvedValue(undefined),
    },
    aiServiceClient,
    jobsService: { findOne: jobRepository.findOne },
    companyRepository,
    configService: { get: jest.fn() },
    careerProfileService: { requireMine: jest.fn().mockResolvedValue(profile) },
    pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
  });

  return {
    service,
    onlineCVRepo,
    aiServiceClient,
    jobRepository,
    userRepository,
    companyRepository,
    profileRepository,
    careerProfileService: (service as any).careerProfileService,
    consent: (service as any).aiCvConsentsService,
    currentCv: () => currentCv,
  };
}

describe('OnlineCVsService.generateFromCareerProfile', () => {
  it('stages one Agent draft and leaves canonical profile content unchanged', async () => {
    const fixture = createService();

    await fixture.service.generateFromCareerProfile({ locale: 'vi-VN' }, user);

    expect(fixture.aiServiceClient.generateCvDraftReview).toHaveBeenCalledTimes(
      1,
    );
    const request =
      fixture.aiServiceClient.generateCvDraftReview.mock.calls[0][0];
    expect(request.locale).toBe('vi-VN');
    expect(request.consent_version).toBeTruthy();
    expect(fixture.currentCv().workExperience[0].description).toBe(
      'Built a payment service.',
    );
    expect(fixture.currentCv().projects[0].description).toBe(
      'Recruitment platform',
    );
    expect(
      fixture.currentCv().generationSnapshot.pendingDraft.draft
        .work_experience[0].bullets,
    ).toEqual(['Built payment APIs.']);
    expect(
      fixture.currentCv().revision.sourceTrace.generation.implementation,
    ).toBe('agent');
    expect(
      fixture.currentCv().generationSnapshot.localizationRetry,
    ).toBeUndefined();
    expect(
      fixture.currentCv().revision.sourceTrace.skillGroups,
    ).toBeUndefined();
    expect(fixture.onlineCVRepo.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a legacy response and never writes it as a generated CV', async () => {
    const fixture = createService();
    fixture.aiServiceClient.generateCvDraftReview.mockImplementationOnce(
      async (request) => ({
        implementation: 'legacy',
        draft: generatedDraft(request),
        review_metadata: {
          source_refs_by_path: {},
          field_origins_by_path: {},
          omissions_by_path: [],
        },
      }),
    );

    await expect(
      fixture.service.generateFromCareerProfile({}, user),
    ).rejects.toThrow(BadGatewayException);
    expect(fixture.onlineCVRepo.save).not.toHaveBeenCalled();
    expect(fixture.onlineCVRepo.update).not.toHaveBeenCalled();
  });

  it('checks consent before calling the provider', async () => {
    const fixture = createService();
    fixture.consent.hasValidConsent.mockResolvedValue(false);

    await expect(
      fixture.service.generateFromCareerProfile({}, user),
    ).rejects.toThrow(ForbiddenException);
    expect(
      fixture.aiServiceClient.generateCvDraftReview,
    ).not.toHaveBeenCalled();
    expect(fixture.onlineCVRepo.save).not.toHaveBeenCalled();
  });

  it('does not stage a draft if the source profile changes during generation', async () => {
    const fixture = createService();
    fixture.careerProfileService.requireMine
      .mockResolvedValueOnce(profile)
      .mockResolvedValue({
        ...profile,
        contentVersion: profile.contentVersion + 1,
      });

    await expect(
      fixture.service.generateFromCareerProfile({}, user),
    ).rejects.toThrow(ConflictException);
    expect(fixture.onlineCVRepo.save).not.toHaveBeenCalled();
    expect(fixture.onlineCVRepo.update).not.toHaveBeenCalled();
  });

  it('keeps a selected job attached to the structured Agent request', async () => {
    const fixture = createService();
    const job = {
      _id: '51111111-1111-4111-8111-111111111111',
      name: 'Senior Backend Engineer',
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      company: { _id: '61111111-1111-4111-8111-111111111111' },
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      startDate: new Date('2000-01-01T00:00:00Z'),
      endDate: new Date('2099-01-01T00:00:00Z'),
    };
    fixture.jobRepository.findOne.mockResolvedValue(job);

    await fixture.service.generateFromCareerProfile({ jobId: job._id }, user);

    expect(
      fixture.aiServiceClient.generateCvDraftReview.mock.calls[0][0].job.job_id,
    ).toBe(job._id);
    expect(
      fixture.currentCv().generationSnapshot.pendingDraft.draft.target_job_id,
    ).toBe(job._id);
  });
});
