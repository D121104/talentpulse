import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

export enum CandidateAccessType {
  ONLINE_CV = 'ONLINE_CV',
  UPLOADED_CV = 'UPLOADED_CV',
}

@Entity('candidate_accesses')
@Index(['hrUserId', 'candidateUserId', 'onlineCvId'], { unique: false })
@Index(['hrUserId', 'candidateUserId', 'userCvId'], { unique: false })
export class CandidateAccess {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  @Index()
  hrUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hrUserId' })
  hrUser: User;

  @Column({ type: 'uuid' })
  @Index()
  candidateUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateUserId' })
  candidateUser: User;

  @Column({ type: 'uuid', nullable: true })
  onlineCvId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userCvId: string | null;

  @Column({
    type: 'enum',
    enum: CandidateAccessType,
    default: CandidateAccessType.ONLINE_CV,
  })
  accessType: CandidateAccessType;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  @Index()
  accessedAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
