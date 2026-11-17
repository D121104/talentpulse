import { ConfigService } from '@nestjs/config';
import { CandidateAssistantConsentService } from 'src/candidate-assistant/candidate-assistant-consent.service';
import { UserCVsService } from 'src/usercvs/usercvs.service';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { resolve } from 'path';
import { request } from 'http';
import { AddressInfo } from 'net';
import { NestFactory } from '@nestjs/core';
import { CandidateAssistantController } from 'src/candidate-assistant/candidate-assistant.controller';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';
import { CandidateAssistantService } from 'src/candidate-assistant/candidate-assistant.service';
import { CandidateAssistantAiServiceClient } from 'src/candidate-assistant/candidate-assistant-ai.client';
import { Role } from 'src/decorator/customize';
import {
  AiChatMessageRole,
  AiChatSessionMode,
} from 'src/candidate-assistant/candidate-assistant.types';

jest.setTimeout(30_000);

type ServiceKeys = {
  privatePem: string;
  publicPem: string;
};

const ids = {
  message: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  session: '66666666-6666-4666-8666-666666666666',
  job: '77777777-7777-4777-8777-777777777777',
  company: '88888888-8888-4888-8888-888888888888',
};

function serviceKeys(): ServiceKeys {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

async function waitForUvicorn(
  child: ChildProcessWithoutNullStreams,
): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let output = '';
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`FastAPI loopback server did not start: ${output}`));
    }, 15_000);

    const finish = (error: Error | null, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolveUrl(url as string);
    };
    const onOutput = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) finish(null, `http://127.0.0.1:${match[1]}`);
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      finish(
        new Error(
          `FastAPI loopback server exited before startup (code=${code}, signal=${signal}): ${output}`,
        ),
      );
    });
  });
}

async function stopProcess(
  child: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolveStop();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill('SIGTERM');
  });
}

