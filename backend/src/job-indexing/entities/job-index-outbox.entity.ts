import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  JobIndexOutboxEventType,
  JobIndexOutboxStatus,
} from '../job-indexing.types';

@Entity('job_index_outbox')
@Index(
  'UQ_job_index_outbox_event',
  ['aggregateId', 'sourceVersion', 'eventType'],
  { unique: true },
)
@Index('IDX_job_index_outbox_claim', ['status', 'availableAt', 'leaseUntil'])
export class JobIndexOutbox {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column('uuid') aggregateId: string;
  @Column({ type: 'varchar', length: 40 }) aggregateType: 'JOB';
  @Column({ type: 'varchar', length: 40 }) eventType: JobIndexOutboxEventType;
  @Column({ type: 'varchar', length: 128 }) sourceVersion: string;
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: JobIndexOutboxStatus;
  @Column({ type: 'int', default: 0 }) attemptCount: number;
  @Column({ type: 'timestamptz', default: () => 'now()' }) availableAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null;
  @Column({ type: 'uuid', nullable: true }) leaseToken: string | null;
  @Column({ type: 'timestamptz', nullable: true }) claimedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
