import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiIndexAggregateType {
  JOB = 'JOB',
  COMPANY = 'COMPANY',
}

export enum AiIndexOutboxOperation {
  UPSERT = 'UPSERT',
  DELETE = 'DELETE',
  REINDEX_COMPANY = 'REINDEX_COMPANY',
}

export enum AiIndexOutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
  CANCELLED = 'CANCELLED',
}

/**
 * Durable command for the future indexing dispatcher.
 *
 * The outbox intentionally contains only identity, version and delivery
 * metadata. The dispatcher must hydrate the canonical job/company projection
 * from PostgreSQL instead of persisting a copy of searchable content here.
 */
@Entity('ai_index_outbox')
@Index(
  'UQ_ai_index_outbox_aggregate_version',
  ['aggregateType', 'aggregateId', 'sourceVersion'],
  { unique: true },
)
@Index('IDX_ai_index_outbox_dispatch', ['status', 'nextRetryAt', 'createdAt'], {
  where: "\"status\" IN ('PENDING', 'FAILED')",
})
@Index('IDX_ai_index_outbox_lease', ['leaseExpiresAt'], {
  where: '"status" = \'PROCESSING\'',
})
@Index(
  'IDX_ai_index_outbox_publish',
  ['status', 'nextRetryAt', 'publishNextRetryAt', 'createdAt'],
  { where: '"status" = \'PENDING\' AND "published_at" IS NULL' },
)
@Index('IDX_ai_index_outbox_publish_lease', ['publishLeaseExpiresAt'], {
  where: '"status" = \'PENDING\' AND "published_at" IS NULL',
})
export class AiIndexOutbox {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({
    name: 'aggregate_type',
    type: 'varchar',
    length: 24,
    enum: AiIndexAggregateType,
  })
  aggregateType: AiIndexAggregateType;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  /** PostgreSQL bigint is returned as a string by node-postgres. */
  @Column({
    name: 'source_version',
    type: 'bigint',
    default: () => "nextval('ai_index_source_version_seq'::regclass)",
  })
  sourceVersion: string;

  @Column({
    name: 'operation',
    type: 'varchar',
    length: 32,
    enum: AiIndexOutboxOperation,
  })
  operation: AiIndexOutboxOperation;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    enum: AiIndexOutboxStatus,
    default: AiIndexOutboxStatus.PENDING,
  })
  status: AiIndexOutboxStatus;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 10 })
  maxAttempts: number;

  @Column({
    name: 'next_retry_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextRetryAt: Date;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'leased_at', type: 'timestamptz', nullable: true })
  leasedAt: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ name: 'lease_owner', type: 'varchar', length: 128, nullable: true })
  leaseOwner: string | null;

  /** Stable, bounded error metadata only; never provider payloads. */
  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  lastErrorCode: string | null;

  @Column({
    name: 'last_error_message',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  lastErrorMessage: string | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  /** Delivery metadata for initial SQS publication, separate from AI dispatch. */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'publish_attempts', type: 'integer', default: 0 })
  publishAttempts: number;

  @Column({
    name: 'publish_next_retry_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  publishNextRetryAt: Date;

  @Column({ name: 'publish_leased_at', type: 'timestamptz', nullable: true })
  publishLeasedAt: Date | null;

  @Column({
    name: 'publish_lease_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  publishLeaseExpiresAt: Date | null;

  @Column({
    name: 'publish_lease_owner',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  publishLeaseOwner: string | null;

  @Column({
    name: 'last_publish_error_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  lastPublishErrorCode: string | null;

  @Column({
    name: 'last_publish_error_message',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  lastPublishErrorMessage: string | null;

  @Column({
    name: 'last_publish_error_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastPublishErrorAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
