import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { JobsService } from 'src/jobs/jobs.service';
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
  AiChatMessageRole,
  AiChatMessageStatus,
  AiChatSessionMode,
  CandidateAssistantAiClient,
  CandidateAssistantBlock,
  CandidateAssistantCitation,
  CandidateAssistantResponse,
  CANDIDATE_ASSISTANT_AI_CLIENT,
} from './candidate-assistant.types';
import { mapCandidateAssistantProviderError } from './candidate-assistant.errors';

const MAX_BLOCKS = 24;
const MAX_CITATIONS = 32;
const MAX_BLOCK_TEXT = 4000;
const MAX_FILTER_KEYS = 24;
@Injectable()
export class CandidateAssistantService {
  constructor(
    @InjectRepository(AiChatSession)
    private readonly sessionRepo: Repository<AiChatSession>,
    @InjectRepository(AiChatMessage)
    private readonly messageRepo: Repository<AiChatMessage>,
    private readonly consentService: CandidateAssistantConsentService,
    private readonly quotaService: CandidateAssistantQuotaService,
    private readonly jobsService: JobsService,
    private readonly userCVsService: UserCVsService,
    @Inject(CANDIDATE_ASSISTANT_AI_CLIENT)
    private readonly aiClient: CandidateAssistantAiClient,
  ) {}

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

  async sendMessage(id: string, dto: SendAiChatMessageDto, user: IUser) {
    const session = await this.getOwnedSession(id, user);
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
    if (existing) return this.idempotentResult(existing);
    const reservation = await this.quotaService.reserve(
      user._id,
      `${session._id}:${dto.clientMessageId}`,
    );
    let userMessage: AiChatMessage;
    try {
      userMessage = await this.messageRepo.save(
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
      );
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
      const jobs = await this.loadJobs(dto.jobIds);
      const cv = dto.cvId
        ? await this.userCVsService.createCandidateAssistantSnapshot(
            user._id,
            dto.cvId,
          )
        : undefined;
      const history = await this.messageRepo.find({
        where: { sessionId: id },
        order: { createdAt: 'DESC' },
        take: 12,
      });
      const response = this.boundResponse(
        await this.aiClient.generate({
          requestId: randomUUID(),
          traceId: randomUUID(),
          operationAttemptId: randomUUID(),
          clientMessageId: isUUID(dto.clientMessageId)
            ? dto.clientMessageId
            : randomUUID(),
          userId: user._id,
          sessionId: session._id,
          mode: session.mode,
          message: userMessage.content,
          history: history
            .reverse()
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content })),
          jobs,
          cv,
          filters: this.boundFilters(dto.filters),
          consentVersion: dto.cvId
            ? this.consentService.getActivePolicy().consentVersion
            : undefined,
        }),
      );
      const assistant = await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: id,
          parentMessageId: userMessage._id,
          role: AiChatMessageRole.ASSISTANT,
          status: AiChatMessageStatus.COMPLETED,
          content: this.assistantText(response),
          clientMessageId: null,
          blocks: response.blocks,
          citations: response.citations,
          filterState: response.filterState || null,
        }),
      );
      await this.quotaService.commit(reservation, assistant._id);
      session.updatedAt = new Date();
      await this.sessionRepo.save(session);
      return { userMessage, assistantMessage: assistant };
    } catch (error) {
      await this.quotaService.release(
        reservation,
        error instanceof Error ? error.name.slice(0, 64) : 'AI_REQUEST_FAILED',
      );
      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: id,
          parentMessageId: userMessage._id,
          role: AiChatMessageRole.ASSISTANT,
          status: AiChatMessageStatus.FAILED,
          content: null,
          clientMessageId: null,
          blocks: null,
          citations: null,
          filterState: null,
          errorCode: 'AI_PROVIDER_ERROR',
        }),
      );
      if (error instanceof HttpException) throw error;
      throw mapCandidateAssistantProviderError(error);
    }
  }
  private async loadJobs(ids?: string[]) {
    const jobs = ids?.length
      ? await Promise.all(ids.map((id) => this.jobsService.findOne(id)))
      : await this.jobsService.getAll();
    return jobs.slice(0, 20).map((job) => ({
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
    }));
  }
  private boundFilters(filters?: Record<string, unknown>) {
    if (!filters) return {};
    return Object.fromEntries(
      Object.entries(filters)
        .slice(0, MAX_FILTER_KEYS)
        .filter(
          ([key, value]) =>
            key.length <= 80 &&
            ['string', 'number', 'boolean'].includes(typeof value),
        )
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value.slice(0, 500) : value,
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
