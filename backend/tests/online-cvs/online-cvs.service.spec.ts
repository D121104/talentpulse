import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';

import {
  dedupeCvText,
  draftDescription,
  escapeHtml,
  normalizeCvContentKey,
  sanitizePdfHtml,
} from 'src/online-cvs/online-cvs.service';

describe('online CV PDF HTML safety', () => {
  it('removes executable markup, handlers and remote resource URLs', () => {
    const sanitized = sanitizePdfHtml(
      '<div onclick="alert(1)"><script>fetch("https://evil.test")</script><img src="https://evil.test/a.png"><img src="data:image/png;base64,abc"></div>',
    );

    expect(sanitized).not.toMatch(/script|onclick|https:\/\/evil\.test/i);
    expect(sanitized).toContain('data:image/png;base64,abc');
  });

  it('escapes user-controlled document titles', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});

describe('online CV content deduplication', () => {
  it('normalizes punctuation and preserves first distinct facts', () => {
    expect(
      dedupeCvText([
        ' Built FastAPI services. ',
        'built  FastAPI services!',
        'Maintained PostgreSQL.',
      ]),
    ).toEqual(['Built FastAPI services.', 'Maintained PostgreSQL.']);
    expect(normalizeCvContentKey('C++')).not.toBe(normalizeCvContentKey('C#'));
  });

  it('does not persist a source description alongside identical generated bullets', () => {
    expect(
      draftDescription(
        'Built FastAPI services.',
        ['Built FastAPI services!'],
        'Generated fallback.',
      ),
    ).toBe('Generated fallback.');
    expect(
      draftDescription(
        'Built FastAPI services.',
        ['Built FastAPI services!', 'Maintained PostgreSQL.'],
        null,
      ),
    ).toBe('Maintained PostgreSQL.');
  });
});

describe('online CV locale metadata', () => {
  const user = { _id: 'user-1', email: 'candidate@example.com' } as any;

  it('preserves revision locale and source trace locale when editing without locale', async () => {
    const cv = {
      _id: 'cv-1',
      userId: user._id,
      contentVersion: 4,
      generationMode: 'EDITOR_ONLY',
      revision: {
        contentVersion: 4,
        locale: 'en-US',
        sourceTrace: { locale: 'en-US', requestId: 'request-1' },
      },
      templateType: 'template1',
      isDeleted: false,
    };
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = Object.create(
      OnlineCVsService.prototype,
    ) as OnlineCVsService;
    Object.assign(service as any, {
      onlineCVRepo: repository,
      redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
      findOne: jest.fn().mockResolvedValue(cv),
    });

    await service.update(
      'cv-1',
      { fullName: 'Edited Candidate', expectedContentVersion: 4 } as any,
      user,
    );

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'cv-1',
        userId: user._id,
        isDeleted: false,
        contentVersion: 4,
      }),
      expect.objectContaining({
        revision: expect.objectContaining({
          contentVersion: 5,
          locale: 'en-US',
          sourceTrace: expect.objectContaining({ locale: 'en-US' }),
        }),
      }),
    );
  });
});

describe('online CV create locale metadata', () => {
  it('persists the requested locale and returns it through findOne', async () => {
    const user = { _id: 'user-1', email: 'candidate@example.com' } as any;
    const repository = {
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, _id: 'cv-1' })),
    };
    const saved = {
      _id: 'cv-1',
      generationMode: 'MANUAL',
      revision: {
        contentVersion: 1,
        locale: 'en-US',
        sourceTrace: { locale: 'en-US' },
      },
    };
    const service = Object.create(
      OnlineCVsService.prototype,
    ) as OnlineCVsService;
    Object.assign(service as any, {
      onlineCVRepo: repository,
      userRepo: {
        findOne: jest
          .fn()
          .mockResolvedValue({ _id: user._id, isVerified: true }),
      },
      usersService: {
        isCandidatePremium: jest.fn().mockReturnValue(false),
        getUserMaxCvLimit: jest.fn().mockReturnValue(3),
      },
      redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
      exportToPdf: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(saved),
    });

    const result = await service.create(
      {
        templateType: 'template1',
        locale: 'en-US',
        fullName: 'Candidate',
        education: [{}, { schoolName: 'University' }],
        workExperience: [{}, { position: 'Engineer' }],
        skills: [{}, { name: 'TypeScript' }],
        activities: [{}, { organizationName: 'Community group' }],
        projects: [{}, { projectName: 'TalentPulse' }],
        certificates: [{}, { name: 'AWS' }],
        awards: [{}, { name: 'Winner' }],
      } as any,
      user,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          locale: 'en-US',
          sourceTrace: expect.objectContaining({ locale: 'en-US' }),
        }),
        education: [{ schoolName: 'University' }],
        workExperience: [{ position: 'Engineer' }],
        skills: [{ name: 'TypeScript' }],
        activities: [{ organizationName: 'Community group' }],
        projects: [{ projectName: 'TalentPulse' }],
        certificates: [{ name: 'AWS' }],
        awards: [{ name: 'Winner' }],
      }),
    );
    expect(result.revision).toEqual(
      expect.objectContaining({ locale: 'en-US' }),
    );
  });
});
