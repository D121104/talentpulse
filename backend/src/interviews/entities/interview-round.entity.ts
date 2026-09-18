import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  VersionColumn,
  Index,
} from 'typeorm';
import { Application } from 'src/applications/entities/application.entity';
import { Company } from 'src/companies/entities/company.entity';
import { InterviewParticipant } from './interview-participant.entity';

export enum InterviewRoundType {
  TECHNICAL = 'TECHNICAL',
  HR = 'HR',
  CULTURE = 'CULTURE',
  FINAL = 'FINAL',
}

export enum InterviewRoundStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  RESCHEDULED = 'RESCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum InterviewResult {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  ON_HOLD = 'ON_HOLD',
}

@Entity('interview_rounds')
@Index(['companyId', 'scheduledAt', 'scheduledEndAt'])
export class InterviewRound {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @Column({ type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'int', default: 1 })
  roundNumber: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: InterviewRoundType,
    default: InterviewRoundType.TECHNICAL,
  })
  roundType: InterviewRoundType;

  @Column({
    type: 'enum',
    enum: InterviewRoundStatus,
    default: InterviewRoundStatus.PENDING_CONFIRMATION,
  })
  status: InterviewRoundStatus;

  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz' })
  scheduledEndAt: Date;

  @Column({ type: 'int', default: 60 })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  roomId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  roomPassword?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  meetingLink?: string;

  @Column({ type: 'text', nullable: true })
  location?: string;

  @Column({ type: 'boolean', default: true })
  isOnline: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    type: 'enum',
    enum: InterviewResult,
    default: InterviewResult.PENDING,
  })
  result: InterviewResult;

  @Column({ type: 'text', nullable: true })
  candidateFeedback?: string;

  @Column({ type: 'text', nullable: true })
  interviewerFeedback?: string;

  @Column({ type: 'int', nullable: true })
  score?: number;

  @Column({ type: 'timestamptz', nullable: true })
  inviteSentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declinedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt?: Date;

  @OneToMany(() => InterviewParticipant, (p) => p.round, { cascade: true })
  participants: InterviewParticipant[];

  @VersionColumn({ default: 1 })
  version: number;

  @Column({ default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  createdBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  updatedBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  deletedBy: {
    _id: string;
    email: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
