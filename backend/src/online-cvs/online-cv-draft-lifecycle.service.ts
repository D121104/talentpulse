import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { IUser } from 'src/users/users.interface';
import { OnlineCV } from './entities/online-cv.entity';
import { CvGenerationMetadata } from './async-cv-generation.types';

@Injectable()
export class OnlineCvDraftLifecycleService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
  ) {}

  private generationTrace(cv: OnlineCV): CvGenerationMetadata | undefined {
    const value = cv.revision?.sourceTrace?.generation;
    return value && typeof value === 'object' ? value : undefined;
  }

  private generationWriteCriteria(cv: OnlineCV) {
    return {
      _id: cv._id,
      userId: cv.userId,
      isDeleted: false,
      contentVersion: cv.contentVersion,
      revision: Raw(
        (alias) =>
          `${alias} IS NOT DISTINCT FROM CAST(:expectedRevision AS jsonb)`,
        { expectedRevision: cv.revision ? JSON.stringify(cv.revision) : null },
      ),
      generationSnapshot: Raw(
        (alias) =>
          `${alias} IS NOT DISTINCT FROM CAST(:expectedGenerationSnapshot AS jsonb)`,
        {
          expectedGenerationSnapshot: cv.generationSnapshot
            ? JSON.stringify(cv.generationSnapshot)
            : null,
        },
      ),
    };
  }

  async expirePendingGenerationDrafts(): Promise<number> {
    const now = new Date();
    const expired = await this.onlineCVRepo
      .createQueryBuilder('cv')
      .select([
        'cv._id',
        'cv.userId',
        'cv.contentVersion',
        'cv.isDeleted',
        'cv.generationSnapshot',
        'cv.revision',
      ])
      .where('"cv"."isDeleted" = false')
      .andWhere(
        "\"cv\".\"generationSnapshot\"->'pendingDraft'->>'reviewStatus' = 'PENDING'",
      )
      .andWhere(
        '("cv"."generationSnapshot"->\'pendingDraft\'->>\'expiresAt\')::timestamptz <= :now',
        { now: now.toISOString() },
      )
      .orderBy(
        '("cv"."generationSnapshot"->\'pendingDraft\'->>\'expiresAt\')::timestamptz',
        'ASC',
      )
      .take(100)
      .getMany();

    let expiredCount = 0;
    for (const cv of expired) {
      if (await this.expirePendingDraft(cv)) expiredCount += 1;
    }
    return expiredCount;
  }

  async expirePendingDraft(cv: OnlineCV): Promise<boolean> {
    const pending = cv.generationSnapshot?.pendingDraft;
    const metadata = this.generationTrace(cv);
    if (
      !pending ||
      pending.reviewStatus !== 'PENDING' ||
      Date.parse(pending.expiresAt) > Date.now() ||
      !metadata ||
      metadata.operationId !== pending.operationId
    )
      return false;

    const generationSnapshot = { ...(cv.generationSnapshot || {}) };
    delete generationSnapshot.pendingDraft;
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: { ...metadata, reviewStatus: 'EXPIRED' as const },
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { generationSnapshot, revision },
    );
    if (!result.affected) return false;
    cv.generationSnapshot = generationSnapshot;
    cv.revision = revision as OnlineCV['revision'];
    return true;
  }

  async discardGenerationDraft(
    id: string,
    operationId: string,
    user: IUser,
  ): Promise<void> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: id, userId: user._id, isDeleted: false },
    });
    if (!cv)
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    const metadata = this.generationTrace(cv);
    if (!metadata || metadata.operationId !== operationId)
      throw new NotFoundException('Không tìm thấy bản nháp CV');

    const pending = cv.generationSnapshot?.pendingDraft;
    if (!pending) {
      if (
        metadata.reviewStatus === 'REJECTED' ||
        metadata.reviewStatus === 'EXPIRED'
      )
        return;
      throw new ConflictException('Bản nháp CV không còn chờ xem xét');
    }
    if (
      pending.operationId !== operationId ||
      pending.reviewStatus !== 'PENDING' ||
      metadata.reviewStatus !== 'PENDING'
    )
      throw new NotFoundException('Không tìm thấy bản nháp CV');

    const generationSnapshot = { ...(cv.generationSnapshot || {}) };
    delete generationSnapshot.pendingDraft;
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: { ...metadata, reviewStatus: 'REJECTED' as const },
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { generationSnapshot, revision },
    );
    if (!result.affected)
      return this.discardGenerationDraft(id, operationId, user);
  }
}
