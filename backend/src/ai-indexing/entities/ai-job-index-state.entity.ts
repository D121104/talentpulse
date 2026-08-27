import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiJobIndexStateStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  INDEXED = 'INDEXED',
  DELETED = 'DELETED',
  FAILED = 'FAILED',
  STALE = 'STALE',
}

/**
 * The PostgreSQL projection of one job's derived-index lifecycle.
 *
 * Assumption: this table keeps one mutable current-state row per
 * (job_id, environment). Collection/model versions are metadata on that row;
 * a collection transition replaces the current point set only after stale
 * points are removed. This prevents local, staging and production index state
 * from sharing a row when they use the same PostgreSQL database.
 *
 * Qdrant remains rebuildable from canonical jobs. This row stores hashes,
 * versions and stable point IDs needed to decide whether an embedding can be
 * reused and to remove stale points during a chunk-mode transition.
 */
@Entity('ai_job_index_state')
@Index('UQ_ai_job_index_state_job_environment', ['jobId', 'environment'], {
  unique: true,
})
@Index('IDX_ai_job_index_state_environment_status_retry', [
  'environment',
  'status',
  'nextRetryAt',
])
@Index('IDX_ai_job_index_state_environment_collection_model', [
  'environment',
  'collectionName',
  'embeddingModelVersion',
])
@Index('IDX_ai_job_index_state_lease', ['leaseExpiresAt'], {
  where: `"status" = 'PROCESSING'`,
})
export class AiJobIndexState {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  /** Deployment/indexing dimension; not a business lifecycle state. */
  @Column({ name: 'environment', type: 'varchar', length: 32 })
  environment: string;

  /** PostgreSQL bigint is returned as a string by node-postgres. */
  @Column({ name: 'source_version', type: 'bigint', default: 0 })
  sourceVersion: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    enum: AiJobIndexStateStatus,
    default: AiJobIndexStateStatus.PENDING,
  })
  status: AiJobIndexStateStatus;

  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({
    name: 'metadata_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  metadataHash: string | null;

  @Column({
    name: 'embedding_provider',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  embeddingProvider: string | null;

  @Column({
    name: 'embedding_model_version',
    type: 'varchar',
    length: 256,
    nullable: true,
  })
  embeddingModelVersion: string | null;

  @Column({ name: 'embedding_dimensions', type: 'integer', nullable: true })
  embeddingDimensions: number | null;

  @Column({
    name: 'collection_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  collectionName: string | null;

  @Column({
    name: 'collection_version',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  collectionVersion: string | null;

  @Column({
    name: 'index_schema_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  indexSchemaVersion: string | null;

  @Column({
    name: 'chunking_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  chunkingVersion: string | null;

  @Column({
    name: 'normalization_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  normalizationVersion: string | null;

  /** PostgreSQL uuid[] of deterministic Qdrant point IDs. */
  @Column({
    name: 'indexed_point_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'::uuid[]",
  })
  indexedPointIds: string[];

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

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

  @Column({ name: 'indexed_at', type: 'timestamptz', nullable: true })
  indexedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
