import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  AI_CV_CONSENT_ERROR_MESSAGES,
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
  isAiCvConsentScope,
} from './ai-cv-consent.policy';
import {
  AiCvConsent,
  AiCvConsentStatus,
} from './entities/ai-cv-consent.entity';
import {
  AiCvConsentEvent,
  AiCvConsentEventType,
} from './entities/ai-cv-consent-event.entity';
import { GrantAiCvConsentDto, RevokeAiCvConsentDto } from './dto/ai-cv-consent.dto';

type ConsentRepository = Repository<AiCvConsent>;
type EventRepository = Repository<AiCvConsentEvent>;

@Injectable()
export class AiCvConsentsService {
  constructor(
    @InjectRepository(AiCvConsent)
    private readonly consentRepo: ConsentRepository,
    @InjectRepository(AiCvConsentEvent)
    private readonly eventRepo: EventRepository,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async grant(userId: string, dto: GrantAiCvConsentDto): Promise<AiCvConsent> {
    this.assertUuid(userId, AI_CV_CONSENT_ERROR_MESSAGES.INVALID_USER_ID);
    const policy = this.getPolicy(dto.scope);
    this.assertClientPolicyMatches(dto.consentVersion, dto.policyHash, policy);

    return this.runTransaction(async (manager) => {
      await this.lockScope(manager, userId, policy.scope);
      const consentRepo = manager.getRepository(AiCvConsent);
      const eventRepo = manager.getRepository(AiCvConsentEvent);
      const existing = await consentRepo.findOne({
        where: { userId, scope: policy.scope, status: AiCvConsentStatus.GRANTED },
      });

      if (existing) {
        if (
          existing.consentVersion === policy.consentVersion &&
          existing.policyHash === policy.policyHash
        ) {
          return existing;
        }
        throw new ConflictException(AI_CV_CONSENT_ERROR_MESSAGES.POLICY_MISMATCH);
      }

      const now = new Date();
      const consent = await consentRepo.save(
        consentRepo.create({
          userId,
          scope: policy.scope,
          consentVersion: policy.consentVersion,
          policyHash: policy.policyHash,
          status: AiCvConsentStatus.GRANTED,
          grantedAt: now,
          revokedAt: null,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
        }),
      );

      await eventRepo.save(
        eventRepo.create({
          userId,
          consentId: consent._id,
          scope: policy.scope,
          consentVersion: policy.consentVersion,
          policyHash: policy.policyHash,
          eventType: AiCvConsentEventType.GRANTED,
          occurredAt: now,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
        }),
      );
      return consent;
    });
  }

  async revoke(userId: string, dto: RevokeAiCvConsentDto): Promise<AiCvConsent> {
    this.assertUuid(userId, AI_CV_CONSENT_ERROR_MESSAGES.INVALID_USER_ID);
    const policy = this.getPolicy(dto.scope);
    this.assertClientPolicyMatches(dto.consentVersion, dto.policyHash, policy);

    return this.runTransaction(async (manager) => {
      await this.lockScope(manager, userId, policy.scope);
      const consentRepo = manager.getRepository(AiCvConsent);
      const eventRepo = manager.getRepository(AiCvConsentEvent);
      const consent = await consentRepo.findOne({
        where: { userId, scope: policy.scope, status: AiCvConsentStatus.GRANTED },
      });
      if (!consent) {
        throw new NotFoundException(AI_CV_CONSENT_ERROR_MESSAGES.NO_ACTIVE_CONSENT);
      }

      const now = new Date();
      consent.status = AiCvConsentStatus.REVOKED;
      consent.revokedAt = now;
      consent.updatedAt = now;
      const revoked = await consentRepo.save(consent);
      await eventRepo.save(
        eventRepo.create({
          userId,
          consentId: revoked._id,
          scope: revoked.scope,
          // Record the consent that was actually revoked, not client input.
          consentVersion: revoked.consentVersion,
          policyHash: revoked.policyHash,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
          eventType: AiCvConsentEventType.REVOKED,
          occurredAt: now,
        }),
      );
      return revoked;
    });
  }

  async getCurrent(userId: string, scope: string): Promise<AiCvConsent | null> {
    this.assertUuid(userId, AI_CV_CONSENT_ERROR_MESSAGES.INVALID_USER_ID);
    const policy = this.getPolicy(scope);
    // This remains a projection of the latest consent row, including REVOKED,
    // while making the result deterministic after multiple grant/revoke cycles.
    return this.consentRepo.findOne({
      where: { userId, scope: policy.scope },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async getCurrentForActiveScope(userId: string): Promise<AiCvConsent | null> {
    const policy = getActiveAiCvConsentPolicy(this.configService);
    return this.getCurrent(userId, policy.scope);
  }

  async hasValidConsent(
    userId: string,
    scope: string,
    consentVersion: string,
    policyHash: string,
  ): Promise<boolean> {
    if (!isUUID(userId) || !isAiCvConsentScope(scope)) return false;
    const policy = getActiveAiCvConsentPolicy(this.configService);
    if (
      scope !== policy.scope ||
      consentVersion !== policy.consentVersion ||
      policyHash !== policy.policyHash
    ) {
      return false;
    }

    const consent = await this.consentRepo.findOne({
      where: { userId, scope: policy.scope, status: AiCvConsentStatus.GRANTED },
    });
    return Boolean(
      consent &&
        consent.consentVersion === policy.consentVersion &&
        consent.policyHash === policy.policyHash &&
        consent.grantedAt &&
        !consent.revokedAt,
    );
  }

  private getPolicy(scope: unknown) {
    if (!isAiCvConsentScope(scope)) {
      throw new BadRequestException(AI_CV_CONSENT_ERROR_MESSAGES.INVALID_SCOPE);
    }
    const policy = getActiveAiCvConsentPolicy(this.configService);
    if (policy.scope !== scope) {
      throw new BadRequestException(AI_CV_CONSENT_ERROR_MESSAGES.INVALID_SCOPE);
    }
    return policy;
  }

  private assertClientPolicyMatches(
    consentVersion: string,
    policyHash: string,
    policy: ReturnType<typeof getActiveAiCvConsentPolicy>,
  ): void {
    if (consentVersion !== policy.consentVersion || policyHash !== policy.policyHash) {
      throw new ConflictException(AI_CV_CONSENT_ERROR_MESSAGES.POLICY_MISMATCH);
    }
  }

  private assertUuid(value: string, message: string): void {
    if (!isUUID(value)) throw new BadRequestException(message);
  }

  private async lockScope(manager: EntityManager, userId: string, scope: string) {
    if (typeof manager.query === 'function') {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('ai_cv_consent:' || $1 || ':' || $2))`,
        [userId, scope],
      );
    }
  }

  private runTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (this.dataSource) return this.dataSource.transaction(work);
    return this.consentRepo.manager.transaction(work);
  }
}
