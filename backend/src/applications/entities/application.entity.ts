import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';

export enum ApplicationStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
  CONSIDERING = 'CONSIDERING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  cvId: string;

  @ManyToOne(() => UserCV, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cvId' })
  cv: UserCV;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Job;

  @Column({ type: 'text', nullable: true })
  coverLetter: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.PENDING,
  })
  status: ApplicationStatus;

  @Column({ type: 'jsonb', default: '[]' })
  history: {
    status: string;
    updatedAt: Date;
    updatedBy: {
      _id: string;
      email: string;
    };
  }[];

  @Column({ default: false })
  isDeleted: boolean;

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

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
