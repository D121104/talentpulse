import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AiCvConsentsService } from './ai-cv-consents.service';
import {
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
} from './ai-cv-consent.policy';
import {
  AiCvConsent,
  AiCvConsentStatus,
} from './entities/ai-cv-consent.entity';
import { AiCvConsentEvent } from './entities/ai-cv-consent-event.entity';

describe('AiCvConsentsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const policy = getActiveAiCvConsentPolicy();
  const dto = {
    scope: AiCvConsentScope.CV_MATCHING,
    consentVersion: policy.consentVersion,
    policyHash: policy.policyHash,
    source: 'web',
    sourceMetadata: { locale: 'en' },
  };

  function setup() {
    const consentRepo = {
      manager: null as any,
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        _id: value._id || '22222222-2222-4222-8222-222222222222',
        ...value,
      })),
    } as any;
    const eventRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any;
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity) =>
        entity === AiCvConsent ? consentRepo : eventRepo,
      ),
    } as any;
    consentRepo.manager = {
      transaction: jest.fn(async (work) => work(manager)),
    };
    return {
      service: new AiCvConsentsService(consentRepo, eventRepo),
      consentRepo,
      eventRepo,
      manager,
    };
  }

  it('returns the existing row without a duplicate event for an idempotent grant', async () => {
    const { service, consentRepo, eventRepo, manager } = setup();
    const existing = {
      _id: '22222222-2222-4222-8222-222222222222',
      userId,
      ...dto,
      status: AiCvConsentStatus.GRANTED,
      grantedAt: new Date(),
      revokedAt: null,
    } as unknown as AiCvConsent;
    consentRepo.findOne.mockResolvedValue(existing);

    await expect(service.grant(userId, dto)).resolves.toBe(existing);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(consentRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('persists the canonical policy and grant event atomically', async () => {
    const { service, consentRepo, eventRepo, manager } = setup();
    const savedConsent = {
      _id: '22222222-2222-4222-8222-222222222222',
      status: AiCvConsentStatus.GRANTED,
    };
    consentRepo.findOne.mockResolvedValue(null);
    consentRepo.save.mockResolvedValue(savedConsent);

    await expect(service.grant(userId, dto)).resolves.toBe(savedConsent);
    expect(consentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        scope: policy.scope,
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
      }),
    );
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        consentId: savedConsent._id,
        eventType: 'GRANTED',
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
      }),
    );
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a grant that does not match the active policy', async () => {
    const { service, consentRepo } = setup();

    await expect(
      service.grant(userId, { ...dto, consentVersion: 'old-policy' }),
    ).rejects.toThrow(ConflictException);
    expect(consentRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a grant with a client-supplied policy hash that is not active', async () => {
    const { service, consentRepo } = setup();

    await expect(
      service.grant(userId, { ...dto, policyHash: 'f'.repeat(64) }),
    ).rejects.toThrow(ConflictException);
    expect(consentRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a grant that omits the active policy proof', async () => {
    const { service, consentRepo } = setup();

    await expect(
      service.grant(userId, { ...dto, policyHash: undefined }),
    ).rejects.toThrow(ConflictException);
    expect(consentRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects arbitrary consent scopes', async () => {
    const { service } = setup();

    await expect(
      service.grant(userId, { ...dto, scope: 'export_everything' as any }),
    ).rejects.toThrow('Invalid AI CV consent scope');
  });

  it('revokes the active projection and appends an event in one transaction', async () => {
    const { service, consentRepo, eventRepo, manager } = setup();
    const active = {
      _id: '22222222-2222-4222-8222-222222222222',
      userId,
      scope: policy.scope,
      consentVersion: policy.consentVersion,
      policyHash: policy.policyHash,
      status: AiCvConsentStatus.GRANTED,
      grantedAt: new Date(),
      revokedAt: null,
      source: 'web',
    } as unknown as AiCvConsent;
    consentRepo.findOne.mockResolvedValue(active);

    const revoked = await service.revoke(userId, dto);

    expect(revoked.status).toBe(AiCvConsentStatus.REVOKED);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        consentId: active._id,
        eventType: 'REVOKED',
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
      }),
    );
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('returns the current projection for the requested scope', async () => {
    const { service, consentRepo } = setup();
    const current = {
      _id: '22222222-2222-4222-8222-222222222222',
      userId,
      scope: policy.scope,
      status: AiCvConsentStatus.REVOKED,
      updatedAt: new Date(),
    } as unknown as AiCvConsent;
    consentRepo.findOne.mockResolvedValue(current);

    await expect(service.getCurrent(userId, policy.scope)).resolves.toBe(current);
    expect(consentRepo.findOne).toHaveBeenCalledWith({
      where: { userId, scope: policy.scope },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  });

  it('rejects current lookup for an invalid scope', async () => {
    const { service, consentRepo } = setup();

    await expect(service.getCurrent(userId, 'export_everything')).rejects.toThrow(
      BadRequestException,
    );
    expect(consentRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns a stable not-found error when revoking without active consent', async () => {
    const { service, consentRepo } = setup();
    consentRepo.findOne.mockResolvedValue(null);

    await expect(service.revoke(userId, dto)).rejects.toThrow(NotFoundException);
  });
});
