import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { JobsService } from 'src/jobs/jobs.service';
import { Company } from 'src/companies/entities/company.entity';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { UserCVsService } from 'src/usercvs/usercvs.service';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { AiChatSession } from './entities/ai-chat-session.entity';
import { CreateAiChatSessionDto } from './dto/create-ai-chat-session.dto';
import {
  ListAiChatMessagesDto,
  SendAiChatMessageDto,
} from './dto/send-ai-chat-message.dto';
import { CandidateAssistantConsentService } from './candidate-assistant-consent.service';
import { CandidateAssistantQuotaService } from './candidate-assistant-quota.service';
import {
  AI_LOCALE_PATTERN,
  DEFAULT_AI_LOCALE,
  AiChatMessageRole,
  AiChatMessageStatus,
  AiChatSessionMode,
  CandidateAssistantAiClient,
  CandidateAssistantBlock,
  CandidateAssistantCitation,
  CandidateAssistantResponse,
  CANDIDATE_ASSISTANT_AI_CLIENT,
  generationMetadata,
} from './candidate-assistant.types';
import { mapCandidateAssistantProviderError } from './candidate-assistant.errors';

const MAX_BLOCKS = 24;
const MAX_CITATIONS = 32;
const MAX_BLOCK_TEXT = 4000;
const MAX_FILTER_KEYS = 24;
const MAX_HISTORY_ENTRIES = 8;
const MAX_HISTORY_ENTRY_CHARS = 4000;
const MAX_HISTORY_TOTAL_CHARS = 6000;
const LEASE_RENEWAL_INTERVAL_MS = 10_000;
const LEASE_RECONCILIATION_INTERVAL_MS = 15_000;

