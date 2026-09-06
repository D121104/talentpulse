import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { Role } from 'src/decorator/customize';
import { PremiumPlan } from 'src/users/entities/user.entity';
import { AiChatQuotaLedger } from './entities/ai-chat-quota-ledger.entity';
import { AiQuotaReservationStatus } from './candidate-assistant.types';

export interface AiQuotaReservation {
  id: string;
  userId: string;
  quotaDate: string;
  reservationKey: string;
  reused: boolean;
}

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
      return this.toReservation(await repo.save(row), false);
    });
  }

  async commit(
    reservation: AiQuotaReservation,
    messageId: string,
  ): Promise<void> {
    await this.update(reservation, {
      status: AiQuotaReservationStatus.COMMITTED,
      messageId,
      finalizedAt: new Date(),
      errorCode: null,
    });
  }

  async release(
    reservation: AiQuotaReservation,
    errorCode = 'AI_REQUEST_FAILED',
  ): Promise<void> {
    await this.update(reservation, {
      status: AiQuotaReservationStatus.RELEASED,
      finalizedAt: new Date(),
      errorCode,
    });
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
    return premiumActive ? 100 : 10;
  }

  private async update(
    reservation: AiQuotaReservation,
    values: Partial<AiChatQuotaLedger>,
  ): Promise<void> {
    await this.ledgerRepo.update(
      {
        _id: reservation.id,
        userId: reservation.userId,
        quotaDate: reservation.quotaDate,
        status: AiQuotaReservationStatus.RESERVED,
      },
      values,
    );
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
    };
  }

  private getUtcPlusSevenDate(now: Date): string {
    const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
  }
}
