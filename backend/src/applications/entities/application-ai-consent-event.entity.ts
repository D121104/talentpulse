import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('application_ai_consent_events')
@Check(
  'CHK_application_ai_consent_events_snapshot',
  'NOT "granted" OR ("consentVersion" IS NOT NULL AND "policyHash" IS NOT NULL)',
)
@Index('IDX_application_ai_consent_events_application_user', [
  'applicationId',
  'userId',
])
@Index('IDX_application_ai_consent_events_application_occurred', [
  'applicationId',
  'occurredAt',
])
export class ApplicationAiConsentEvent {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) applicationId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'boolean' }) granted: boolean;
  @Column({ type: 'varchar', length: 80, nullable: true }) consentVersion:
    | string
    | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) policyHash:
    | string
    | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) source:
    | string
    | null;
  @CreateDateColumn({ type: 'timestamptz' }) occurredAt: Date;
}
