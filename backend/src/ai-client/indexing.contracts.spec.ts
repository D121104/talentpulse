import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';
import {
  assertIndexJobDeleteResponse,
  assertIndexJobUpsertRequest,
  assertIndexJobUpsertResponse,
  serializeIndexJobUpsertRequest,
} from './contracts/indexing.contracts';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';

function backendJobProjection() {
  return {
    _id: JOB_ID,
    name: 'Backend Engineer',
    description: null,
    skills: ['TypeScript', 'NestJS'],
    companyId: COMPANY_ID,
    companyName: 'Acme Labs',
    location: 'Ha Noi',
    level: 'MID',
    workMode: 'REMOTE',
    employmentType: 'FULL_TIME',
    salary: 30_000_000,
    salaryCurrency: 'VND',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: '2026-09-30T00:00:00+07:00',
    updatedAt: '2026-08-27T11:00:00Z',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    companyIsActive: true,
    companyIsDeleted: false,
    companyDeletedAt: null,
  };
}

describe('indexing contracts', () => {
  it('serializes the accepted backend projection to the FastAPI snake_case shape', () => {
    const serialized = serializeIndexJobUpsertRequest({
      job: backendJobProjection(),
      idempotency_key: 'outbox-event-1',
      source_version: 7,
    });

    expect(JSON.parse(JSON.stringify(serialized))).toEqual({
      job: {
        job_id: JOB_ID,
        title: 'Backend Engineer',
        description: '',
        skills: ['TypeScript', 'NestJS'],
        company_id: COMPANY_ID,
        company_name: 'Acme Labs',
        location: 'Ha Noi',
        level: 'MID',
        work_mode: 'REMOTE',
        employment_type: 'FULL_TIME',
        salary: 30_000_000,
        salary_currency: 'VND',
        start_date: '2026-08-01T00:00:00.000Z',
        end_date: '2026-09-29T17:00:00.000Z',
        updated_at: '2026-08-27T11:00:00.000Z',
        is_active: true,
        is_deleted: false,
        deleted_at: null,
        company_is_active: true,
        company_is_deleted: false,
        company_deleted_at: null,
      },
      idempotency_key: 'outbox-event-1',
      source_version: 7,
    });
  });

  it('rejects blank required text and idempotency keys', () => {
    expect(() =>
      assertIndexJobUpsertRequest({
        job: { ...backendJobProjection(), name: '   ' },
        idempotency_key: 'event-1',
        source_version: 1,
      }),
    ).toThrow(AiServiceError);

    expect(() =>
      assertIndexJobUpsertRequest({
        job: backendJobProjection(),
        idempotency_key: '   ',
        source_version: 1,
      }),
    ).toThrow(AiServiceError);
  });

  it('maps blank optional text to null like the current Pydantic contract', () => {
    const validated = assertIndexJobUpsertRequest({
      job: {
        ...backendJobProjection(),
        location: '   ',
        level: '',
        workMode: '\t',
        employmentType: '  ',
        salaryCurrency: ' ',
      },
      idempotency_key: 'event-1',
      source_version: 1,
    });

    expect(validated.job).toMatchObject({
      location: null,
      level: null,
      work_mode: null,
      employment_type: null,
      salary_currency: null,
    });
  });

  it('accepts the current response without a trace_id field', () => {
    expect(
      assertIndexJobUpsertResponse({
        request_id: JOB_ID,
        job_id: JOB_ID,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: 1,
        chunk_count: 1,
        embedded: true,
      }),
    ).toMatchObject({
      request_id: JOB_ID,
      point_ids: [],
      deleted_point_ids: [],
    });
  });

  it('validates operation-specific responses and preserves invalid-output errors', () => {
    expect(() =>
      assertIndexJobDeleteResponse({
        request_id: JOB_ID,
        job_id: JOB_ID,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: 1,
        chunk_count: 1,
        embedded: true,
      }),
    ).toThrow(AiServiceError);

    try {
      assertIndexJobDeleteResponse({
        request_id: JOB_ID,
        job_id: JOB_ID,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: 1,
        chunk_count: 1,
        embedded: true,
      });
    } catch (error) {
      expect((error as AiServiceError).code).toBe(
        AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
      );
    }
  });
});
