import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GenerateFromCareerProfileDto,
  UpdateCandidateCareerProfileDto,
} from 'src/candidate-career-profile/dto/update-candidate-career-profile.dto';
import { CreateOnlineCVDto } from 'src/online-cvs/dto/create-online-cv.dto';

describe('Candidate career profile DTO validation', () => {
  it('accepts the frontend locale and rejects malformed locales', async () => {
    const valid = plainToInstance(GenerateFromCareerProfileDto, {
      templateType: 'template1',
      locale: 'vi-VN',
      expectedProfileVersion: 1,
    });
    expect(await validate(valid)).toHaveLength(0);

    const invalid = plainToInstance(GenerateFromCareerProfileDto, {
      locale: 'not a locale',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('accepts only exact persisted CV locale tags', async () => {
    for (const locale of ['vi-VN', 'en-US']) {
      const dto = plainToInstance(CreateOnlineCVDto, {
        templateType: 'template1',
        locale,
        fullName: 'Candidate',
      });
      expect(await validate(dto)).toHaveLength(0);
    }

    const invalid = plainToInstance(CreateOnlineCVDto, {
      templateType: 'template1',
      locale: 'en',
      fullName: 'Candidate',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('bounds nested profile arrays and item text', async () => {
    const dto = plainToInstance(UpdateCandidateCareerProfileDto, {
      contentVersion: 0,
      headline: 'x'.repeat(4001),
      skills: Array.from({ length: 51 }, () => ({ name: 'NestJS' })),
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['headline', 'skills']),
    );
  });

  it('rejects an oversized aggregate profile payload', async () => {
    const dto = plainToInstance(UpdateCandidateCareerProfileDto, {
      contentVersion: 0,
      experience: Array.from({ length: 50 }, () => ({
        companyName: 'x'.repeat(4000),
      })),
      education: Array.from({ length: 50 }, () => ({
        schoolName: 'x'.repeat(4000),
      })),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contentVersion')).toBe(
      true,
    );
  });
});
