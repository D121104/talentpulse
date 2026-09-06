import {
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
