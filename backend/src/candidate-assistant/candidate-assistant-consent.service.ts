import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  GrantCandidateAssistantConsentDto,
  RevokeCandidateAssistantConsentDto,
} from './dto/candidate-assistant-consent.dto';
import {
  AiCandidateAssistantConsent,
  CandidateAssistantConsentStatus,
} from './entities/ai-candidate-assistant-consent.entity';
import { AiCandidateAssistantConsentEvent } from './entities/ai-candidate-assistant-consent-event.entity';
import {
  CandidateAssistantConsentPolicy,
  getCandidateAssistantConsentPolicy,
} from './candidate-assistant-consent.policy';

@Injectable()
export class CandidateAssistantConsentService {
  constructor(
    @InjectRepository(AiCandidateAssistantConsent)
    private readonly consentRepo: Repository<AiCandidateAssistantConsent>,
    @InjectRepository(AiCandidateAssistantConsentEvent)
    private readonly eventRepo: Repository<AiCandidateAssistantConsentEvent>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}
  private assertUser(userId: string) {
    if (!isUUID(userId)) throw new BadRequestException('Invalid user id');
  }
  getActivePolicy(): CandidateAssistantConsentPolicy {
    return getCandidateAssistantConsentPolicy(this.config);
  }
  private assertPolicy(version: string, hash: string) {
    const p = this.getActivePolicy();
    if (version !== p.consentVersion || hash !== p.policyHash)
      throw new ConflictException(
        'Candidate assistant consent policy/version does not match the active policy',
      );
    return p;
  }
  async grant(userId: string, dto: GrantCandidateAssistantConsentDto) {
    this.assertUser(userId);
    const p = this.assertPolicy(dto.consentVersion, dto.policyHash);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);
      const repo = manager.getRepository(AiCandidateAssistantConsent);
      const eventRepo = manager.getRepository(AiCandidateAssistantConsentEvent);
      const existing = await repo.findOne({
        where: { userId, status: CandidateAssistantConsentStatus.GRANTED },
      });
      if (existing) {
        if (
          existing.consentVersion === p.consentVersion &&
          existing.policyHash === p.policyHash
        )
          return existing;
        throw new ConflictException(
          'An active candidate assistant consent already exists',
        );
      }
      const now = new Date();
      const saved = await repo.save(
        repo.create({
          userId,
          consentVersion: p.consentVersion,
          policyHash: p.policyHash,
          status: CandidateAssistantConsentStatus.GRANTED,
          grantedAt: now,
          revokedAt: null,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
        }),
      );
      await eventRepo.save(
        eventRepo.create({
          userId,
          consentId: saved._id,
          consentVersion: saved.consentVersion,
          policyHash: saved.policyHash,
          eventType: CandidateAssistantConsentStatus.GRANTED,
          occurredAt: now,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
        }),
      );
      return saved;
    });
  }
  async revoke(userId: string, dto: RevokeCandidateAssistantConsentDto) {
    this.assertUser(userId);
    this.assertPolicy(dto.consentVersion, dto.policyHash);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);
      const repo = manager.getRepository(AiCandidateAssistantConsent);
      const eventRepo = manager.getRepository(AiCandidateAssistantConsentEvent);
      const consent = await repo.findOne({
        where: { userId, status: CandidateAssistantConsentStatus.GRANTED },
      });
      if (!consent)
        throw new NotFoundException(
          'No active candidate assistant consent exists',
        );
      const now = new Date();
      consent.status = CandidateAssistantConsentStatus.REVOKED;
      consent.revokedAt = now;
      const saved = await repo.save(consent);
      await eventRepo.save(
        eventRepo.create({
          userId,
          consentId: saved._id,
          consentVersion: saved.consentVersion,
          policyHash: saved.policyHash,
          eventType: CandidateAssistantConsentStatus.REVOKED,
          occurredAt: now,
          source: dto.source,
          sourceMetadata: dto.sourceMetadata || null,
        }),
      );
      return saved;
    });
  }
  async getCurrent(userId: string) {
    this.assertUser(userId);
    return this.consentRepo.findOne({
      where: { userId },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }
  async hasValidConsent(userId: string) {
    if (!isUUID(userId)) return false;
    const p = getCandidateAssistantConsentPolicy(this.config);
    const row = await this.consentRepo.findOne({
      where: { userId, status: CandidateAssistantConsentStatus.GRANTED },
    });
    return Boolean(
      row &&
        row.consentVersion === p.consentVersion &&
        row.policyHash === p.policyHash &&
        row.grantedAt &&
        !row.revokedAt,
    );
  }
  private async lock(manager: EntityManager, userId: string) {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext('candidate_assistant_consent:' || $1))`,
      [userId],
    );
  }
}
