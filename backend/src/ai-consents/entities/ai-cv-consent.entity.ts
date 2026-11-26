import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiCvConsentStatus {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
}

@Entity('ai_cv_consents')
@Index('UQ_ai_cv_consents_active_scope', ['userId', 'scope'], {
  unique: true,
  where: '"status" = \'GRANTED\'',
})
export class AiCvConsent {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 80 })
  scope: string;

  @Column({ type: 'varchar', length: 80 })
  consentVersion: string;

  @Column({ type: 'varchar', length: 128 })
  policyHash: string;

  @Column({ type: 'varchar', length: 16 })
  status: AiCvConsentStatus;

  @Column({ type: 'timestamp', nullable: true })
  grantedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date;

  @Column({ type: 'varchar', length: 80 })
  source: string;

  @Column({ type: 'jsonb', nullable: true })
  sourceMetadata: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
