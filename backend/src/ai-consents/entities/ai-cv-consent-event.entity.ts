import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AiCvConsentEventType {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
}

@Entity('ai_cv_consent_events')
@Index('IDX_ai_cv_consent_events_user_scope', ['userId', 'scope', 'occurredAt'])
export class AiCvConsentEvent {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  consentId: string;

  @Column({ type: 'varchar', length: 80 })
  scope: string;

  @Column({ type: 'varchar', length: 80 })
  consentVersion: string;

  @Column({ type: 'varchar', length: 128 })
  policyHash: string;

  @Column({ type: 'varchar', length: 16 })
  eventType: AiCvConsentEventType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 80 })
  source: string;

  @Column({ type: 'jsonb', nullable: true })
  sourceMetadata: Record<string, string>;
}
