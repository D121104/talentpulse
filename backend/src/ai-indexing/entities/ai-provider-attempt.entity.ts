import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiProviderAttemptStatus {
  STARTED = 'STARTED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Minimal provider-attempt audit record.
 *
 * Deliberately excludes prompts, CV/JD content and raw provider responses.
 * `UNKNOWN` represents an ambiguous transport outcome where a request may
 * have reached the provider and therefore must not be blindly replayed.
 */
@Entity('ai_provider_attempts')
@Index('IDX_ai_provider_attempts_request', ['requestId', 'createdAt'])
@Index('IDX_ai_provider_attempts_trace', ['traceId'])
@Index('IDX_ai_provider_attempts_status_created', ['status', 'createdAt'])
@Index('IDX_ai_provider_attempts_outbox', ['outboxId', 'createdAt'], {
  where: '"outbox_id" IS NOT NULL',
})
@Index('IDX_ai_provider_attempts_job', ['jobId', 'createdAt'], {
  where: '"job_id" IS NOT NULL',
})
export class AiProviderAttempt {
  @PrimaryGeneratedColumn('uuid', { name: 'provider_attempt_id' })
  providerAttemptId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'trace_id', type: 'uuid' })
  traceId: string;

  @Column({ name: 'operation_attempt_id', type: 'uuid', nullable: true })
  operationAttemptId: string | null;

  @Column({ name: 'outbox_id', type: 'uuid', nullable: true })
  outboxId: string | null;

  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber: number;

  @Column({ name: 'provider', type: 'varchar', length: 80 })
  provider: string;

  @Column({ name: 'model', type: 'varchar', length: 256 })
  model: string;

  /** False means the call was never handed to the external provider. */
  @Column({ name: 'request_sent', type: 'boolean', default: false })
  requestSent: boolean;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    enum: AiProviderAttemptStatus,
    default: AiProviderAttemptStatus.STARTED,
  })
  status: AiProviderAttemptStatus;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'total_tokens', type: 'integer', nullable: true })
  totalTokens: number | null;

  /** Numeric is represented as a string by node-postgres to preserve precision. */
  @Column({
    name: 'estimated_cost',
    type: 'numeric',
    precision: 18,
    scale: 8,
    nullable: true,
  })
  estimatedCost: string | null;

  /** Stable provider/application error code only; never raw response content. */
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
