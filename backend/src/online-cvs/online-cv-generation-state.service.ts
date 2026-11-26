import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { Queue } from 'bull';
import { IUser } from 'src/users/users.interface';
import { OnlineCV } from './entities/online-cv.entity';
import {
  CvGenerationJobData,
  CvGenerationMetadata,
  CvGenerationOperationStatus,
  ONLINE_CV_GENERATION_QUEUE,
} from './async-cv-generation.types';
import { OnlineCvDraftLifecycleService } from './online-cv-draft-lifecycle.service';

const CV_GENERATION_TIMEOUT_MS = 300_000;

@Injectable()
export class OnlineCvGenerationStateService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectQueue(ONLINE_CV_GENERATION_QUEUE)
    private readonly generationQueue: Queue<CvGenerationJobData>,
    private readonly draftLifecycle: OnlineCvDraftLifecycleService,
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
    };
  }

  async markGenerationFailure(
    data: CvGenerationJobData,
    errorCode = 'WORKER_FAILURE',
  ): Promise<void> {
    await this.finishGeneration(data, 'FAILED', errorCode);
  }

  private async findOwnedCv(id: string, user: IUser): Promise<OnlineCV> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: id, userId: user._id, isDeleted: false },
    });
    if (!cv)
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    return cv;
  }

  async getGenerationState(
    id: string,
    operationId: string,
    user: IUser,
  ): Promise<{ cv: OnlineCV; metadata: CvGenerationMetadata }> {
    const cv = await this.findOwnedCv(id, user);
    const metadata = this.generationTrace(cv);
    const regeneration = metadata?.regeneration;
    const isRegeneration = regeneration?.operationId === operationId;
    if (!metadata || (metadata.operationId !== operationId && !isRegeneration))
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    const pending = cv.generationSnapshot?.pendingDraft;
    if (
      pending?.operationId === operationId &&
      pending.reviewStatus === 'PENDING' &&
      Date.parse(pending.expiresAt) <= Date.now()
    ) {
      await this.draftLifecycle.expirePendingDraft(cv);
      return this.getGenerationState(id, operationId, user);
    }
    const currentOperation = isRegeneration
      ? { ...metadata, ...regeneration }
      : metadata;
    if (
      ['QUEUED', 'RUNNING'].includes(currentOperation.status) &&
      Date.now() >=
        Date.parse(currentOperation.createdAt) + CV_GENERATION_TIMEOUT_MS
    ) {
      await this.finishGeneration(
        {
          cvId: id,
          userId: user._id,
          operationId,
          ...(isRegeneration ? { regenerationTarget: regeneration } : {}),
        } as unknown as CvGenerationJobData,
        'FAILED',
        'AI_TIMEOUT',
      );
      return this.getGenerationState(id, operationId, user);
    }
    return { cv, metadata: currentOperation };
  }

  async cancelGeneration(
    id: string,
    operationId: string,
    user: IUser,
  ): Promise<{ cv: OnlineCV; metadata: CvGenerationMetadata }> {
    const cv = await this.findOwnedCv(id, user);
    const metadata = this.generationTrace(cv);
    const regeneration = metadata?.regeneration;
    const isRegeneration = regeneration?.operationId === operationId;
    if (!metadata || (metadata.operationId !== operationId && !isRegeneration))
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    if (isRegeneration) {
      if (!['QUEUED', 'RUNNING'].includes(regeneration.status)) {
        return { cv, metadata: { ...metadata, ...regeneration } };
      }
      const cancelledAttempt = {
        ...regeneration,
        status: 'CANCELLED' as const,
        finishedAt: new Date().toISOString(),
        errorCode: 'CANCELLED_BY_USER',
      };
      const result = await this.onlineCVRepo.update(
        this.generationWriteCriteria(cv),
        {
          revision: {
            ...(cv.revision || {}),
            sourceTrace: {
              ...(cv.revision?.sourceTrace || {}),
              generation: { ...metadata, regeneration: cancelledAttempt },
            },
          },
        },
      );
      if (!result.affected)
        return this.getGenerationState(id, operationId, user);
      await this.removeQueuedOperation(operationId);
      return this.getGenerationState(id, operationId, user);
    }
    if (
      ['COMPLETE', 'DEGRADED', 'FAILED', 'STALE', 'CANCELLED'].includes(
        metadata.status,
      )
    ) {
      return { cv, metadata };
    }
    const cancelled: CvGenerationMetadata = {
      ...metadata,
      status: 'CANCELLED',
      finishedAt: new Date().toISOString(),
      errorCode: 'CANCELLED_BY_USER',
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      {
        revision: {
          ...(cv.revision || {}),
          sourceTrace: {
            ...(cv.revision?.sourceTrace || {}),
            generation: cancelled,
          },
        },
      },
    );
    if (!result.affected) return this.getGenerationState(id, operationId, user);
    await this.removeQueuedOperation(operationId);
    return this.getGenerationState(cv._id, operationId, user);
  }

  private async removeQueuedOperation(operationId: string): Promise<void> {
    try {
      const queued = await this.generationQueue.getJob(operationId);
      if (
        queued &&
        ['waiting', 'delayed', 'paused'].includes(await queued.getState())
      ) {
        await queued.remove();
      }
    } catch {
      // The cancellation state remains persisted if Redis is unavailable.
    }
  }

  async setGenerationStatus(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
  ): Promise<boolean> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    const current = cv && this.generationTrace(cv);
    if (data.regenerationTarget) {
      const attempt = current?.regeneration;
      if (
        !cv ||
        !current ||
        current.operationId !== data.regenerationTarget.reviewOperationId ||
        attempt?.operationId !== data.operationId ||
        attempt.status !== 'QUEUED' ||
        attempt.expectedDraftHash !==
          data.regenerationTarget.expectedDraftHash ||
        attempt.targetPath !== data.regenerationTarget.targetPath
      )
        return false;
      const revision = {
        ...(cv.revision || {}),
        sourceTrace: {
          ...(cv.revision?.sourceTrace || {}),
          generation: {
            ...current,
            regeneration: {
              ...attempt,
              status,
              startedAt: new Date().toISOString(),
            },
          },
        },
      };
      const result = await this.onlineCVRepo.update(
        this.generationWriteCriteria(cv),
        { revision },
      );
      if (result.affected) cv.revision = revision as OnlineCV['revision'];
      return Boolean(result.affected);
    }
    if (
      !cv ||
      !current ||
      current.operationId !== data.operationId ||
      current.status !== 'QUEUED'
    )
      return false;
    const metadata = {
      ...current,
      status,
      startedAt: new Date().toISOString(),
    };
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: metadata,
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { revision },
    );
    if (result.affected) cv.revision = revision as OnlineCV['revision'];
    return Boolean(result.affected);
  }

  async finishGeneration(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
    errorCode?: string,
    warnings?: string[],
  ): Promise<void> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    if (!cv) return;
    const current = this.generationTrace(cv);
    if (data.regenerationTarget) {
      const attempt = current?.regeneration;
      if (
        !current ||
        current.operationId !== data.regenerationTarget.reviewOperationId ||
        attempt?.operationId !== data.operationId ||
        !['QUEUED', 'RUNNING'].includes(attempt.status) ||
        attempt.expectedDraftHash !==
          data.regenerationTarget.expectedDraftHash ||
        attempt.targetPath !== data.regenerationTarget.targetPath
      )
        return;
      const regeneration = {
        ...attempt,
        status,
        finishedAt: new Date().toISOString(),
        ...(errorCode ? { errorCode } : {}),
      };
      const revision = {
        ...(cv.revision || {}),
        sourceTrace: {
          ...(cv.revision?.sourceTrace || {}),
          generation: { ...current, regeneration },
        },
      };
      const result = await this.onlineCVRepo.update(
        this.generationWriteCriteria(cv),
        { revision },
      );
      if (result.affected) {
        cv.revision = revision as OnlineCV['revision'];
        this.logGenerationJobObservation(
          data,
          { ...current, regeneration },
          status,
          errorCode,
          cv.revision?.sourceTrace,
        );
      }
      return;
    }
    if (
      !current ||
      current.operationId !== data.operationId ||
      !['QUEUED', 'RUNNING'].includes(current.status)
    )
      return;
    const metadata: CvGenerationMetadata = {
      ...current,
      status,
      finishedAt: new Date().toISOString(),
      ...(errorCode ? { errorCode } : {}),
      ...(warnings ? { warnings } : {}),
    };
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: metadata,
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { revision },
    );
    if (result.affected) {
      cv.revision = revision as OnlineCV['revision'];
      this.logGenerationJobObservation(
        data,
        metadata,
        status,
        errorCode,
        cv.revision?.sourceTrace,
      );
    }
  }

  private logGenerationJobObservation(
    data: CvGenerationJobData,
    metadata: CvGenerationMetadata,
    status: CvGenerationOperationStatus,
    errorCode?: string,
    sourceTrace?: Record<string, unknown>,
  ): void {
    const regeneration = data.regenerationTarget
      ? metadata.regeneration
      : undefined;
    const operationAttemptId =
      regeneration?.operationId || metadata.operationId;
    const correlationId =
      regeneration?.correlationId ||
      (typeof sourceTrace?.traceId === 'string'
        ? sourceTrace.traceId
        : operationAttemptId);
    const safeErrorType =
      errorCode && /^[A-Z0-9_]{1,48}$/.test(errorCode) ? errorCode : null;
    Logger.log(
      JSON.stringify({
        operation_attempt_id: operationAttemptId,
        request_id:
          regeneration?.requestId ||
          (typeof sourceTrace?.requestId === 'string'
            ? sourceTrace.requestId
            : operationAttemptId),
        trace_id: correlationId,
        correlation_id: correlationId,
        capability_id: 'cv_generation',
        implementation:
          regeneration?.implementation || metadata.implementation || 'legacy',
        status,
        review_status:
          metadata.reviewStatus === 'PENDING'
            ? 'PENDING_REVIEW'
            : metadata.reviewStatus ||
              (status === 'COMPLETE' || status === 'DEGRADED'
                ? 'NOT_REQUIRED'
                : 'FAILED'),
        duration_ms: Math.max(
          0,
          Date.now() -
            Date.parse(regeneration?.createdAt || metadata.createdAt),
        ),
        steps:
          regeneration?.implementation === 'agent' ||
          metadata.implementation === 'agent'
            ? 1
            : 0,
        model_calls: 1,
        tool_calls: 0,
        error_type: safeErrorType,
      }),
    );
  }
}