describe('NestJS -> FastAPI candidate assistant RAG loopback contract', () => {
  let fastApiProcess: ChildProcessWithoutNullStreams | undefined;
  let aiServiceUrl: string;
  let keys: ServiceKeys;

  beforeAll(async () => {
    keys = serviceKeys();
    const aiServiceDirectory = resolve(__dirname, '../../..', 'ai-service');
    const launcher = resolve(
      aiServiceDirectory,
      'tests',
      'rag_loopback_launcher.py',
    );
    fastApiProcess = spawn(
      'uv',
      ['run', '--project', aiServiceDirectory, 'python', launcher],
      {
        cwd: aiServiceDirectory,
        env: {
          ...process.env,
          AI_ENVIRONMENT: 'test',
          AI_AUTH_REQUIRED: 'true',
          AI_JWT_ALGORITHMS: '["RS256"]',
          AI_JWT_PUBLIC_KEY: keys.publicPem,
          AI_JWT_ISSUER: 'https://issuer.example',
          AI_JWT_AUDIENCE: 'talentpulse-ai',
          AI_JWT_SUBJECT: 'talentpulse-backend',
          AI_RAG_RETRIEVE_SCOPE: 'rag:retrieve',
          AI_RAG_GENERATE_SCOPE: 'rag:generate',
          AI_EMBEDDING_PROVIDER: 'deterministic',
          AI_VECTOR_STORE_PROVIDER: 'memory',
          AI_GENERATION_PROVIDER: 'deterministic',
          AI_COHERE_DIMENSIONS: '32',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    aiServiceUrl = await waitForUvicorn(fastApiProcess);
  });

  afterAll(async () => {
    await stopProcess(fastApiProcess);
  });

  function deferred<T>() {
    let resolveValue!: (value: T) => void;
    const promise = new Promise<T>((resolve) => (resolveValue = resolve));
    return { promise, resolve: resolveValue };
  }

  function lifecycleFixture() {
    const aiServiceClient = new AiServiceClient(
      new ConfigService({
        AI_SERVICE_URL: aiServiceUrl,
        AI_SERVICE_TIMEOUT_MS: '5000',
        AI_SERVICE_ISSUER: 'https://issuer.example',
        AI_SERVICE_AUDIENCE: 'talentpulse-ai',
        AI_SERVICE_JWT_ALGORITHM: 'RS256',
        AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
        AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
        AI_RAG_RETRIEVE_SCOPE: 'rag:retrieve',
        AI_RAG_GENERATE_SCOPE: 'rag:generate',
      }),
    );
    const client = new CandidateAssistantAiServiceClient(aiServiceClient);
    const messages: Array<Record<string, any>> = [];
    const messageRepo = {
      findOne: jest.fn(async ({ where }) =>
        messages.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ),
      ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const row = {
          ...value,
          _id: value._id || `turn-${messages.length + 1}`,
        };
        const index = messages.findIndex((item) => item._id === row._id);
        if (index < 0) messages.push(row);
        else messages[index] = row;
        return { ...row };
      }),
      find: jest.fn(async () => messages.map((row) => ({ ...row }))),
    };
    const reservation: {
      id: string;
      userId: string;
      quotaDate: string;
      reservationKey: string;
      reused: boolean;
      executionOwner?: string;
    } = {
      id: 'loopback-reservation',
      userId: ids.user,
      quotaDate: '2026-11-17',
      reservationKey: `${ids.session}:${ids.message}`,
      reused: false,
    };
    const lease = {
      reservation,
      owner: 'instance-a',
      expiresAt: new Date(Date.now() + 1000),
      graceMs: 500,
      sessionId: ids.session,
      userMessageId: 'turn-1',
      assistantMessageId: 'turn-2',
    };
    let terminal = false;
    const quota = {
      reserve: jest.fn().mockResolvedValue(reservation),
      commit: jest.fn(async (activeReservation) =>
        terminal || activeReservation.executionOwner !== lease.owner
          ? false
          : undefined,
      ),
      release: jest.fn(async (_reservation, _errorCode, assistantUpdates) => {
        if (terminal) return false;
        terminal = true;
        if (assistantUpdates) {
          const index = messages.findIndex(
            (row) => row._id === assistantUpdates._id,
          );
          if (index !== -1)
            messages[index] = { ...messages[index], ...assistantUpdates };
        }
        return true;
      }),
      acquireLease: jest.fn().mockResolvedValue(lease),
      renewLease: jest.fn(async () => {
        if (terminal) return false;
        lease.expiresAt = new Date(Date.now() + 1000);
        return true;
      }),
      findExpiredLeases: jest.fn(async () => [lease]),
      // Shared persistence boundary: no await between compare and swap. Both
      // service instances see the same winner; PostgreSQL CAS is tested elsewhere.
      terminalizeLease: jest.fn(async (_lease, now: Date) => {
        if (
          terminal ||
          now.getTime() <= lease.expiresAt.getTime() + lease.graceMs
        )
          return false;
        terminal = true;
        lease.reservation.executionOwner = 'recovery-owner';
        return true;
      }),
    };
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        _id: ids.session,
        userId: ids.user,
        mode: AiChatSessionMode.ADVICE,
        archivedAt: null,
      }),
      save: jest.fn(async (value) => value),
    };
    const makeService = () =>
      new CandidateAssistantService(
        sessionRepo as any,
        messageRepo as any,
        { hasValidConsent: jest.fn().mockResolvedValue(true) } as any,
        quota as any,
        { getAll: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        {} as any,
        client,
      );
    const service = makeService();
    const user = {
      _id: ids.user,
      role: Role.USER,
      email: 'candidate@example.test',
    };
    const dto = {
      content: 'Synthetic career advice',
      clientMessageId: ids.message,
    };
    // T033 contract: signal is optional and does not change legacy callers.
    const send = (signal?: AbortSignal) =>
      (
        service.sendMessage as unknown as (
          ...args: [string, typeof dto, typeof user, undefined, AbortSignal?]
        ) => Promise<unknown>
      )(ids.session, dto, user, undefined, signal);
    const reconcile = (instance: CandidateAssistantService, now: Date) =>
      (
        instance as unknown as {
          reconcileInterruptedRequests(now: Date): Promise<unknown>;
        }
      ).reconcileInterruptedRequests(now);
    const received = deferred<void>();
    const finish = deferred<void>();
    const generate = aiServiceClient.generateRag.bind(aiServiceClient);
    const generation = jest
      .spyOn(aiServiceClient, 'generateRag')
      .mockImplementation(async (...args) => {
        const response = await generate(...args);
        received.resolve();
        // A provider may finish even after abort. Hold a real validated loopback
        // response at the adapter boundary to exercise the persistence guard.
        await finish.promise;
        return response;
      });
    const dispatched = jest.spyOn(client, 'generate');
    const assertFailed = () => {
      expect(messages).toHaveLength(2);
      expect(
        messages.find((row) => row.role === AiChatMessageRole.USER),
      ).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          clientMessageId: ids.message,
        }),
      );
      expect(
        messages.find((row) => row.role === AiChatMessageRole.ASSISTANT),
      ).toEqual(
        expect.objectContaining({
          status: 'FAILED',
          content: null,
          blocks: null,
          citations: null,
          parentMessageId: 'turn-1',
        }),
      );
      expect(quota.release).toHaveBeenCalledTimes(1);
      expect(quota.commit).not.toHaveBeenCalled();
      expect(generation).toHaveBeenCalledTimes(1);
    };
    return {
      service,
      makeService,
      send,
      reconcile,
      user,
      dto,
      messages,
      messageRepo,
      quota,
      lease,
      received,
      finish,
      dispatched,
      assertFailed,
    };
  }

  it('cancellation discards a late real FastAPI result without committing or replaying', async () => {
    const f = lifecycleFixture();
    const cancellation = new AbortController();
    const pending = f.send(cancellation.signal).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await f.received.promise;
      cancellation.abort();
      f.finish.resolve();
      const outcome = await pending;
      expect(outcome).toHaveProperty('error');
      f.assertFailed();
      expect(f.dispatched.mock.calls[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: cancellation.signal }),
        ]),
      );
    } finally {
      f.finish.resolve();
      await pending;
    }
  });

  it('HTTP disconnect terminalizes the accepted turn and ignores completion after socket close', async () => {
    const f = lifecycleFixture();
    const authentication = jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockImplementation((context) => {
        context.switchToHttp().getRequest().user = f.user;
        return true;
      });
    const authorization = jest
      .spyOn(RolesGuard.prototype, 'canActivate')
      .mockReturnValue(true);
    const app = await NestFactory.create(
      {
        module: class LoopbackModule {},
        controllers: [CandidateAssistantController],
        providers: [
          { provide: CandidateAssistantService, useValue: f.service },
        ],
      },
      { logger: false },
    );
    const serverClosed = deferred<void>();
    app.use((_req, res, next) => {
      res.once('close', () => serverClosed.resolve());
      next();
    });
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const send = jest.spyOn(f.service, 'sendMessage');
    const socket = request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: `/ai/candidate-assistant/sessions/${ids.session}/messages`,
      headers: { 'content-type': 'application/json' },
    });
    socket.on('error', () => undefined); // ECONNRESET is the intended client action.
    const prematureResponse = new Promise<never>((_resolve, reject) => {
      socket.once('response', (response) => {
        response.resume();
        reject(
          new Error(
            `HTTP turn completed before generation gate: ${response.statusCode}`,
          ),
        );
      });
    });
    const closed = new Promise<void>((resolveClose) =>
      socket.once('close', resolveClose),
    );
    try {
      socket.end(JSON.stringify(f.dto));
      await Promise.race([f.received.promise, prematureResponse]);
      socket.destroy();
      await closed;
      await serverClosed.promise;
      f.finish.resolve();
      await Promise.allSettled(send.mock.results.map((result) => result.value));
      f.assertFailed();
      const signal = (send.mock.calls[0] as unknown[])[4] as AbortSignal;
      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(true);
    } finally {
      socket.destroy();
      f.finish.resolve();
      await app.close();
      authentication.mockRestore();
      authorization.mockRestore();
    }
  });

  it.each(['unexpired', 'within grace'])(
    'two recovery instances leave an %s lease untouched',
    async (phase) => {
      const f = lifecycleFixture();
      const now = new Date(
        f.lease.expiresAt.getTime() + (phase === 'unexpired' ? -1 : 499),
      );
      await Promise.all([
        f.reconcile(f.service, now),
        f.reconcile(f.makeService(), now),
      ]);
      expect(f.quota.terminalizeLease).not.toHaveBeenCalled();
      expect(f.quota.release).not.toHaveBeenCalled();
      expect(f.messageRepo.save).not.toHaveBeenCalled();
      expect(f.dispatched).not.toHaveBeenCalled();
    },
  );

  it('competing recovery instances atomically fail an expired turn once and reject its late result', async () => {
    const f = lifecycleFixture();
    const pending = f.send().catch((error: unknown) => error);
    try {
      await f.received.promise;
      const now = new Date(f.lease.expiresAt.getTime() + f.lease.graceMs + 1);
      await Promise.all([
        f.reconcile(f.makeService(), now),
        f.reconcile(f.makeService(), now),
      ]);
      f.assertFailed();
      const before = JSON.stringify(f.messages);
      f.finish.resolve();
      await pending;
      await f.reconcile(f.makeService(), now);
      expect(JSON.stringify(f.messages)).toBe(before);
      f.assertFailed();
      const transitions = await Promise.all(
        f.quota.terminalizeLease.mock.results.map((result) => result.value),
      );
      expect(transitions.filter(Boolean)).toHaveLength(1);
    } finally {
      f.finish.resolve();
      await pending;
    }
  });

  it('active execution renews its shared lease so another instance cannot recover it', async () => {
    const f = lifecycleFixture();
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
    });
    const pending = f.send().catch((error: unknown) => error);
    try {
      await f.received.promise;
      const originalExpiry = f.lease.expiresAt.getTime();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(f.quota.renewLease).toHaveBeenCalled();
      expect(f.lease.expiresAt.getTime()).toBeGreaterThan(originalExpiry);
      await f.reconcile(f.makeService(), new Date(originalExpiry + 501));
      expect(f.quota.release).not.toHaveBeenCalled();
      expect(f.quota.terminalizeLease).not.toHaveBeenCalled();
      f.finish.resolve();
      await pending;
      expect(f.quota.commit).toHaveBeenCalledTimes(1);
      expect(f.messages.map((row) => row.status)).toEqual([
        'COMPLETED',
        'COMPLETED',
      ]);
    } finally {
      jest.useRealTimers();
      f.finish.resolve();
      await pending;
    }
  });

  it.each([
    'authorized advice',
    'unauthorized session owner',
    'unauthorized CV owner',
    'revoked consent',
    'stale consent version',
    'non-CV session isolation',
  ])(
    '%s: enforces CV boundaries before history and AI dispatch',
    async (scenario) => {
      const aiServiceClient = new AiServiceClient(
        new ConfigService({
          AI_SERVICE_URL: aiServiceUrl,
          AI_SERVICE_TIMEOUT_MS: '5000',
          AI_SERVICE_ISSUER: 'https://issuer.example',
          AI_SERVICE_AUDIENCE: 'talentpulse-ai',
          AI_SERVICE_JWT_ALGORITHM: 'RS256',
          AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
          AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
          AI_RAG_RETRIEVE_SCOPE: 'rag:retrieve',
          AI_RAG_GENERATE_SCOPE: 'rag:generate',
        }),
      );
      const candidateClient = new CandidateAssistantAiServiceClient(
        aiServiceClient,
      );
      const session = {
        _id: ids.session,
        userId: ids.user,
        mode: AiChatSessionMode.ADVICE,
        archivedAt: null,
      };
      const cvMode = ![
        'authorized advice',
        'non-CV session isolation',
      ].includes(scenario);
      if (cvMode) session.mode = AiChatSessionMode.CV_ANALYSIS;
      const cvSessionId = '99999999-9999-4999-8999-999999999999';
      const cvId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const privateHistory = 'Synthetic private CV history must stay isolated';
      const persistedMessages: Array<Record<string, any>> =
        scenario === 'non-CV session isolation'
          ? [
              {
                _id: 'private-history',
                sessionId: cvSessionId,
                role: AiChatMessageRole.ASSISTANT,
                content: privateHistory,
              },
            ]
          : [];
      const sessionRepo = {
        findOne: jest.fn().mockResolvedValue(session),
        save: jest.fn(async (value) => value),
      };
      const messageRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => {
          const message = {
            ...value,
            _id: value._id || `message-${persistedMessages.length + 1}`,
          };
          const index = persistedMessages.findIndex(
            (item) => item._id === message._id,
          );
          if (index === -1) persistedMessages.push(message);
          else persistedMessages[index] = message;
          return message;
        }),
        find: jest.fn(async ({ where }) =>
          persistedMessages.filter(
            (message) => message.sessionId === where.sessionId,
          ),
        ),
      };
      const quotaService = {
        reserve: jest
          .fn()
          .mockResolvedValue({ id: 'reservation-1', reused: false }),
        commit: jest.fn(),
        release: jest.fn(),
        acquireLease: jest
          .fn()
          .mockImplementation((reservation, owner, context) => ({
            reservation,
            owner,
            expiresAt: new Date(Date.now() + 30_000),
            graceMs: 5_000,
            ...context,
          })),
        renewLease: jest.fn().mockResolvedValue(true),
      };
      const consentRepo = { findOne: jest.fn() };
      const consentService = new CandidateAssistantConsentService(
        consentRepo as any,
        {} as any,
        new ConfigService({}),
        {} as any,
      );
      const policy = consentService.getActivePolicy();
      consentRepo.findOne.mockResolvedValue({
        consentVersion:
          scenario === 'stale consent version'
            ? `${policy.consentVersion}-old`
            : policy.consentVersion,
        policyHash: policy.policyHash,
        grantedAt: new Date('2026-01-01T00:00:00Z'),
        revokedAt:
          scenario === 'revoked consent'
            ? new Date('2026-01-02T00:00:00Z')
            : null,
      });
      const cvRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const snapshotService = new UserCVsService(
        cvRepo as any,
        {} as any,
        {} as any,
        {} as any,
      );
      jest.spyOn(snapshotService, 'createCandidateAssistantSnapshot');
      if (scenario === 'unauthorized session owner') {
        sessionRepo.findOne.mockResolvedValue(null);
      }
      const assistantService = new CandidateAssistantService(
        sessionRepo as any,
        messageRepo as any,
        consentService as any,
        quotaService as any,
        {
          findOne: jest.fn().mockResolvedValue({
            _id: ids.job,
            name: 'Backend Engineer',
            description: 'Build reliable backend services.',
            skills: ['Python', 'PostgreSQL'],
            location: 'Hanoi',
            level: 'senior',
            salary: 3000,
            company: { _id: ids.company, name: 'Synthetic Systems' },
          }),
        } as any,
        {
          findOne: jest.fn().mockResolvedValue({
            _id: ids.company,
            name: 'Synthetic Systems',
            updatedAt: new Date('2025-01-01T00:00:00Z'),
          }),
        } as any,
        snapshotService as any,
        candidateClient,
      );
      const retrieveRag = jest.spyOn(aiServiceClient, 'retrieveRag');
      const generateRag = jest.spyOn(aiServiceClient, 'generateRag');

      const pending = assistantService.sendMessage(
        ids.session,
        {
          content: 'Find advice for a senior Python backend role in Hanoi.',
          clientMessageId: ids.message,
          jobIds: [ids.job],
          filters: {},
          ...(cvMode ? { cvId, cvSource: 'upload' as const } : {}),
        },
        {
          _id: ids.user,
          role: Role.USER,
          email: 'candidate@example.test',
        } as any,
      );

      if (cvMode) {
        const status = ['revoked consent', 'stale consent version'].includes(
          scenario,
        )
          ? 403
          : 404;
        await expect(pending).rejects.toMatchObject({ status });
        expect(messageRepo.find).not.toHaveBeenCalled();
        expect(retrieveRag).not.toHaveBeenCalled();
        expect(generateRag).not.toHaveBeenCalled();
        expect(quotaService.commit).not.toHaveBeenCalled();
        if (
          [
            'unauthorized session owner',
            'revoked consent',
            'stale consent version',
          ].includes(scenario)
        ) {
          expect(messageRepo.findOne).not.toHaveBeenCalled();
          expect(
            snapshotService.createCandidateAssistantSnapshot,
          ).not.toHaveBeenCalled();
          expect(quotaService.reserve).not.toHaveBeenCalled();
        } else {
          expect(
            snapshotService.createCandidateAssistantSnapshot,
          ).toHaveBeenCalledWith(
            ids.user,
            cvId,
            'upload',
            'candidate@example.test',
          );
          expect(quotaService.release).toHaveBeenCalled();
          expect(cvRepo.findOne).toHaveBeenCalledWith({
            where: expect.objectContaining({
              _id: cvId,
              userId: ids.user,
              isDeleted: false,
            }),
          });
        }
        expect(sessionRepo.findOne).toHaveBeenCalledWith({
          where: { _id: ids.session, userId: ids.user },
        });
        return;
      }
      const response = await pending;
      expect(
        snapshotService.createCandidateAssistantSnapshot,
      ).not.toHaveBeenCalled();
      expect(messageRepo.find).toHaveBeenCalledWith({
        where: { sessionId: ids.session },
        order: { createdAt: 'DESC' },
        take: 12,
      });
      for (const call of [
        ...retrieveRag.mock.calls,
        ...generateRag.mock.calls,
      ]) {
        expect(JSON.stringify(call)).not.toContain(privateHistory);
        expect(JSON.stringify(call)).not.toContain(cvSessionId);
        expect(JSON.stringify(call)).not.toContain(cvId);
      }

      expect(retrieveRag).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.objectContaining({
            user_id: ids.user,
            session_id: ids.session,
            client_message_id: ids.message,
          }),
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(retrieveRag.mock.results[0]?.value).toBeDefined();
      const retrieval = await retrieveRag.mock.results[0].value;
      expect(retrieval).toEqual(
        expect.objectContaining({
          job_ids: [ids.job],
          results: [
            expect.objectContaining({
              job_id: ids.job,
              rank: 1,
              score: 0.93,
            }),
          ],
        }),
      );

      const generated = await generateRag.mock.results[0].value;
      expect(generated).toEqual(
        expect.objectContaining({
          client_message_id: ids.message,
          answer_status: 'DEGRADED',
          citation_keys: [],
          referenced_job_ids: [],
          degraded: true,
        }),
      );
      expect(generateRag).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'ADVICE',
          authorized_cv_snapshot: null,
          consent_version: null,
          canonical_active_job_context: [
            {
              job_id: ids.job,
              title: 'Backend Engineer',
              company_name: 'Synthetic Systems',
              location: 'Hanoi',
              level: 'senior',
              salary: { amount: 3000, currency: 'VND' },
              skills: ['Python', 'PostgreSQL'],
              start_date: null,
              end_date: null,
            },
          ],
          retrieval_evidence: [
            {
              job_id: ids.job,
              rank: 1,
              score: 0.93,
              citation_key: `job:${ids.job}`,
            },
          ],
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      expect(response.assistantMessage.blocks?.length).toBeGreaterThan(0);
      expect(response.assistantMessage.blocks?.[0]).toEqual(
        expect.objectContaining({ type: 'ADVICE', text: expect.any(String) }),
      );
      expect(response.assistantMessage.citations).toEqual([]);
      const currentMessages = persistedMessages.filter(
        (message) => message.sessionId === ids.session,
      );
      expect(currentMessages).toHaveLength(2);
      expect(currentMessages[0]).toEqual(
        expect.objectContaining({
          role: AiChatMessageRole.USER,
          status: 'COMPLETED',
          clientMessageId: ids.message,
        }),
      );
      expect(currentMessages[1]).toEqual(
        expect.objectContaining({
          role: AiChatMessageRole.ASSISTANT,
          status: 'COMPLETED',
          parentMessageId: currentMessages[0]._id,
          blocks: response.assistantMessage.blocks,
          citations: response.assistantMessage.citations,
        }),
      );
      expect(quotaService.reserve).toHaveBeenCalledWith(
        ids.user,
        `${ids.session}:${ids.message}`,
      );
      expect(quotaService.commit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'reservation-1', reused: false }),
        currentMessages[1]._id,
        expect.objectContaining({ status: 'COMPLETED' }),
      );
      expect(quotaService.release).not.toHaveBeenCalled();
    },
  );
});
