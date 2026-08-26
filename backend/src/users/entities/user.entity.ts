import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Role } from 'src/decorator/customize';

export enum PremiumPlan {
  FREE = 'FREE',
  CANDIDATE_PREMIUM = 'CANDIDATE_PREMIUM',
  HR_PREMIUM = 'HR_PREMIUM',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  role: Role;

  @Column({ default: false })
  isPremium: boolean;

  @Column({
    type: 'enum',
    enum: PremiumPlan,
    default: PremiumPlan.FREE,
  })
  premiumPlan: PremiumPlan;

  @Column({ type: 'timestamp', nullable: true })
  premiumExpiresAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date;

  @Column({ nullable: true })
  verificationToken: string;

  @Column({ type: 'timestamp', nullable: true })
  lastBoostedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  boostExpiresAt: Date;

  @Column({ default: true })
  isJobSeeking: boolean;

  @Column({ default: true })
  isJobRecommendation: boolean;

  @Column({ default: true })
  allowRecruiterSearch: boolean;

  @Column({ nullable: true })
  refreshToken: string;

  @Column({ type: 'jsonb', nullable: true })
  company: {
    _id: string;
    name: string;
    isActive?: boolean;
  };

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt: Date;

  @Column({ nullable: true })
  lockedReason: string;

  @Column({ default: true })
  isApproved: boolean;

  @Column({ type: 'jsonb', nullable: true })
  registrationCompany: {
    name: string;
    taxCode: string;
    scale: string;
  };

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
