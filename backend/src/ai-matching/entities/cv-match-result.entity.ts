import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { User } from 'src/users/entities/user.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Application } from 'src/applications/entities/application.entity';

export enum CVProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('cv_match_results')
@Index(['cvId', 'jobId'], { unique: true })
@Index(['jobId', 'matchScore'])
export class CVMatchResult {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  cvId: string;

  @ManyToOne(() => UserCV, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cvId' })
  cv: UserCV;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Job;

  @Column({ type: 'uuid', nullable: true })
  applicationId: string;

  @ManyToOne(() => Application, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @Column({ type: 'float', default: 0 })
  matchScore: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  jobSourceVersion: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  scoringVersion: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  modelVersion: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  normalizationVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  components: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  compatibility: Record<string, unknown>;

  @Column({ default: false })
  degraded: boolean;

  @Column({ type: 'text', array: true, default: '{}' })
  matchedSkills: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  missingSkills: string[];

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({
    type: 'enum',
    enum: CVProcessingStatus,
    default: CVProcessingStatus.PENDING,
  })
  status: CVProcessingStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
