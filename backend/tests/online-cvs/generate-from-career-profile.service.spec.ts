import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { OnlineCvGenerationMode } from 'src/online-cvs/entities/online-cv.entity';
import { ConflictException } from '@nestjs/common';
import { Role } from 'src/decorator/customize';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { User } from 'src/users/entities/user.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  name: 'Candidate',
  role: Role.USER,
} as any;

function createService() {
  const onlineCVRepo = {
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ ...value, _id: 'cv-1' })),
  };
  const aiServiceClient = { generateCvDraft: jest.fn() };
  const service = Object.create(OnlineCVsService.prototype) as OnlineCVsService;
  Object.assign(service as any, {
    onlineCVRepo,
    userRepo: {
      findOne: jest.fn().mockResolvedValue({
        ...user,
        isDeleted: false,
        isVerified: true,
        isPremium: false,
        address: 'Hanoi',
      }),
    },
    usersService: {
      isCandidatePremium: jest.fn().mockReturnValue(false),
      getUserMaxCvLimit: jest.fn().mockReturnValue(3),
    },
    aiCvConsentsService: {
      hasValidConsent: jest.fn().mockResolvedValue(true),
      lockScope: jest.fn().mockResolvedValue(undefined),
    },
    aiServiceClient,
    jobsService: { findOne: jest.fn() },
    companyRepository: {
      findOne: jest.fn().mockResolvedValue({
        _id: '61111111-1111-4111-8111-111111111111',
        isActive: true,
        isDeleted: false,
        deletedAt: null,
      }),
    },
    configService: { get: jest.fn() },
    careerProfileService: {
      requireMine: jest.fn().mockResolvedValue({
        _id: 'profile-1',
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
        experience: [],
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
      }),
    },
  });
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === OnlineCV) return onlineCVRepo;
      if (entity === User) return (service as any).userRepo;
      if (entity === Job) return (service as any).jobsService;
      if (entity === Company) return (service as any).companyRepository;
      return {
        findOne: jest.fn(() =>
          (service as any).careerProfileService.requireMine(user),
        ),
      };
    }),
  };
  Object.assign(onlineCVRepo, {
    manager: { transaction: jest.fn((work) => work(manager)) },
  });
  return {
    service,
    onlineCVRepo,
    aiServiceClient,
    careerProfileService: (service as any).careerProfileService,
  };
}

function generatedDraft() {
  return {
    request_id: '21111111-1111-4111-8111-111111111111',
    trace_id: '31111111-1111-4111-8111-111111111111',
    operation_attempt_id: '41111111-1111-4111-8111-111111111111',
    candidate_id: user._id,
    target_job_id: '51111111-1111-4111-8111-111111111111',
    template_type: 'template1',
    generation_mode: 'EDITOR_ONLY',
    full_name: 'Candidate',
    title: 'CV - Candidate',
    position: 'Backend engineer',
    email: user.email,
    phone: '0900000000',
    link: null,
    address: 'Hanoi',
    career_objective: 'Build reliable systems',
    education: [],
    projects: [
      {
        project_name: 'TalentPulse',
        source_index: 0,
        role: 'Developer',
        start_date: '2024-01',
        end_date: null,
        description: 'Recruitment platform',
        technologies: ['NestJS'],
        bullets: [
          'Delivered a grounded project summary',
          'Improved recruiter search flow',
        ],
      },
    ],
    work_experience: [],
    skills: [{ name: 'Frameworks', description: 'NestJS' }],
    activities: [],
    certificates: [],
    awards: [],
    section_order: ['objective', 'experience', 'projects', 'skills'],
    warnings: [],
    generated_by: 'ai-service',
    source_version: '',
    content_version: 1,
  };
}

function canonicalJob() {
  return {
    _id: '51111111-1111-4111-8111-111111111111',
    name: 'Engineer',
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    company: { _id: '61111111-1111-4111-8111-111111111111' },
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    startDate: new Date('2000-01-01T00:00:00Z'),
    endDate: new Date('2099-01-01T00:00:00Z'),
  };
}