@Injectable()
export class CandidateAssistantService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CandidateAssistantService.name);
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AiChatSession)
    private readonly sessionRepo: Repository<AiChatSession>,
    @InjectRepository(AiChatMessage)
    private readonly messageRepo: Repository<AiChatMessage>,
    private readonly consentService: CandidateAssistantConsentService,
    private readonly quotaService: CandidateAssistantQuotaService,
    private readonly jobsService: JobsService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly userCVsService: UserCVsService,
    @Inject(CANDIDATE_ASSISTANT_AI_CLIENT)
    private readonly aiClient: CandidateAssistantAiClient,
  ) {}

  onModuleInit(): void {
    this.reconciliationTimer = setInterval(() => {
      void this.reconcileInterruptedRequests().catch((error: unknown) => {
        this.logger.error(
          `Candidate assistant lease reconciliation failed (${
            error instanceof Error ? error.name : 'unknown'
          })`,
        );
      });
    }, LEASE_RECONCILIATION_INTERVAL_MS);
    this.reconciliationTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  private assertActor(user: IUser) {
    if (!user || ![Role.USER, Role.ADMIN].includes(user.role as Role))
      throw new ForbiddenException(
        'Candidate assistant is available to candidates and administrators only',
      );
  }
  private async getOwnedSession(id: string, user: IUser) {
    this.assertActor(user);
    const session = await this.sessionRepo.findOne({
      where: { _id: id, userId: user._id },
    });
    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }
  async createSession(dto: CreateAiChatSessionDto, user: IUser) {
    this.assertActor(user);
    if (
      user.role !== Role.ADMIN &&
      !(await this.consentService.hasValidConsent(user._id))
    )
      throw new ForbiddenException({
        code: 'AI_CONSENT_REQUIRED',
        message: 'Candidate assistant consent is required',
      });
    return this.sessionRepo.save(
      this.sessionRepo.create({
        userId: user._id,
        mode: dto.mode,
        title: dto.title?.trim() || null,
        archivedAt: null,
      }),
    );
  }
  async getQuota(user: IUser) {
    this.assertActor(user);
    return this.quotaService.getQuota(user._id);
  }

  async listSessions(user: IUser) {
    this.assertActor(user);
    return this.sessionRepo.find({
      where: { userId: user._id },
      order: { updatedAt: 'DESC' },
      take: 100,
    });
  }
  async archiveSession(id: string, user: IUser) {
    const session = await this.getOwnedSession(id, user);
    if (!session.archivedAt) {
      session.archivedAt = new Date();
      await this.sessionRepo.save(session);
    }
    return session;
  }
  async listMessages(id: string, dto: ListAiChatMessagesDto, user: IUser) {
    await this.getOwnedSession(id, user);
    const limit = Math.min(Math.max(Number(dto.limit) || 30, 1), 50);
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .where('message.sessionId = :sessionId', { sessionId: id })
      .orderBy('message.createdAt', 'DESC')
      .take(limit);
    if (dto.before)
      qb.andWhere('message.createdAt < :before', {
        before: new Date(dto.before),
      });
    const rows = await qb.getMany();
    return {
      items: rows.reverse(),
      nextBefore:
        rows.length === limit ? rows[0].createdAt.toISOString() : null,
    };
  }

  async sendMessage(
    id: string,
    dto: SendAiChatMessageDto,
    user: IUser,
    acceptLanguage?: string,
    callerSignal?: AbortSignal,
  ) {
    const session = await this.getOwnedSession(id, user);
    const locale = this.resolveLocale(dto.locale, acceptLanguage);
    if (session.archivedAt)
      throw new ConflictException('Chat session is archived');
    if (
      user.role !== Role.ADMIN &&
      !(await this.consentService.hasValidConsent(user._id))
    )
      throw new ForbiddenException({
        code: 'AI_CONSENT_REQUIRED',
        message: 'Candidate assistant consent is required',
      });
    const existing = await this.messageRepo.findOne({
      where: { sessionId: id, clientMessageId: dto.clientMessageId },
    });
    let failedAssistant: AiChatMessage | null = null;
    let processingAssistant: AiChatMessage | null = null;
    let leaseClaimed = false;
    let leaseLost = false;
    let leaseOwner: string | undefined;
    let leaseHeartbeat: NodeJS.Timeout | undefined;
    let abortController: AbortController | undefined;
    let abortFromCaller: (() => void) | undefined;
    if (existing) {
      failedAssistant = await this.messageRepo.findOne({
        where: {
          sessionId: id,
          parentMessageId: existing._id,
          role: AiChatMessageRole.ASSISTANT,
        },
      });
      if (
        !failedAssistant ||
        failedAssistant.status !== AiChatMessageStatus.FAILED
      )
        return this.idempotentResult(existing);
    }
    const reservation = await this.quotaService.reserve(
      user._id,
      `${session._id}:${dto.clientMessageId}`,
    );
    if (existing && reservation.reused) return this.idempotentResult(existing);
    if (reservation.reused) {
      const raced = await this.messageRepo.findOne({
        where: { sessionId: id, clientMessageId: dto.clientMessageId },
      });
      if (raced) return this.idempotentResult(raced);
      throw new ConflictException(
        'Candidate assistant request is already active',
      );
    }
    let userMessage: AiChatMessage;
    try {
      userMessage =
        existing ||
        (await this.messageRepo.save(
          this.messageRepo.create({
            sessionId: id,
            role: AiChatMessageRole.USER,
            status: AiChatMessageStatus.COMPLETED,
            content: dto.content.trim(),
            clientMessageId: dto.clientMessageId,
            blocks: null,
            citations: null,
            filterState: this.boundFilters(dto.filters),
          }),
        ));
    } catch (error) {
      if (!reservation.reused)
        await this.quotaService.release(reservation, 'IDEMPOTENCY_RACE');
      const raced = await this.messageRepo.findOne({
        where: { sessionId: id, clientMessageId: dto.clientMessageId },
      });
      if (raced) return this.idempotentResult(raced);
      throw error;
    }
    try {
      processingAssistant = await this.messageRepo.save(
        failedAssistant
          ? Object.assign(failedAssistant, {
              status: AiChatMessageStatus.PROCESSING,
              content: null,
              blocks: null,
              generationMetadata: null,
              citations: null,
              filterState: null,
              errorCode: null,
            })
          : this.messageRepo.create({
              sessionId: id,
              parentMessageId: userMessage._id,
              role: AiChatMessageRole.ASSISTANT,
              status: AiChatMessageStatus.PROCESSING,
              content: null,
              clientMessageId: null,
              blocks: null,
              generationMetadata: null,
              citations: null,
              filterState: null,
              errorCode: null,
            }),
      );
      leaseOwner = randomUUID();
      const lease = await this.quotaService.acquireLease(
        reservation,
        leaseOwner,
        {
          sessionId: session._id,
          userMessageId: userMessage._id,
          assistantMessageId: processingAssistant._id,
        },
      );
      if (!lease) {
        throw new ConflictException(
          'Candidate assistant request is already active',
        );
      }
      leaseClaimed = true;
      leaseOwner = lease.owner;
      reservation.executionOwner = lease.owner;
      abortController = new AbortController();
      abortFromCaller = () => abortController?.abort();
      if (callerSignal?.aborted) abortController.abort();
      else
        callerSignal?.addEventListener('abort', abortFromCaller, {
          once: true,
        });
      leaseHeartbeat = setInterval(() => {
        void this.quotaService
          .renewLease(reservation, leaseOwner as string)
          .then((renewed) => {
            if (!renewed) {
              leaseLost = true;
              abortController?.abort();
            }
          })
          .catch(() => {
            leaseLost = true;
            abortController?.abort();
          });
      }, LEASE_RENEWAL_INTERVAL_MS);
      leaseHeartbeat.unref?.();
      if (dto.cvSource && !dto.cvId) {
        throw new BadRequestException('cvSource requires cvId');
      }
      const jobs = await this.loadJobs(dto.jobIds);
      if (
        session.mode === AiChatSessionMode.CV_JOB_COMPARISON &&
        jobs.length !== 1
      )
        throw new BadRequestException(
          'CV_JOB_COMPARISON requires exactly one active job',
        );
      if (
        (session.mode === AiChatSessionMode.CV_ANALYSIS ||
          session.mode === AiChatSessionMode.CV_JOB_COMPARISON) &&
        !dto.cvId
      )
        throw new BadRequestException(
          'A CV is required for this assistant mode',
        );
      if (
        ![
          AiChatSessionMode.CV_ANALYSIS,
          AiChatSessionMode.CV_JOB_COMPARISON,
        ].includes(session.mode) &&
        dto.cvId
      )
        throw new BadRequestException(
          'A CV is not allowed for this assistant mode',
        );
      const cv = dto.cvId
        ? await this.userCVsService.createCandidateAssistantSnapshot(
            user._id,
            dto.cvId,
            dto.cvSource,
            user.email,
          )
        : undefined;
      const history = await this.messageRepo.find({
        where: { sessionId: id },
        order: { createdAt: 'DESC' },
        take: 12,
      });
      const response = this.boundResponse(
        await this.generateWithCancellation(
          {
            requestId: randomUUID(),
            traceId: randomUUID(),
            operationAttemptId: randomUUID(),
            clientMessageId: isUUID(dto.clientMessageId)
              ? dto.clientMessageId
              : randomUUID(),
            userId: user._id,
            sessionId: session._id,
            mode: session.mode,
            locale,
            message: userMessage.content,
            history: this.normalizeHistory(history),
            jobs,
            cv,
            filters: this.boundFilters(dto.filters),
            consentVersion: dto.cvId
              ? this.consentService.getActivePolicy().consentVersion
              : undefined,
          },
          abortController.signal,
        ),
      );
      if (abortController.signal.aborted) {
        throw new ConflictException({
          code: 'AI_REQUEST_INTERRUPTED',
          message: 'Candidate assistant request was interrupted',
        });
      }
      if (!(await this.quotaService.renewLease(reservation, lease.owner))) {
        leaseLost = true;
        throw new ConflictException({
          code: 'AI_REQUEST_INTERRUPTED',
          message: 'Candidate assistant request was interrupted',
        });
      }
      const completedAssistant = Object.assign(processingAssistant, {
        status: AiChatMessageStatus.COMPLETED,
        content: this.assistantText(response),
        blocks: response.blocks,
        generationMetadata: generationMetadata(
          response.source,
          response.fallbackReason,
        ),
        citations: response.citations,
        filterState: response.filterState || null,
        errorCode: null,
      });
      const committed = await this.quotaService.commit(
        reservation,
        completedAssistant._id,
        completedAssistant,
      );
      if (committed === false) {
        throw new ConflictException({
          code: 'AI_REQUEST_INTERRUPTED',
          message: 'Candidate assistant request was interrupted',
        });
      }
      if (committed !== true) await this.messageRepo.save(completedAssistant);
      session.updatedAt = new Date();
      await this.sessionRepo.save(session);
      return { userMessage, assistantMessage: completedAssistant };
    } catch (error) {
      const failed = processingAssistant
        ? Object.assign(processingAssistant, {
            status: AiChatMessageStatus.FAILED,
            content: null,
            blocks: null,
            generationMetadata: null,
            citations: null,
            filterState: null,
            errorCode: this.failureCode(error),
          })
        : null;
      const mayRelease = leaseClaimed ? !leaseLost : !reservation.reused;
      const released = mayRelease
        ? await this.quotaService.release(
            reservation,
            this.failureCode(error),
            failed || undefined,
          )
        : false;
      if (failed && released !== false && released !== true) {
        await this.messageRepo.save(failed);
      }
      if (error instanceof HttpException) throw error;
      throw mapCandidateAssistantProviderError(error);
    } finally {
      if (leaseHeartbeat) clearInterval(leaseHeartbeat);
      if (callerSignal && abortFromCaller)
        callerSignal.removeEventListener('abort', abortFromCaller);
    }
  }

  async reconcileInterruptedRequests(now = new Date()): Promise<void> {
    const expired = await this.quotaService.findExpiredLeases(now);
    for (const lease of expired) {
      if (lease.expiresAt.getTime() >= now.getTime() - lease.graceMs) continue;
      if (!(await this.quotaService.terminalizeLease(lease, now))) continue;
      const assistant = await this.messageRepo.findOne({
        where: {
          _id: lease.assistantMessageId,
          sessionId: lease.sessionId,
          parentMessageId: lease.userMessageId,
          role: AiChatMessageRole.ASSISTANT,
          status: AiChatMessageStatus.PROCESSING,
        },
      });
      if (!assistant) {
        await this.quotaService.release(
          lease.reservation,
          'REQUEST_INTERRUPTED',
        );
        continue;
      }
      const failed = Object.assign(assistant, {
        status: AiChatMessageStatus.FAILED,
        content: null,
        blocks: null,
        generationMetadata: null,
        citations: null,
        filterState: null,
        errorCode: 'REQUEST_INTERRUPTED',
      });
      const released = await this.quotaService.release(
        lease.reservation,
        'REQUEST_INTERRUPTED',
        failed,
      );
      if (released !== false && released !== true) {
        await this.messageRepo.save(failed);
      }
    }
  }

  private async generateWithCancellation(
    request: Parameters<CandidateAssistantAiClient['generate']>[0],
    signal: AbortSignal,
  ): Promise<CandidateAssistantResponse> {
    if (signal.aborted) {
      throw new ConflictException({
        code: 'AI_REQUEST_INTERRUPTED',
        message: 'Candidate assistant request was interrupted',
      });
    }
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () =>
        reject(
          new ConflictException({
            code: 'AI_REQUEST_INTERRUPTED',
            message: 'Candidate assistant request was interrupted',
          }),
        );
      signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      return await Promise.race([
        this.aiClient.generate(request, { signal }),
        aborted,
      ]);
    } finally {
      if (abortListener) signal.removeEventListener('abort', abortListener);
    }
  }
  /** Keep persisted messages inside FastAPI's recent_history contract. */
  private normalizeHistory(
    messages: AiChatMessage[],
  ): Array<{ role: AiChatMessageRole; content: string }> {
    let remaining = MAX_HISTORY_TOTAL_CHARS;
    const normalized: Array<{
      role: AiChatMessageRole;
      content: string;
    }> = [];

    // The repository query is newest-first; retain the most recent bounded turns.
    for (const message of messages.slice(0, MAX_HISTORY_ENTRIES)) {
      if (
        !Object.values(AiChatMessageRole).includes(
          message.role as AiChatMessageRole,
        ) ||
        typeof message.content !== 'string' ||
        !message.content
      ) {
        continue;
      }
      const content = message.content.slice(0, MAX_HISTORY_ENTRY_CHARS);
      const boundedContent = content.slice(0, remaining);
      if (!boundedContent) break;
      normalized.push({ role: message.role, content: boundedContent });
      remaining -= boundedContent.length;
    }

    return normalized.reverse();
  }
  private resolveLocale(
    explicitLocale?: string,
    acceptLanguage?: string,
  ): string {
    if (explicitLocale) return explicitLocale;
    const candidates = (acceptLanguage || '')
      .split(',')
      .map((value) => value.trim().split(';', 1)[0])
      .filter((value) => AI_LOCALE_PATTERN.test(value));
    return candidates[0] || DEFAULT_AI_LOCALE;
  }
  private failureCode(error: unknown): string {
    if (!(error instanceof HttpException)) return 'AI_PROVIDER_ERROR';
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) return code.slice(0, 64);
    }
    return `REQUEST_HTTP_${error.getStatus()}`;
  }
  private async loadJobs(ids?: string[]) {
    const jobs = ids?.length
      ? await Promise.all(ids.map((id) => this.jobsService.findOne(id)))
      : await this.jobsService.getAll();
    return Promise.all(
      jobs.slice(0, 20).map(async (job) => {
        const company = job.company?._id
          ? await this.companyRepo.findOne({
              where: { _id: job.company._id },
              withDeleted: true,
            })
          : null;
        if (!company) throw new NotFoundException('Company not found');
        return {
          id: job._id,
          title: job.name,
          description: job.description || null,
          skills: Array.isArray(job.skills)
            ? job.skills
                .filter((x): x is string => typeof x === 'string')
                .slice(0, 50)
            : [],
          location: job.location || null,
          level: job.level || null,
          salary: job.salary == null ? null : Number(job.salary),
          company: job.company
            ? { id: job.company._id, name: job.company.name }
            : null,
          jobSourceVersion: getJobSourceVersion(job, company),
        };
      }),
    );
  }
  private boundFilters(filters?: Record<string, unknown>) {
    if (!filters) return {};
    const aliases: Record<string, string> = {
      workMode: 'work_mode',
      employmentType: 'employment_type',
      experienceLevel: 'experience_level',
      minSalary: 'salary_min',
      maxSalary: 'salary_max',
    };
    return Object.fromEntries(
      Object.entries(filters)
        .slice(0, MAX_FILTER_KEYS)
        .filter(
          ([key, value]) =>
            key.length <= 80 &&
            (['string', 'number', 'boolean'].includes(typeof value) ||
              (key === 'skills' && Array.isArray(value))),
        )
        .map(([key, value]) => [
          aliases[key] || key,
          Array.isArray(value)
            ? value
                .filter((item): item is string => typeof item === 'string')
                .slice(0, 30)
                .map((item) => item.slice(0, 500))
            : typeof value === 'string'
            ? value.slice(0, 500)
            : value,
        ]),
    );
  }
  private boundResponse(
    response: CandidateAssistantResponse,
  ): CandidateAssistantResponse {
    if (
      !response ||
      !Array.isArray(response.blocks) ||
      !Array.isArray(response.citations)
    )
      throw new ConflictException('AI response was invalid');
    const provenance = generationMetadata(
      response.source,
      response.fallbackReason,
    );
    if (provenance === undefined)
      throw new ConflictException('AI response was invalid');
    const blocks = response.blocks
      .slice(0, MAX_BLOCKS)
      .filter((b): b is CandidateAssistantBlock =>
        Boolean(b && typeof b.type === 'string' && b.type.length <= 40),
      )
      .map((b) => ({
        type: b.type,
        text:
          typeof b.text === 'string'
            ? b.text.slice(0, MAX_BLOCK_TEXT)
            : undefined,
        data:
          b.data && typeof b.data === 'object'
            ? Object.fromEntries(Object.entries(b.data).slice(0, 20))
            : undefined,
      }));
    const citations = response.citations
      .slice(0, MAX_CITATIONS)
      .filter((c): c is CandidateAssistantCitation =>
        Boolean(
          c &&
            typeof c.sourceId === 'string' &&
            ['JOB', 'CV', 'APPLICATION'].includes(c.sourceType),
        ),
      )
      .map((c) => ({
        sourceId: c.sourceId.slice(0, 100),
        sourceType: c.sourceType,
        label: typeof c.label === 'string' ? c.label.slice(0, 160) : undefined,
      }));
    return {
      blocks,
      citations,
      filterState: this.boundFilters(response.filterState || undefined),
      ...provenance,
    };
  }
  private assistantText(response: CandidateAssistantResponse) {
    return (
      response.blocks
        .map((b) => b.text || '')
        .filter(Boolean)
        .join('\n')
        .slice(0, 12000) || null
    );
  }
  private async idempotentResult(message: AiChatMessage) {
    if (message.role === AiChatMessageRole.ASSISTANT)
      return { assistantMessage: message };
    const assistant = await this.messageRepo.findOne({
      where: {
        sessionId: message.sessionId,
        parentMessageId: message._id,
        role: AiChatMessageRole.ASSISTANT,
      },
    });
    return assistant
      ? { userMessage: message, assistantMessage: assistant }
      : { userMessage: message };
  }
}
