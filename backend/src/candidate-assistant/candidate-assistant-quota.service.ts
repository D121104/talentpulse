import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  FindOptionsWhere,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { Role } from 'src/decorator/customize';
import { PremiumPlan } from 'src/users/entities/user.entity';
import { AiChatQuotaLedger } from './entities/ai-chat-quota-ledger.entity';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { AiChatMessageStatus } from './candidate-assistant.types';
import { AiQuotaReservationStatus } from './candidate-assistant.types';
import { PremiumPackage } from 'src/payments/entities/premium-package.entity';
import { isUUID } from 'class-validator';

export interface AiQuotaReservation {
  id: string;
  userId: string;
  quotaDate: string;
  reservationKey: string;
  reused: boolean;
  executionOwner?: string;
}

export interface CandidateAssistantExecutionLease {
  reservation: AiQuotaReservation;
  owner: string;
  expiresAt: Date;
  graceMs: number;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export const CANDIDATE_ASSISTANT_LEASE_TTL_MS = 30_000;
export const CANDIDATE_ASSISTANT_LEASE_GRACE_MS = 5_000;

class LeaseTransitionConflict extends Error {}

@Injectable()
export class CandidateAssistantQuotaService {
  constructor(
    @InjectRepository(AiChatQuotaLedger)
    private readonly ledgerRepo: Repository<AiChatQuotaLedger>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  async reserve(
    userId: string,
    reservationKey: string,
    now = new Date(),
  ): Promise<AiQuotaReservation> {
    const quotaDate = this.getUtcPlusSevenDate(now);
    const limit = await this.getDailyLimit(userId, now);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('candidate_assistant_quota:' || $1 || ':' || $2))`,
        [userId, quotaDate],
      );
      const repo = manager.getRepository(AiChatQuotaLedger);
      const existing = await repo.findOne({
        where: { userId, quotaDate, reservationKey },
      });
      if (existing && existing.status !== AiQuotaReservationStatus.RELEASED) {
        return this.toReservation(existing, true);
      }
      if (limit !== null) {
        const used = await repo.count({
          where: [
            { userId, quotaDate, status: AiQuotaReservationStatus.RESERVED },
            { userId, quotaDate, status: AiQuotaReservationStatus.COMMITTED },
          ],
        });
        if (used >= limit) {
          throw new HttpException(
            {
              code: 'AI_DAILY_QUOTA_EXCEEDED',
              message: 'Daily AI quota exceeded',
            },
            429,
          );
        }
      }
      const row =
        existing || repo.create({ userId, quotaDate, reservationKey });
      row.status = AiQuotaReservationStatus.RESERVED;
      row.errorCode = null;
      row.finalizedAt = null;
      row.messageId = null;
      row.executionOwner = null;
      row.leaseExpiresAt = null;
      row.executionSessionId = null;
      row.executionUserMessageId = null;
      row.executionAssistantMessageId = null;
      return this.toReservation(await repo.save(row), false);
    });
  }

  async getQuota(userId: string, now = new Date()) {
    const quotaDate = this.getUtcPlusSevenDate(now);
    const limit = await this.getDailyLimit(userId, now);
    const usedToday = await this.ledgerRepo.count({
      where: [
        { userId, quotaDate, status: AiQuotaReservationStatus.RESERVED },
        { userId, quotaDate, status: AiQuotaReservationStatus.COMMITTED },
      ],
    });
    return {
      usedToday,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - usedToday),
      isUnlimited: limit === null,
      timezone: 'Asia/Ho_Chi_Minh (UTC+7)',
    };
  }

  async commit(
    reservation: AiQuotaReservation,
    messageId: string,
    assistantUpdates?: Partial<AiChatMessage>,
  ): Promise<boolean> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const ledger = manager.getRepository(AiChatQuotaLedger);
        const updated = await ledger.update(
          this.reservationWhere(reservation),
          {
            status: AiQuotaReservationStatus.COMMITTED,
            messageId,
            finalizedAt: new Date(),
            errorCode: null,
            executionOwner: null,
            leaseExpiresAt: null,
            executionSessionId: null,
            executionUserMessageId: null,
            executionAssistantMessageId: null,
          },
        );
        if (updated.affected !== 1) return false;
        if (assistantUpdates) {
          const assistant = await manager
            .getRepository(AiChatMessage)
            .update(
              { _id: messageId, status: AiChatMessageStatus.PROCESSING },
              assistantUpdates,
            );
          if (assistant.affected !== 1) throw new LeaseTransitionConflict();
        }
        return true;
      });
    } catch (error) {
      if (error instanceof LeaseTransitionConflict) return false;
      throw error;
    }
  }

  async release(
    reservation: AiQuotaReservation,
    errorCode = 'AI_REQUEST_FAILED',
    assistantUpdates?: Partial<AiChatMessage>,
  ): Promise<boolean> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const ledger = manager.getRepository(AiChatQuotaLedger);
        const updated = await ledger.update(
          this.reservationWhere(reservation),
          {
            status: AiQuotaReservationStatus.RELEASED,
            messageId: null,
            finalizedAt: new Date(),
            errorCode: errorCode.slice(0, 64),
            executionOwner: null,
            leaseExpiresAt: null,
            executionSessionId: null,
            executionUserMessageId: null,
            executionAssistantMessageId: null,
          },
        );
        if (updated.affected !== 1) return false;
        const assistantId = assistantUpdates?._id;
        if (assistantUpdates && typeof assistantId === 'string') {
          const assistant = await manager
            .getRepository(AiChatMessage)
            .update(
              { _id: assistantId, status: AiChatMessageStatus.PROCESSING },
              assistantUpdates,
            );
          if (assistant.affected !== 1) throw new LeaseTransitionConflict();
        }
        return true;
      });
    } catch (error) {
      if (error instanceof LeaseTransitionConflict) return false;
      throw error;
    }
  }

  async acquireLease(
    reservation: AiQuotaReservation,
    owner: string,
    context: Pick<
      CandidateAssistantExecutionLease,
      'sessionId' | 'userMessageId' | 'assistantMessageId'
    >,
    now = new Date(),
  ): Promise<CandidateAssistantExecutionLease | null> {
    const expiresAt = new Date(
      now.getTime() + CANDIDATE_ASSISTANT_LEASE_TTL_MS,
    );
    const result = await this.ledgerRepo.update(
      {
        ...this.reservationWhere(reservation),
        executionOwner: IsNull(),
      },
      {
        executionOwner: owner,
        leaseExpiresAt: expiresAt,
        executionSessionId: context.sessionId,
        executionUserMessageId: context.userMessageId,
        executionAssistantMessageId: context.assistantMessageId,
      },
    );
    if (result.affected !== 1) return null;
    reservation.executionOwner = owner;
    return {
      reservation,
      owner,
      expiresAt,
      graceMs: CANDIDATE_ASSISTANT_LEASE_GRACE_MS,
      ...context,
    };
  }

  async renewLease(
    reservation: AiQuotaReservation,
    owner: string,
    now = new Date(),
  ): Promise<boolean> {
    const result = await this.ledgerRepo.update(
      { ...this.reservationWhere(reservation), executionOwner: owner },
      {
        leaseExpiresAt: new Date(
          now.getTime() + CANDIDATE_ASSISTANT_LEASE_TTL_MS,
        ),
      },
    );
    return result.affected === 1;
  }

  async findExpiredLeases(
    now = new Date(),
  ): Promise<CandidateAssistantExecutionLease[]> {
    const cutoff = new Date(now.getTime() - CANDIDATE_ASSISTANT_LEASE_GRACE_MS);
    const rows = await this.ledgerRepo.find({
      where: {
        status: AiQuotaReservationStatus.RESERVED,
        executionOwner: Not(IsNull()),
        leaseExpiresAt: LessThan(cutoff),
      },
      order: { leaseExpiresAt: 'ASC', _id: 'ASC' },
      take: 100,
    });
    return rows.flatMap((row) => {
      if (
        !row.executionOwner ||
        !row.leaseExpiresAt ||
        !row.executionSessionId ||
        !row.executionUserMessageId ||
        !row.executionAssistantMessageId
      ) {
        return [];
      }
      const reservation = this.toReservation(row, true);
      return [
        {
          reservation,
          owner: row.executionOwner,
          expiresAt: row.leaseExpiresAt,
          graceMs: CANDIDATE_ASSISTANT_LEASE_GRACE_MS,
          sessionId: row.executionSessionId,
          userMessageId: row.executionUserMessageId,
          assistantMessageId: row.executionAssistantMessageId,
        },
      ];
    });
  }

  async terminalizeLease(
    lease: CandidateAssistantExecutionLease,
    now = new Date(),
  ): Promise<boolean> {
    const recoveryOwner = randomUUID();
    const cutoff = new Date(now.getTime() - lease.graceMs);
    const result = await this.ledgerRepo.update(
      {
        ...this.reservationWhere(lease.reservation),
        executionOwner: lease.owner,
        leaseExpiresAt: LessThanOrEqual(cutoff),
      },
      {
        executionOwner: recoveryOwner,
        leaseExpiresAt: new Date(
          now.getTime() + CANDIDATE_ASSISTANT_LEASE_TTL_MS,
        ),
      },
    );
    if (result.affected !== 1) return false;
    lease.owner = recoveryOwner;
    lease.reservation.executionOwner = recoveryOwner;
    lease.expiresAt = new Date(
      now.getTime() + CANDIDATE_ASSISTANT_LEASE_TTL_MS,
    );
    return true;
  }

  private async getDailyLimit(
    userId: string,
    now: Date,
  ): Promise<number | null> {
    const user = await this.usersService.findOne(userId);
    if (user.role === Role.ADMIN) return null;
    if (user.role === Role.HR) {
      throw new HttpException(
        {
          code: 'CANDIDATE_ASSISTANT_FORBIDDEN',
          message: 'Candidate assistant is not available to HR',
        },
        403,
      );
    }
    const premiumActive =
      user.role === Role.USER &&
      user.isPremium === true &&
      user.premiumPlan === PremiumPlan.CANDIDATE_PREMIUM &&
      user.premiumExpiresAt instanceof Date &&
      user.premiumExpiresAt.getTime() > now.getTime();
    if (premiumActive && !isUUID(user.premiumPackageId || '')) {
      throw new HttpException(
        {
          code: 'CHATBOT_PACKAGE_CONFIGURATION_REQUIRED',
          message: 'Chatbot package policy requires administrator repair',
        },
        409,
      );
    }
    const pkg = await this.dataSource.getRepository(PremiumPackage).findOne({
      where: premiumActive
        ? {
            _id:
              user.premiumPackageId || '00000000-0000-0000-0000-000000000000',
            planType: PremiumPlan.CANDIDATE_PREMIUM,
          }
        : {
            code: 'FREE_DEFAULT',
            planType: PremiumPlan.FREE,
            isDeleted: false,
          },
      withDeleted: premiumActive,
    });
    if (
      !pkg ||
      (pkg.chatbotDailyLimit !== null &&
        (!Number.isInteger(pkg.chatbotDailyLimit) || pkg.chatbotDailyLimit < 0))
    ) {
      throw new HttpException(
        {
          code: 'CHATBOT_PACKAGE_CONFIGURATION_REQUIRED',
          message: 'Chatbot package policy requires administrator repair',
        },
        409,
      );
    }
    return pkg.chatbotDailyLimit;
  }

  private reservationWhere(
    reservation: AiQuotaReservation,
  ): FindOptionsWhere<AiChatQuotaLedger> {
    return {
      _id: reservation.id,
      userId: reservation.userId,
      quotaDate: reservation.quotaDate,
      status: AiQuotaReservationStatus.RESERVED,
      ...(reservation.executionOwner
        ? { executionOwner: reservation.executionOwner }
        : {}),
    };
  }

  private toReservation(
    row: AiChatQuotaLedger,
    reused: boolean,
  ): AiQuotaReservation {
    return {
      id: row._id,
      userId: row.userId,
      quotaDate: row.quotaDate,
      reservationKey: row.reservationKey,
      reused,
      ...(row.executionOwner ? { executionOwner: row.executionOwner } : {}),
    };
  }

  private getUtcPlusSevenDate(now: Date): string {
    const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
  }
}
