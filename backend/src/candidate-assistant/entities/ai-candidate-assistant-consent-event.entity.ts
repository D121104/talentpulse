import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CandidateAssistantConsentStatus } from './ai-candidate-assistant-consent.entity';
@Entity('ai_candidate_assistant_consent_events')
@Check(
  'CHK_ai_candidate_assistant_consent_events_type',
  "\"eventType\" IN ('GRANTED', 'REVOKED')",
)
@Index('IDX_ai_candidate_assistant_consent_events_consent', ['consentId'])
@Index('IDX_ai_candidate_assistant_consent_events_user_occurred', [
  'userId',
  'occurredAt',
])
export class AiCandidateAssistantConsentEvent {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid', nullable: true }) consentId: string | null;
  @Column({ type: 'varchar', length: 80 }) consentVersion: string;
  @Column({ type: 'varchar', length: 128 }) policyHash: string;
  @Column({ type: 'varchar', length: 16 })
  eventType: CandidateAssistantConsentStatus;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  occurredAt: Date;
  @Column({ type: 'varchar', length: 80 }) source: string;
  @Column({ type: 'jsonb', nullable: true }) sourceMetadata: Record<
    string,
    string
  > | null;
}
