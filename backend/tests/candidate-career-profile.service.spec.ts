import { ConflictException } from '@nestjs/common';
import { CandidateCareerProfileService } from 'src/candidate-career-profile/candidate-career-profile.service';
import { Role } from 'src/decorator/customize';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  name: 'Candidate',
  role: Role.USER,
} as any;

function createService() {
  const profileRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
    update: jest.fn(),
    findOneOrFail: jest.fn(),
  } as any;
  return {
    service: new CandidateCareerProfileService(profileRepo),
    profileRepo,
  };
}

describe('CandidateCareerProfileService', () => {
  it('creates a normalized profile at version one from version zero', async () => {
    const { service, profileRepo } = createService();
    profileRepo.findOne.mockResolvedValueOnce(null);
    profileRepo.save.mockResolvedValue({
      _id: 'profile-1',
      contentVersion: 1,
      contact: { fullName: 'Candidate', email: user.email },
      headline: 'Backend engineer',
      objective: 'Build reliable systems',
      experience: [],
      education: [],
      projects: [],
      certificates: [],
      skills: [],
      activities: [],
      awards: [],
    });

    const result = await service.updateMine(
      {
        contentVersion: 0,
        headline: '  Backend engineer ',
        careerObjective: ' Build reliable systems ',
        projects: [
          {
            projectName: 'TalentPulse',
            technologies: 'NestJS, PostgreSQL',
          },
        ],
      } as any,
      user,
    );

    expect(result).toMatchObject({
      contentVersion: 1,
      headline: 'Backend engineer',
    });
    expect(profileRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user._id,
        contentVersion: 1,
        objective: 'Build reliable systems',
        projects: [
          expect.objectContaining({
            projectName: 'TalentPulse',
            technologies: ['NestJS', 'PostgreSQL'],
          }),
        ],
      }),
    );
  });

  it('rejects an update when the client content version is stale', async () => {
    const { service, profileRepo } = createService();
    profileRepo.findOne.mockResolvedValue({
      _id: 'profile-1',
      userId: user._id,
      contentVersion: 3,
    });

    await expect(
      service.updateMine({ contentVersion: 2 } as any, user),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(profileRepo.update).not.toHaveBeenCalled();
  });

  it('uses an atomic version predicate when updating an existing profile', async () => {
    const { service, profileRepo } = createService();
    profileRepo.findOne.mockResolvedValue({
      _id: 'profile-1',
      userId: user._id,
      contentVersion: 3,
      contact: { fullName: 'Candidate', email: user.email },
    });
    profileRepo.update.mockResolvedValue({ affected: 1 });
    profileRepo.findOneOrFail.mockResolvedValue({
      _id: 'profile-1',
      contentVersion: 4,
      contact: { fullName: 'Candidate', email: user.email },
      experience: [],
      education: [],
      projects: [],
      certificates: [],
      skills: [],
      activities: [],
      awards: [],
    });

    const result = await service.updateMine(
      { contentVersion: 3, headline: 'Updated' } as any,
      user,
    );

    expect(result.contentVersion).toBe(4);
    expect(profileRepo.update).toHaveBeenCalledWith(
      { _id: 'profile-1', userId: user._id, contentVersion: 3 },
      expect.objectContaining({ contentVersion: 4, headline: 'Updated' }),
    );
  });
});
