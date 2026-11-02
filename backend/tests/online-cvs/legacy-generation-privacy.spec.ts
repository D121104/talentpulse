import { Role } from 'src/decorator/customize';
import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { OnlineCvGenerationMode } from 'src/online-cvs/entities/online-cv.entity';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  role: Role.USER,
} as any;

describe('OnlineCVsService.generate legacy privacy boundary', () => {
  it.each([
    {
      target: false,
      locale: 'vi-VN',
      title: 'Backend CV',
      jobName: 'Platform Engineer',
      generatedPosition: 'Provider Position',
    },
    {
      target: true,
      locale: 'vi-VN',
      title: 'CV - Candidate',
      jobName: 'Platform Engineer',
      generatedPosition: 'Provider Position',
    },
    {
      target: true,
      locale: 'en-US',
      title: 'My custom portfolio title',
      jobName: 'Platform Engineer',
      generatedPosition: 'Provider Position',
    },
    {
      target: true,
      locale: 'en-US',
      title: 'CV - Candidate',
      jobName: 'Senior Fullstack Developer (NodeJS / React)',
      generatedPosition: 'Applying for: Machine Learning Engineer',
    },
    {
      target: true,
      locale: 'vi-VN',
      title: 'CV - Candidate',
      jobName: 'Data Analyst',
      generatedPosition: 'Ứng tuyển: Kỹ sư phần mềm',
    },
    {
      target: true,
      locale: 'vi-VN',
      title: 'CV - Candidate',
      jobName: 'Senior Fullstack Developer (NodeJS / React)',
      generatedPosition: 'Ứng tuyển: Kỹ sư AI / học máy (Python & PyTorch)',
    },
    ...[
      'unchanged',
      'cleared',
      'added',
      'edited',
      'emptySelection',
      'chunks',
      'translated',
      'jobFiltered',
      'jobEmpty',
    ].map((skillEdit) => ({
      target: skillEdit === 'jobFiltered' || skillEdit === 'jobEmpty',
      locale: 'vi-VN',
      title: 'Selected source CV',
      jobName: 'Fullstack Developer',
      generatedPosition: 'Provider Position',
      skillEdit,
    })),
  ])('$locale/$title', async (scenario) => {
    const { target, locale, title, jobName, generatedPosition } = scenario;
    const canonicalCv = {
      _id: '21111111-1111-4111-8111-111111111111',
      userId: user._id,
      isDeleted: false,
      templateType: 'template1',
      contentVersion: 3,
      fullName: 'Nguyen Van A',
      title,
      position: 'Backend Engineer',
      email: 'real@example.com',
      phone: '+84900000000',
      link: 'https://real.example.com',
      address: 'Hanoi',
      careerObjective: 'Build reliable systems',
      skills: ['NestJS'],
      workExperience: [],
      education: [],
      projects: [],
      certificates: [],
      activities: [],
      awards: [],
      generationMode: OnlineCvGenerationMode.MANUAL,
      revision: { locale },
    };
    const skillEdit = 'skillEdit' in scenario ? scenario.skillEdit : null;
    const sourceMembers =
      skillEdit === 'jobFiltered' || skillEdit === 'jobEmpty'
        ? ['NodeJS', 'React', 'Kafka', 'Airflow', 'dbt']
        : skillEdit === 'translated'
        ? ['Giao tiếp tốt', 'Problem Solving', 'English (TOEIC  590)']
        : [
            'Python, SQL',
            'Cloud; data',
            'English (TOEIC 590; speaking, reading)',
            'TypeScript',
          ];
    const groupDescription =
      skillEdit === 'translated'
        ? 'Good communication; Problem Solving; English (TOEIC  590)'
        : sourceMembers.join('; ');
    const nextGroupDescription =
      skillEdit === 'translated'
        ? 'Giao tiếp tốt; Giải quyết vấn đề; Tiếng Anh (TOEIC  590)'
        : null;
    let experienceIndices =
      skillEdit && skillEdit !== 'emptySelection' ? [4, 1, 3] : [];
    let projectIndices =
      skillEdit && skillEdit !== 'cleared' && skillEdit !== 'emptySelection'
        ? [4, 1, 3]
        : [];
    if (skillEdit) {
      const currentSkills: Array<{ name: string; description: string }> = [];
      if (skillEdit !== 'cleared') {
        currentSkills.push({
          name: 'Owned skills',
          description:
            skillEdit === 'edited' ? 'English (TOEIC 650)' : groupDescription,
        });
      }
      if (skillEdit === 'added')
        currentSkills.push({
          name: 'Rust',
          description: 'Implemented Rust services',
        });
      const storedGroups = [
        {
          name: 'Owned skills',
          description: groupDescription,
          members: sourceMembers,
        },
      ];
      if (skillEdit === 'chunks') {
        storedGroups.splice(
          0,
          1,
          ...[sourceMembers.slice(0, 2), sourceMembers.slice(2)].map(
            (members) => ({
              name: 'Owned skills',
              description: members.join('; '),
              members,
            }),
          ),
        );
        currentSkills.splice(
          0,
          currentSkills.length,
          ...storedGroups.map(({ name, description }) => ({
            name,
            description,
          })),
        );
      }
      Object.assign(canonicalCv, {
        workExperience: Array.from({ length: 5 }, (_, index) => ({
          companyName: `Company ${index}`,
          position: `Historical ${index}`,
          startDate: `202${index}-01`,
          endDate: null,
          description: `Experience ${index}`,
        })),
        projects: [
          { projectName: '', role: null },
          ...Array.from({ length: 5 }, (_, index) => ({
            projectName: `Project ${index}`,
            role: `Role ${index}`,
            startDate: `202${index}-02`,
            endDate: null,
            description: `Project narrative ${index}`,
            technologies: ['Python'],
          })),
        ],
        skills: currentSkills,
        generationSnapshot: {
          skills: sourceMembers,
          experience: Array.from({ length: 5 }, (_, index) => ({
            position: `Historical ${index}`,
          })),
        },
        revision: {
          locale,
          sourceTrace: {
            skillGroups: storedGroups,
          },
        },
      });
    }
    const job = {
      _id: '31111111-1111-4111-8111-111111111111',
      name: jobName,
      company: { _id: '41111111-1111-4111-8111-111111111111' },
      isActive: true,
      isDeleted: false,
      startDate: new Date('2000-01-01'),
      endDate: new Date('2099-01-01'),
    };
    const onlineCVRepo = {
      findOne: jest.fn().mockResolvedValue(canonicalCv),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    Object.assign(onlineCVRepo, {
      manager: {
        transaction: jest.fn((work) =>
          work({
            getRepository: (entity) => {
              if (entity.name === 'OnlineCV') return onlineCVRepo;
              if (entity.name === 'Job') return { findOne: async () => job };
              if (entity.name === 'Company')
                return {
                  findOne: async () => ({
                    _id: job.company._id,
                    isActive: true,
                    isDeleted: false,
                  }),
                };
              return (service as any).userRepo;
            },
          }),
        ),
      },
    });
    const aiServiceClient = {
      generateCvDraft: jest.fn(async (request: any) => ({
        request_id: request.identity.request_id,
        trace_id: request.identity.trace_id,
        operation_attempt_id: request.identity.operation_attempt_id,
        candidate_id: user._id,
        target_job_id: request.job.job_id,
        template_type: 'template1',
        generation_mode: 'EDITOR_ONLY',
        // Provider output must not be trusted for contact fields.
        full_name: 'Provider Name',
        title: 'Provider CV',
        position: generatedPosition,
        email: 'provider@example.com',
        phone: '+84000000000',
        link: 'https://provider.example.com',
        address: 'Provider Address',
        career_objective: 'Provider objective',
        education: [],
        projects: projectIndices.map((source_index) => ({
          ...request.candidate.projects[source_index],
          source_index,
          bullets: [`Selected project ${source_index}`],
        })),
        work_experience: experienceIndices.map((source_index) => ({
          ...request.candidate.experience[source_index],
          source_index,
          bullets: [`Selected experience ${source_index}`],
        })),
        skills:
          skillEdit === 'jobEmpty'
            ? []
            : skillEdit === 'jobFiltered'
            ? [{ name: 'Frameworks', description: 'NodeJS; React' }]
            : request.candidate.skills.length
            ? [
                {
                  name: 'Frameworks',
                  description:
                    nextGroupDescription || request.candidate.skills.join('; '),
                },
              ]
            : [],
        activities: [],
        certificates: [],
        awards: [],
        section_order: ['objective', 'experience', 'skills'],
        warnings: [],
        generated_by: 'ai-service',
        source_version: request.source_version,
        content_version: 4,
      })),
    };
    const service = Object.create(
      OnlineCVsService.prototype,
    ) as OnlineCVsService;
    Object.assign(service as any, {
      onlineCVRepo,
      userRepo: {
        findOne: jest.fn().mockResolvedValue({
          ...user,
          isDeleted: false,
          isPremium: false,
        }),
      },
      usersService: {
        isCandidatePremium: jest.fn().mockReturnValue(false),
      },
      aiCvConsentsService: {
        hasValidConsent: jest.fn().mockResolvedValue(true),
        lockScope: jest.fn().mockResolvedValue(undefined),
      },
      aiServiceClient,
      jobsService: { findOne: jest.fn().mockResolvedValue(job) },
      configService: { get: jest.fn() },
      redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
    });

    const result = await service.generate(
      canonicalCv._id,
      target ? { jobId: job._id } : {},
      user,
    );

    const request = aiServiceClient.generateCvDraft.mock.calls[0][0];
    expect(request.locale).toBe(locale);
    expect(request.candidate).toMatchObject({
      full_name: 'Candidate',
      email: null,
      phone: null,
      link: null,
      address: null,
    });
    expect(request.candidate).not.toEqual(
      expect.objectContaining({
        full_name: canonicalCv.fullName,
        email: canonicalCv.email,
        phone: canonicalCv.phone,
        link: canonicalCv.link,
        address: canonicalCv.address,
      }),
    );
    expect(result.draft).toMatchObject({
      fullName: canonicalCv.fullName,
      email: canonicalCv.email,
      phone: canonicalCv.phone,
      link: canonicalCv.link,
      address: canonicalCv.address,
    });
    expect(onlineCVRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: canonicalCv._id,
        userId: user._id,
        isDeleted: false,
        contentVersion: canonicalCv.contentVersion,
      }),
      expect.not.objectContaining({
        fullName: 'Provider Name',
        email: 'provider@example.com',
        phone: '+84000000000',
        link: 'https://provider.example.com',
        address: 'Provider Address',
      }),
    );
    const updatePayload = onlineCVRepo.update.mock.calls[0][1];
    if (skillEdit) {
      expect(
        updatePayload.workExperience.map((entry) => entry.position),
      ).toEqual(experienceIndices.map((index) => `Historical ${index}`));
      expect(
        updatePayload.workExperience.map((entry) => entry.startDate),
      ).toEqual(experienceIndices.map((index) => `202${index}-01`));
      expect(updatePayload.projects.map((entry) => entry.projectName)).toEqual(
        projectIndices.map((index) => `Project ${index}`),
      );
      let expectedMembers = [...sourceMembers];
      if (skillEdit === 'cleared') expectedMembers = [];
      if (skillEdit === 'edited') expectedMembers = ['English (TOEIC 650)'];
      if (skillEdit === 'added')
        expectedMembers.push('Rust (Implemented Rust services)');
      expect(request.candidate.skills).toEqual(expectedMembers);
      expect(request.candidate.skills).not.toContain('Owned skills');
      expect(updatePayload.skills).toEqual(
        skillEdit === 'jobEmpty'
          ? []
          : skillEdit === 'jobFiltered'
          ? [{ name: 'Frameworks', description: 'NodeJS; React' }]
          : expectedMembers.length
          ? [
              {
                name: 'Frameworks',
                description: nextGroupDescription || expectedMembers.join('; '),
              },
            ]
          : [],
      );
      expect(
        updatePayload.revision.sourceTrace.skillGroups.flatMap(
          (group) => group.members,
        ),
      ).toEqual(
        skillEdit === 'jobEmpty'
          ? []
          : skillEdit === 'jobFiltered'
          ? ['NodeJS', 'React']
          : expectedMembers,
      );
      if (skillEdit === 'jobFiltered' || skillEdit === 'jobEmpty') {
        const regenerated = { ...canonicalCv, ...updatePayload };
        onlineCVRepo.findOne.mockResolvedValue(regenerated);
        experienceIndices = [0, 1, 2];
        projectIndices = [0, 1, 2];
        await service.generate(canonicalCv._id, { jobId: job._id }, user);
        expect(
          aiServiceClient.generateCvDraft.mock.calls[1][0].candidate.skills,
        ).toEqual(skillEdit === 'jobEmpty' ? [] : ['NodeJS', 'React']);
        expect((canonicalCv as any).generationSnapshot.skills).toEqual(
          sourceMembers,
        );
      }
      expect((canonicalCv as any).generationSnapshot.experience).toHaveLength(
        5,
      );
    }
    const heading = `${locale === 'en-US' ? 'Applying for' : 'Ứng tuyển'}: ${
      job.name
    }`;
    expect(updatePayload.position).toBe(
      target ? heading : canonicalCv.position,
    );
    if (title === 'CV - Candidate')
      expect(updatePayload.title).toBe(`CV - ${heading}`);
    else expect(updatePayload).not.toHaveProperty('title');
    expect(updatePayload.revision).toEqual(
      expect.objectContaining({
        locale,
        sourceTrace: expect.objectContaining({ locale }),
      }),
    );
  });
});