describe('OnlineCVsService.generateFromCareerProfile', () => {
  it.each([false, true])(
    'persists authoritative job-filtered skills (empty=%s)',
    async (empty) => {
      const { service, careerProfileService, aiServiceClient } =
        createService();
      const profile = await careerProfileService.requireMine();
      profile.skills = ['NodeJS', 'React', 'Kafka', 'Airflow', 'dbt'].map(
        (name) => ({ name }),
      );
      const before = JSON.stringify(profile);
      const job = {
        ...canonicalJob(),
        skills: empty ? ['Rust'] : ['NodeJS', 'React'],
        description: 'Preferred: TypeScript',
      };
      (service as any).jobsService.findOne.mockResolvedValue(job);
      const skills = empty
        ? []
        : [{ name: 'Frameworks', description: 'NodeJS; React' }];
      aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
        skills,
      }));
      const { draft } = await service.generateFromCareerProfile(
        { jobId: job._id },
        user,
      );
      const request = aiServiceClient.generateCvDraft.mock.calls[0][0];
      expect(request.job.required_skills).toEqual(job.skills);
      expect(request.job.preferred_skills).toEqual([]);
      expect(request.job.description).toBe(job.description);
      expect(request.candidate.skills).toEqual(
        profile.skills.map((skill) => skill.name),
      );
      expect(draft.skills).toEqual(skills);
      expect(draft.revision.sourceTrace.skillGroups).toEqual(
        empty ? [] : [{ ...skills[0], members: ['NodeJS', 'React'] }],
      );
      expect(draft.generationSnapshot.skills).toEqual(profile.skills);
      expect(draft.sourceProfileVersion).toBe(7);
      expect(JSON.stringify(profile)).toBe(before);
    },
  );

  it.each([
    ['en-US', 'Giao tiếp tốt', 'Good communication'],
    ['vi-VN', 'Problem Solving', 'Giải quyết vấn đề'],
    ['vi-VN', 'English', 'Tiếng Anh'],
  ])('original %s', async (...values) => {
    const [locale, source, display] = values;
    const { service, careerProfileService, aiServiceClient } = createService();
    const profile = await careerProfileService.requireMine();
    profile.skills = [{ name: source }];
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      skills: [{ name: 'Skills', description: display }],
    }));
    const { draft } = await service.generateFromCareerProfile(
      { locale: locale as 'en-US' | 'vi-VN' },
      user,
    );
    expect(draft.skills[0].description).toBe(display);
    expect(draft.revision.sourceTrace.skillGroups[0].members).toEqual([source]);
    expect(draft.generationSnapshot.skills[0].name).toBe(source);
  });

  it('preserves owned qualifications and delimiters inside skill literals', async () => {
    const { service, careerProfileService, aiServiceClient } = createService();
    const profile = await careerProfileService.requireMine();
    profile.skills = [
      { name: 'Python, SQL' },
      { name: 'Cloud; data' },
      { name: 'English', description: 'TOEIC 590; speaking, reading' },
    ];
    const literals = [
      'Python, SQL',
      'Cloud; data',
      'English (TOEIC 590; speaking, reading)',
    ];
    const sourceBefore = JSON.stringify(profile);
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      skills: [
        {
          name: 'Owned skills',
          description: request.candidate.skills.join('; '),
        },
      ],
    }));
    const { draft } = await service.generateFromCareerProfile({}, user);
    expect(
      aiServiceClient.generateCvDraft.mock.calls[0][0].candidate.skills,
    ).toEqual(literals);
    expect(draft.skills[0].description).toBe(literals.join('; '));
    expect(draft.revision.sourceTrace.skillGroups[0].members).toEqual(literals);
    expect(JSON.stringify(profile)).toBe(sourceBefore);
  });

  it.each([
    'Tiếng Anh (TOEIC  650)',
    'Tiếng Anh (TOEIC 590; advanced)',
    'Rust',
    'Good communication',
  ])('rejects unowned translated qualification %s', async (display) => {
    const { service, careerProfileService, aiServiceClient } = createService();
    const profile = await careerProfileService.requireMine();
    profile.skills = [{ name: 'English', description: 'TOEIC  590' }];
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      skills: [{ name: 'Languages', description: display }],
    }));
    await expect(
      service.generateFromCareerProfile({}, user),
    ).rejects.toMatchObject({ status: 502 });
  });

  it.each(['Rust', 'React', 'English (TOEIC 590)'])(
    'rejects unowned skill %s',
    async (description) => {
      const { service, aiServiceClient } = createService();
      aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
        skills: [{ name: 'Skills', description }],
      }));
      await expect(
        service.generateFromCareerProfile({}, user),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it.each([[4, 1, 3], []])('selected %j', async (...projectIndices) => {
    const { service, careerProfileService, aiServiceClient } = createService();
    const profile = await careerProfileService.requireMine();
    profile.experience = Array.from({ length: 5 }, (_, index) => ({
      companyName: `Company ${index}`,
      position: `Historical role ${index}`,
      startDate: `202${index}-01`,
      endDate: null,
      description: `Original ${index}`,
    }));
    profile.projects = [
      { projectName: '', role: null },
      ...Array.from({ length: 5 }, (_, index) => ({
        projectName: `Project ${index}`,
        role: `Original role ${index}`,
        startDate: `202${index}-02`,
        endDate: null,
        description: `Original project ${index}`,
        technologies: ['Python'],
      })),
    ];
    profile.skills = [{ name: 'Python' }, { name: 'SQL' }];
    const sourceBefore = JSON.stringify(profile);
    const selected = [4, 1, 3];
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      work_experience: selected.map((source_index) => ({
        ...request.candidate.experience[source_index],
        source_index,
        bullets: [`Selected experience ${source_index}`],
      })),
      projects: projectIndices.map((source_index) => ({
        ...request.candidate.projects[source_index],
        source_index,
        bullets: [`Selected project ${source_index}`],
      })),
      skills: [{ name: 'Programming', description: 'Python; SQL' }],
    }));
    const { draft } = await service.generateFromCareerProfile({}, user);
    expect(draft.workExperience.map((entry) => entry.companyName)).toEqual(
      selected.map((index) => `Company ${index}`),
    );
    expect(draft.workExperience.map((entry) => entry.startDate)).toEqual(
      selected.map((index) => `202${index}-01`),
    );
    expect(draft.projects.map((entry) => entry.projectName)).toEqual(
      projectIndices.map((index) => `Project ${index}`),
    );
    expect(draft.revision.sourceTrace.experienceSourceIndices).toEqual(
      selected,
    );
    expect(draft.revision.sourceTrace.projectSourceIndices).toEqual(
      projectIndices,
    );
    expect(draft.skills).toEqual([
      { name: 'Programming', description: 'Python; SQL' },
    ]);
    expect(draft.generationSnapshot.experience).toHaveLength(5);
    expect(JSON.stringify(profile)).toBe(sourceBefore);
  });

  it.each([
    [
      'en-US',
      'Senior Fullstack Developer (NodeJS / React)',
      'Applying for: Machine Learning Engineer',
      'Senior Fullstack Developer (NodeJS / React)',
    ],
    ['vi-VN', 'Data Analyst', 'Ứng tuyển: Kỹ sư phần mềm', 'Data Analyst'],
    [
      'vi-VN',
      'Senior Fullstack Developer (NodeJS / React)',
      'Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)',
      'Senior Fullstack Developer (NodeJS / React)',
    ],
    [
      'vi-VN',
      'AI / Machine Learning Engineer (Python & PyTorch)',
      'Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)',
      'Kỹ sư AI / học máy (Python & PyTorch)',
    ],
    [
      'vi-VN',
      'Senior Fullstack Developer (NodeJS / React)',
      'Ứng tuyển: Lập trình viên full-stack cấp cao (NodeJS / React)',
      'Lập trình viên full-stack cấp cao (NodeJS / React)',
    ],
    ['vi-VN', 'ML Engineer', 'Ứng tuyển: Kỹ sư học máy', 'Kỹ sư học máy'],
    [
      'en-US',
      'Senior Fullstack Developer (NodeJS / React)',
      'Applying for:   Senior   Fullstack Developer (NodeJS / React)  ',
      'Senior Fullstack Developer (NodeJS / React)',
    ],
  ])('binds %s/%s', async (...scenario) => {
    const [locale, name, position, expectedRole] = scenario;
    const { service, aiServiceClient } = createService();
    const job = { ...canonicalJob(), name };
    (service as any).jobsService.findOne.mockResolvedValue(job);
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      position,
    }));
    const { draft } = await service.generateFromCareerProfile(
      { jobId: job._id, locale: locale as 'vi-VN' | 'en-US' },
      user,
    );
    const prefix = locale === 'en-US' ? 'Applying for' : 'Ứng tuyển';
    const heading = `${prefix}: ${expectedRole}`;
    expect(draft.position).toBe(heading);
    expect(draft.title).toBe(`CV - ${heading}`);
  });

  it('keeps two target jobs distinct through reservations, AI requests and persisted drafts', async () => {
    const { service, onlineCVRepo, aiServiceClient } = createService();
    const profile = await (service as any).careerProfileService.requireMine(
      user,
    );
    profile.headline = 'Data Engineer';
    profile.experience = [
      {
        companyName: 'Synthetic Company',
        position: 'Data Engineer',
        description: 'Built reliable NestJS API services with PostgreSQL.',
        startDate: '2024-01',
        endDate: null,
      },
      {
        companyName: 'Synthetic Data Company',
        position: 'Database Engineer',
        description: 'Automated Python data ingestion with Airflow.',
        startDate: '2022-01',
        endDate: '2023-12',
      },
    ];
    profile.projects.push({
      projectName: 'Synthetic Data Pipeline',
      role: 'Data Engineer',
      description: 'Automated Python data ingestion with Airflow.',
      technologies: ['Python', 'Airflow'],
      startDate: '2023-01',
      endDate: null,
    });
    const sourceBefore = JSON.stringify(profile);
    const firstJob = {
      ...canonicalJob(),
      name: 'AI / Machine Learning Engineer (Python & PyTorch)',
      skills: ['Python', 'PyTorch'],
    };
    const secondJob = {
      ...canonicalJob(),
      _id: '71111111-1111-4111-8111-111111111111',
      name: 'Senior Fullstack Developer (NodeJS / React)',
      description: 'Build reliable APIs and deployment workflows',
      skills: ['NestJS', 'Docker'],
    };
    const jobs = [firstJob, secondJob];
    (service as any).jobsService.findOne.mockImplementation(async (input) => {
      const id = typeof input === 'string' ? input : input.where._id;
      return jobs.find((job) => job._id === id) || null;
    });
    const rows: any[] = [];
    Object.assign(onlineCVRepo, {
      find: jest.fn(async () => rows),
      save: jest.fn(async (value) => {
        rows.push(value);
        return value;
      }),
    });
    const queue = { add: jest.fn().mockResolvedValue({}) };
    Object.assign(service, { generationQueue: queue });
    const previous = process.env.REDIS_ENABLED;
    process.env.REDIS_ENABLED = 'true';
    try {
      const first = await service.enqueueGenerationFromCareerProfile(
        { jobId: firstJob._id },
        user,
        'first-target',
      );
      const second = await service.enqueueGenerationFromCareerProfile(
        { jobId: secondJob._id },
        user,
        'second-target',
      );
      expect(first.operationId).not.toBe(second.operationId);
      expect(first.sourceVersion).not.toBe(second.sourceVersion);
      expect(queue.add.mock.calls.map((call) => call[1].targetJobId)).toEqual([
        firstJob._id,
        secondJob._id,
      ]);
      expect(
        rows[0].revision.sourceTrace.generation.idempotencyKeyHash,
      ).not.toBe(rows[1].revision.sourceTrace.generation.idempotencyKeyHash);
      await expect(
        service.enqueueGenerationFromCareerProfile(
          { jobId: secondJob._id },
          user,
          'first-target',
        ),
      ).rejects.toMatchObject({ status: 409 });
      aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
        career_objective: `Build reliable systems for ${request.job.title}`,
        position:
          request.locale === 'vi-VN'
            ? 'Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)'
            : `Applying for: ${request.job.title}`,
        work_experience: request.candidate.experience.map((entry, index) => ({
          ...entry,
          source_index: index,
          bullets: [
            index === 0
              ? request.job.job_id === firstJob._id
                ? 'Implemented PostgreSQL storage for NestJS services.'
                : 'Implemented PostgreSQL-backed NestJS APIs.'
              : 'Implemented Airflow ingestion using Python.',
          ],
        })),
        projects: request.candidate.projects.map((entry, index) => ({
          ...entry,
          source_index: index,
          bullets: [
            index === 0
              ? 'Delivered NestJS endpoints for order processing.'
              : request.job.job_id === firstJob._id
              ? 'Built Python ingestion workflows with Airflow.'
              : 'Built Airflow workflows for Python data ingestion.',
          ],
        })),
      }));
      const firstDraft = await service.generateFromCareerProfile(
        { jobId: firstJob._id },
        user,
      );
      const secondDraft = await service.generateFromCareerProfile(
        { jobId: secondJob._id, locale: 'en-US' },
        user,
      );
      expect(
        aiServiceClient.generateCvDraft.mock.calls.map(
          (call) => call[0].job.job_id,
        ),
      ).toEqual([firstJob._id, secondJob._id]);
      expect(firstDraft.draft.targetJobId).toBe(firstJob._id);
      expect(secondDraft.draft.targetJobId).toBe(secondJob._id);
      expect(firstDraft.draft.careerObjective).not.toBe(
        secondDraft.draft.careerObjective,
      );
      expect(firstDraft.draft.sourceVersion).not.toBe(
        secondDraft.draft.sourceVersion,
      );
      expect(firstDraft.draft.projects).toHaveLength(2);
      expect(secondDraft.draft.projects).toHaveLength(2);
      expect(firstDraft.draft.position).toBe(
        'Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)',
      );
      expect(secondDraft.draft.position).toBe(
        `Applying for: ${secondJob.name}`,
      );
      expect(firstDraft.draft.title).toBe(
        'CV - Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)',
      );
      expect(secondDraft.draft.title).toBe(
        `CV - Applying for: ${secondJob.name}`,
      );
      expect(firstDraft.draft.workExperience[0].position).toBe('Data Engineer');
      expect(secondDraft.draft.workExperience[0].position).toBe(
        'Data Engineer',
      );
      expect(firstDraft.draft.generationSnapshot.headline).toBe(
        profile.headline,
      );
      for (const { draft } of [firstDraft, secondDraft]) {
        const targetsMl = draft.targetJobId === firstJob._id;
        expect(draft.workExperience.map((entry) => entry.position)).toEqual(
          profile.experience.map((entry) => entry.position),
        );
        expect(draft.workExperience[0].description).toBe(
          targetsMl
            ? 'Implemented PostgreSQL storage for NestJS services.'
            : 'Implemented PostgreSQL-backed NestJS APIs.',
        );
        expect(draft.workExperience[1].description).toBe(
          'Implemented Airflow ingestion using Python.',
        );
        expect(draft.projects[0].description).toBe(
          'Delivered NestJS endpoints for order processing.',
        );
        expect(draft.projects[1].description).toBe(
          targetsMl
            ? 'Built Python ingestion workflows with Airflow.'
            : 'Built Airflow workflows for Python data ingestion.',
        );
        expect(draft.projects.map((entry) => entry.role)).toEqual(
          profile.projects.map((entry) => entry.role),
        );
      }
      expect(JSON.stringify(profile)).toBe(sourceBefore);
    } finally {
      if (previous === undefined) delete process.env.REDIS_ENABLED;
      else process.env.REDIS_ENABLED = previous;
    }
  });

  it('preserves the generic profile heading when no target job was selected', async () => {
    const { service, careerProfileService, aiServiceClient } = createService();
    const profile = await careerProfileService.requireMine();
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
      position: 'Applying for: Unselected role',
    }));
    const { draft } = await service.generateFromCareerProfile({}, user);
    expect(draft.position).toBe(profile.headline);
    expect(draft.title).toBe(generatedDraft().title);
    expect(draft.targetJobId).toBeNull();
  });

  it('rejects consent revoked during inference before any content persistence', async () => {
    const { service, onlineCVRepo, aiServiceClient } = createService();
    const consent = (service as any).aiCvConsentsService;
    consent.hasValidConsent
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      ...request.identity,
      target_job_id: request.job.job_id,
      source_version: request.source_version,
    }));
    await expect(
      service.generateFromCareerProfile({}, user),
    ).rejects.toMatchObject({ status: 403 });
    expect(consent.lockScope).toHaveBeenCalled();
    expect(onlineCVRepo.save).not.toHaveBeenCalled();
  });

  it('serializes profile reservations and rejects changed locale/template on replay', async () => {
    const { service, onlineCVRepo } = createService();
    const rows: any[] = [];
    Object.assign(onlineCVRepo, {
      find: jest.fn(async () => rows),
      save: jest.fn(async (value) => {
        rows.push(value);
        return value;
      }),
    });
    const queue = { add: jest.fn().mockResolvedValue({}) };
    Object.assign(service, { generationQueue: queue });
    const previous = process.env.REDIS_ENABLED;
    process.env.REDIS_ENABLED = 'true';
    try {
      const first = await service.enqueueGenerationFromCareerProfile(
        {},
        user,
        'profile-key',
      );
      const replay = await service.enqueueGenerationFromCareerProfile(
        {},
        user,
        'profile-key',
      );
      expect(replay.operationId).toBe(first.operationId);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].revision.sourceTrace.generation.cvId).toBe(rows[0]._id);
      await expect(
        service.enqueueGenerationFromCareerProfile(
          { locale: 'en-US' },
          user,
          'profile-key',
        ),
      ).rejects.toMatchObject({ status: 409 });
      (service as any).usersService.isCandidatePremium.mockReturnValue(true);
      await expect(
        service.enqueueGenerationFromCareerProfile(
          { templateType: 'template2' },
          user,
          'profile-key',
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((service as any).userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    } finally {
      if (previous === undefined) delete process.env.REDIS_ENABLED;
      else process.env.REDIS_ENABLED = previous;
    }
  });

  it('rejects a canonical target job changed during inference under the job lock', async () => {
    const { service, onlineCVRepo, aiServiceClient } = createService();
    const job = canonicalJob();
    const jobs = (service as any).jobsService;
    jobs.findOne.mockResolvedValueOnce(job).mockResolvedValue({
      ...job,
      updatedAt: new Date('2026-10-02T00:00:00Z'),
    });
    aiServiceClient.generateCvDraft.mockImplementation(async (request) => ({
      ...generatedDraft(),
      target_job_id: request.job.job_id,
      source_version: request.source_version,
    }));
    await expect(
      service.generateFromCareerProfile({ jobId: job._id }, user),
    ).rejects.toMatchObject({ status: 409 });
    expect(jobs.findOne).toHaveBeenLastCalledWith({
      where: { _id: job._id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(onlineCVRepo.save).not.toHaveBeenCalled();
  });

  it.each(['expired', 'companyInactive', 'companyDeleted', 'jobDeletedAt'])(
    'rejects %s canonical jobs before reserving quota',
    async (condition) => {
      const { service, onlineCVRepo } = createService();
      const job = canonicalJob();
      if (condition === 'expired') job.endDate = new Date('2001-01-01');
      if (condition === 'jobDeletedAt') job.deletedAt = new Date();
      (service as any).jobsService.findOne.mockResolvedValue(job);
      if (condition === 'companyInactive' || condition === 'companyDeleted') {
        (service as any).companyRepository.findOne.mockResolvedValue({
          _id: job.company._id,
          isActive: condition !== 'companyInactive',
          isDeleted: condition === 'companyDeleted',
          deletedAt: null,
        });
      }
      const previous = process.env.REDIS_ENABLED;
      process.env.REDIS_ENABLED = 'true';
      try {
        await expect(
          service.enqueueGenerationFromCareerProfile(
            { jobId: job._id },
            user,
            'invalid-job',
          ),
        ).rejects.toMatchObject({ status: 404 });
        expect(onlineCVRepo.count).not.toHaveBeenCalled();
        expect(onlineCVRepo.save).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.REDIS_ENABLED;
        else process.env.REDIS_ENABLED = previous;
      }
    },
  );

  it.each(['expiry', 'companyInactive'])(
    'rejects %s during inference even when job version and snapshot are unchanged',
    async (condition) => {
      const { service, onlineCVRepo, aiServiceClient } = createService();
      const job = canonicalJob();
      (service as any).jobsService.findOne.mockResolvedValue(job);
      jest.useFakeTimers({ now: new Date('2026-10-03T00:00:00Z') });
      aiServiceClient.generateCvDraft.mockImplementation(async (request) => {
        if (condition === 'expiry') jest.setSystemTime(new Date('2100-01-01'));
        else
          (service as any).companyRepository.findOne.mockResolvedValue({
            _id: job.company._id,
            isActive: false,
            isDeleted: false,
            deletedAt: null,
          });
        return {
          ...generatedDraft(),
          target_job_id: request.job.job_id,
          source_version: request.source_version,
        };
      });
      try {
        await expect(
          service.generateFromCareerProfile({ jobId: job._id }, user),
        ).rejects.toMatchObject({ status: 409 });
        expect((service as any).companyRepository.findOne).toHaveBeenCalledWith(
          {
            where: { _id: job.company._id },
            lock: { mode: 'pessimistic_write' },
          },
        );
        expect(onlineCVRepo.save).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each(['RUNNING', 'COMPLETE', 'CANCELLED'])(
    'preserves %s profile reservation when Redis accepts but acknowledgement fails',
    async (status) => {
      const { service, onlineCVRepo } = createService();
      let saved: any;
      Object.assign(onlineCVRepo, {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(async (value) => {
          saved = value;
          return value;
        }),
        findOne: jest.fn(async () => saved),
      });
      Object.assign(service, {
        generationQueue: {
          add: jest.fn(async () => {
            saved.revision.sourceTrace.generation.status = status;
            throw new Error('acknowledgement lost');
          }),
        },
      });
      const previous = process.env.REDIS_ENABLED;
      process.env.REDIS_ENABLED = 'true';
      try {
        await expect(
          service.enqueueGenerationFromCareerProfile({}, user, 'ack-failure'),
        ).rejects.toMatchObject({ status: 502 });
        expect(onlineCVRepo.update).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.REDIS_ENABLED;
        else process.env.REDIS_ENABLED = previous;
      }
    },
  );

  it('creates a new editor-only CV with profile provenance and forwards projects', async () => {
    const { service, onlineCVRepo, aiServiceClient } = createService();
    aiServiceClient.generateCvDraft.mockImplementation(
      async (request: any) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
      }),
    );

    const result = await service.generateFromCareerProfile(
      { templateType: 'template1', locale: 'en-US' } as any,
      user,
    );

    const request = aiServiceClient.generateCvDraft.mock.calls[0][0];
    expect(request.candidate.projects).toEqual([
      expect.objectContaining({
        project_name: 'TalentPulse',
        technologies: ['NestJS'],
      }),
    ]);
    expect(request.locale).toBe('en-US');
    expect(request.candidate.full_name).toBe('Candidate');
    expect(request.candidate.email).toBeNull();
    expect(request.candidate.phone).toBeNull();
    expect(request.candidate.link).toBeNull();
    expect(request.candidate.address).toBeNull();
    expect(onlineCVRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
        revision: expect.objectContaining({
          locale: 'en-US',
          sourceTrace: expect.objectContaining({ locale: 'en-US' }),
        }),
        isSearchable: false,
        sourceProfileId: 'profile-1',
        sourceProfileVersion: 7,
        email: user.email,
        phone: '0900000000',
        address: 'Hanoi',
        generationSnapshot: expect.objectContaining({
          contentVersion: 7,
          projects: expect.any(Array),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        onlineCv: expect.objectContaining({
          _id: 'cv-1',
          revision: expect.objectContaining({
            locale: 'en-US',
            sourceTrace: expect.objectContaining({ locale: 'en-US' }),
          }),
        }),
        generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
      }),
    );
  });

  it('keeps source experience and project facts while applying generated bullets', async () => {
    const { service, onlineCVRepo, aiServiceClient, careerProfileService } =
      createService();
    const profile = {
      _id: 'profile-1',
      contentVersion: 7,
      contact: { fullName: 'Candidate', email: user.email },
      headline: 'Backend engineer',
      objective: 'Build reliable systems',
      experience: [
        {
          companyName: 'Acme',
          position: 'Engineer',
          startDate: '2022',
          endDate: null,
          description: 'Original experience',
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
      skills: [],
      activities: [],
      awards: [],
    };
    careerProfileService.requireMine.mockReset().mockResolvedValue(profile);
    aiServiceClient.generateCvDraft.mockImplementation(
      async (request: any) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
        work_experience: [
          {
            company_name: 'Acme',
            source_index: 0,
            position: 'Engineer',
            start_date: '2022',
            end_date: null,
            description: 'Original experience',
            bullets: ['Built reliable systems'],
          },
        ],
        skills: [],
      }),
    );

    await service.generateFromCareerProfile(
      { templateType: 'template1' } as any,
      user,
    );
    const saved = onlineCVRepo.save.mock.calls[0][0];
    expect(saved.revision).toEqual(
      expect.objectContaining({
        locale: 'vi-VN',
        sourceTrace: expect.objectContaining({ locale: 'vi-VN' }),
      }),
    );
    expect(saved.workExperience[0]).toEqual(
      expect.objectContaining({
        companyName: 'Acme',
        description: 'Built reliable systems',
      }),
    );
    expect(saved.projects[0]).toEqual(
      expect.objectContaining({
        projectName: 'TalentPulse',
        description:
          'Delivered a grounded project summary\nImproved recruiter search flow',
        technologies: ['NestJS'],
      }),
    );
  });

  it('rejects persistence when the career profile changes while AI is running', async () => {
    const { service, onlineCVRepo, aiServiceClient, careerProfileService } =
      createService();
    careerProfileService.requireMine
      .mockResolvedValueOnce({
        _id: 'profile-1',
        contentVersion: 7,
        contact: { fullName: 'Candidate', email: user.email },
        experience: [],
        education: [],
        projects: [],
        certificates: [],
        skills: [],
        activities: [],
        awards: [],
      })
      .mockResolvedValueOnce({
        _id: 'profile-1',
        contentVersion: 8,
      });
    aiServiceClient.generateCvDraft.mockImplementation(
      async (request: any) => ({
        ...generatedDraft(),
        target_job_id: request.job.job_id,
        source_version: request.source_version,
      }),
    );

    await expect(
      service.generateFromCareerProfile(
        { templateType: 'template1' } as any,
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(onlineCVRepo.save).not.toHaveBeenCalled();
  });

  it('persists en-US localized fields while retaining Vietnamese profile facts and immutability', async () => {
    const { service, onlineCVRepo, aiServiceClient, careerProfileService } =
      createService();
    const sourceProfile = {
      _id: 'profile-1',
      contentVersion: 7,
      contact: {
        fullName: 'Nguyễn An',
        email: user.email,
        phone: '0900000000',
        link: 'https://example.com',
        address: 'Hà Nội',
        avatar: null,
      },
      headline: 'Kỹ sư Backend',
      objective: 'Xây dựng hệ thống tin cậy',
      experience: [
        {
          companyName: 'Công ty Sao Việt',
          position: 'Kỹ sư phần mềm',
          startDate: '2021-01',
          endDate: '2023-12',
          description: 'Phát triển API',
        },
      ],
      education: [
        {
          schoolName: 'Đại học Bách khoa Hà Nội',
          degree: 'Cử nhân',
          major: 'Khoa học máy tính',
          startDate: '2017-09',
          endDate: '2021-06',
          description: 'Tốt nghiệp loại giỏi',
        },
      ],
      projects: [
        {
          projectName: 'TalentPulse',
          role: 'Lập trình viên',
          startDate: '2023-01',
          endDate: null,
          description: 'Nền tảng tuyển dụng',
          technologies: ['NestJS', 'PostgreSQL'],
        },
      ],
      certificates: [
        {
          name: 'AWS Certified Developer',
          issuer: 'Amazon Web Services',
          date: '2024-01',
          credentialUrl: 'https://verify.example/aws',
        },
      ],
      skills: [
        {
          name: 'TypeScript',
          level: 'thành thạo',
          description: 'Lập trình TypeScript',
        },
      ],
      activities: [
        {
          organizationName: 'Câu lạc bộ Công nghệ',
          position: 'Tình nguyện viên',
          startDate: '2020-01',
          endDate: '2021-01',
          description: 'Hỗ trợ cộng đồng',
        },
      ],
      awards: [
        {
          name: 'Giải thưởng Sáng tạo',
          issuer: 'Cuộc thi ABC',
          date: '2022-05',
          description: 'Giải nhất',
        },
      ],
    };
    careerProfileService.requireMine
      .mockReset()
      .mockResolvedValue(sourceProfile);
    const localized = {
      ...generatedDraft(),
      target_job_id: '51111111-1111-4111-8111-111111111111',
      source_version: '',
      full_name: 'Nguyễn An',
      title: 'CV - Nguyễn An',
      position: 'Backend Engineer',
      career_objective: 'Build reliable systems',
      education: [
        {
          school_name: 'Đại học Bách khoa Hà Nội',
          degree: 'Bachelor of Science',
          major: 'Computer Science',
          start_date: '2017-09',
          end_date: '2021-06',
          description: 'Graduated with honors',
        },
      ],
      work_experience: [
        {
          company_name: 'Công ty Sao Việt',
          source_index: 0,
          position: 'Software Engineer',
          start_date: '2021-01',
          end_date: '2023-12',
          description: 'Developed APIs',
          bullets: ['Built reliable APIs'],
        },
      ],
      projects: [
        {
          project_name: 'TalentPulse',
          source_index: 0,
          role: 'Backend Developer',
          start_date: '2023-01',
          end_date: null,
          description: 'Recruitment platform',
          technologies: ['NestJS', 'PostgreSQL'],
          bullets: ['Built the recruitment platform'],
        },
      ],
      skills: [
        {
          name: 'TypeScript',
          description: 'Designed maintainable typed services',
        },
      ],
      certificates: ['AWS Certified Developer — issued by Amazon Web Services'],
      activities: ['Supported the technology community as a volunteer'],
      awards: ['First prize in the ABC competition'],
      section_order: [
        'objective',
        'education',
        'experience',
        'projects',
        'skills',
        'activities',
        'certificates',
        'awards',
      ],
    };
    aiServiceClient.generateCvDraft.mockImplementation(
      async (request: any) => ({
        ...localized,
        target_job_id: request.job.job_id,
        source_version: request.source_version,
        skills: [
          {
            name: 'Programming',
            description: request.candidate.skills.join('; '),
          },
        ],
      }),
    );

    await service.generateFromCareerProfile(
      { templateType: 'template1', locale: 'en-US' } as any,
      user,
    );
    const saved = onlineCVRepo.save.mock.calls[0][0];
    expect(saved.education[0]).toMatchObject({
      schoolName: 'Đại học Bách khoa Hà Nội',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      startDate: '2017-09',
    });
    expect(saved.workExperience[0]).toMatchObject({
      companyName: 'Công ty Sao Việt',
      position: 'Software Engineer',
      startDate: '2021-01',
      description: 'Built reliable APIs',
    });
    expect(saved.projects[0]).toMatchObject({
      projectName: 'TalentPulse',
      role: 'Backend Developer',
      technologies: ['NestJS', 'PostgreSQL'],
      description: 'Built the recruitment platform',
    });
    expect(saved.skills).toEqual([
      {
        name: 'Programming',
        description:
          aiServiceClient.generateCvDraft.mock.calls[0][0].candidate.skills.join(
            '; ',
          ),
      },
    ]);
    expect(saved.certificates[0]).toMatchObject({
      name: 'AWS Certified Developer — issued by Amazon Web Services',
      issuer: 'Amazon Web Services',
      date: '2024-01',
      credentialUrl: 'https://verify.example/aws',
    });
    expect(saved.activities[0]).toMatchObject({
      organizationName: 'Câu lạc bộ Công nghệ',
      position: 'Tình nguyện viên',
      startDate: '2020-01',
      description: 'Supported the technology community as a volunteer',
    });
    expect(saved.awards[0]).toMatchObject({
      name: 'Giải thưởng Sáng tạo',
      issuer: 'Cuộc thi ABC',
      date: '2022-05',
      description: 'First prize in the ABC competition',
    });
    expect(saved.revision.locale).toBe('en-US');
    expect(sourceProfile.education[0].degree).toBe('Cử nhân');
    expect(sourceProfile.experience[0].position).toBe('Kỹ sư phần mềm');
    expect(sourceProfile.projects[0].role).toBe('Lập trình viên');
    expect(sourceProfile.skills[0].level).toBe('thành thạo');
  });
});
