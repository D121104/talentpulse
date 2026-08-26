import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiCvConsent,
  AiCvConsentStatus,
} from './entities/ai-cv-consent.entity';
import {
  AiCvConsentEvent,
  AiCvConsentEventType,
} from './entities/ai-cv-consent-event.entity';
import { GrantAiCvConsentDto, RevokeAiCvConsentDto } from './dto/ai-cv-consent.dto';

@Injectable()
export class AiCvConsentsService {
  constructor(
    @InjectRepository(AiCvConsent)
    private readonly consentRepo: Repository<AiCvConsent>,
    @InjectRepository(AiCvConsentEvent)
    private readonly eventRepo: Repository<AiCvConsentEvent>,
  ) {}

  async grant(userId: string, dto: GrantAiCvConsentDto): Promise<AiCvConsent> {
    const existing = await this.consentRepo.findOne({
      where: { userId, scope: dto.scope, status: AiCvConsentStatus.GRANTED },
    });
    if (existing) {
      if (
        existing.consentVersion === dto.consentVersion &&
        existing.policyHash === dto.policyHash
      ) {
        return existing;
      }
      throw new ConflictException('An active consent already exists for this scope');
    }

    const now = new Date();
    const consent = await this.consentRepo.save(
      this.consentRepo.create({
        userId,
        ...dto,
        status: AiCvConsentStatus.GRANTED,
        grantedAt: now,
        revokedAt: null,
      }),
    );
    await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        consentId: consent._id,
        ...dto,
        eventType: AiCvConsentEventType.GRANTED,
        occurredAt: now,
      }),
    );
    return consent;
  }

  async revoke(userId: string, dto: RevokeAiCvConsentDto): Promise<AiCvConsent> {
    const consent = await this.consentRepo.findOne({
      where: { userId, scope: dto.scope, status: AiCvConsentStatus.GRANTED },
    });
    if (!consent) {
      throw new NotFoundException('No active CV consent exists for this scope');
    }
    const now = new Date();
    consent.status = AiCvConsentStatus.REVOKED;
    consent.revokedAt = now;
    consent.updatedAt = now;
    const revoked = await this.consentRepo.save(consent);
    await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        consentId: revoked._id,
        scope: revoked.scope,
        consentVersion: dto.consentVersion,
        policyHash: dto.policyHash,
        source: dto.source,
        sourceMetadata: dto.sourceMetadata,
        eventType: AiCvConsentEventType.REVOKED,
        occurredAt: now,
      }),
    );
    return revoked;
  }

  async getCurrent(userId: string, scope: string): Promise<AiCvConsent | null> {
    return this.consentRepo.findOne({ where: { userId, scope } });
  }

  async hasValidConsent(
    userId: string,
    scope: string,
    consentVersion: string,
    policyHash: string,
  ): Promise<boolean> {
    const consent = await this.consentRepo.findOne({
      where: { userId, scope, status: AiCvConsentStatus.GRANTED },
    });
    return Boolean(
      consent &&
        consent.consentVersion === consentVersion &&
        consent.policyHash === policyHash &&
        consent.grantedAt &&
        !consent.revokedAt,
    );
  }
}
