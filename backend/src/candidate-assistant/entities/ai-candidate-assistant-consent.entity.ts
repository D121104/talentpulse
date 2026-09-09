import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
export enum CandidateAssistantConsentStatus {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
}
@Entity('ai_candidate_assistant_consents')
@Check(
  'CHK_ai_candidate_assistant_consents_status',
  "\"status\" IN ('GRANTED', 'REVOKED')",
)
@Check(
  'CHK_ai_candidate_assistant_consents_timestamps',
  '("status" = \'GRANTED\' AND "grantedAt" IS NOT NULL AND "revokedAt" IS NULL) OR ("status" = \'REVOKED\' AND "grantedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)',
)
@Index('UQ_ai_candidate_assistant_consents_id_user', ['_id', 'userId'], {
  unique: true,
})
@Index('UQ_ai_candidate_assistant_consents_active', ['userId'], {
  unique: true,
  where: '"status" = \'GRANTED\'',
})
export class AiCandidateAssistantConsent {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 80 }) consentVersion: string;
  @Column({ type: 'varchar', length: 128 }) policyHash: string;
  @Column({ type: 'varchar', length: 16 })
  status: CandidateAssistantConsentStatus;
  @Column({ type: 'timestamptz', nullable: true }) grantedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ type: 'varchar', length: 80 }) source: string;
  @Column({ type: 'jsonb', nullable: true }) sourceMetadata: Record<
    string,
    string
  > | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
