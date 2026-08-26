import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GrantAiCvConsentDto,
  RevokeAiCvConsentDto,
} from './ai-cv-consent.dto';
import {
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
} from '../ai-cv-consent.policy';

describe('AI CV consent DTO validation', () => {
  const policy = getActiveAiCvConsentPolicy();

  function validGrant() {
    return plainToInstance(GrantAiCvConsentDto, {
      scope: AiCvConsentScope.CV_MATCHING,
      consentVersion: policy.consentVersion,
      policyHash: policy.policyHash,
      source: 'web',
      sourceMetadata: { locale: 'en' },
    });
  }

  it('accepts a valid grant payload', async () => {
    await expect(validate(validGrant())).resolves.toHaveLength(0);
  });

  it('rejects unknown top-level fields with the global validation options', async () => {
    const dto = plainToInstance(GrantAiCvConsentDto, {
      ...validGrant(),
      inventedPolicy: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('inventedPolicy');
  });

  it('rejects invalid scopes and oversized metadata values', async () => {
    const dto = plainToInstance(RevokeAiCvConsentDto, {
      ...validGrant(),
      scope: 'export_everything',
      sourceMetadata: { reason: 'x'.repeat(201) },
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['scope', 'sourceMetadata']),
    );
  });
});
